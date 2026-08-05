-- Scoped v2 governance commands. Auth user creation and passwords stay outside
-- PostgreSQL: the server-only Admin Auth adapter calls finalize after creating
-- the synthetic-alias Auth user. No secret is accepted, stored, or returned here.

create type public.member_credential_state as enum ('PROVISIONING', 'INITIAL_CHANGE_REQUIRED', 'ACTIVE', 'EXPIRED', 'FAILED');

create table public.member_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.club_members(id) on delete restrict,
  username text not null unique check (username = lower(btrim(username)) and username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  auth_user_id uuid unique references public.profiles(user_id) on delete restrict,
  state public.member_credential_state not null default 'PROVISIONING',
  provisioning_correlation_id uuid not null unique,
  temporary_credential_expires_at timestamptz,
  initial_password_change_token_hash bytea,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((state = 'INITIAL_CHANGE_REQUIRED') = (temporary_credential_expires_at is not null)),
  check ((state = 'INITIAL_CHANGE_REQUIRED') = (auth_user_id is not null))
);
create trigger member_credentials_updated_at before update on public.member_credentials
for each row execute function public.set_updated_at();
alter table public.member_credentials enable row level security;

create or replace function public.actor_is_system_admin(actor_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = actor_id and ra.role = 'SYSTEM_ADMIN'::public.canonical_role
      and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
  )
$$;

create or replace function public.require_v2_director(actor_id uuid, target_club_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.actor_has_v2_club_governance(actor_id, target_club_id) then
    raise exception 'only the active scoped club director may manage v2 membership' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_unit(target_club_id uuid, name_input text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); result_id uuid;
begin
  perform public.require_v2_director(actor_id, target_club_id);
  if char_length(btrim(coalesce(name_input, ''))) not between 1 and 160 then
    raise exception 'unit name is invalid' using errcode = '23514';
  end if;
  insert into public.units (club_id, name) values (target_club_id, btrim(name_input)) returning id into result_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'unit.created', 'unit', result_id, '{}'::jsonb);
  return result_id;
end;
$$;

create or replace function public.begin_member_provisioning(
  target_club_id uuid, full_name_input text, date_of_birth_input date, target_unit_id uuid,
  username_input text, staff_role_input public.canonical_role default null,
  correlation_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); member_id uuid; credential public.member_credentials;
begin
  perform public.require_v2_director(actor_id, target_club_id);
  if char_length(btrim(coalesce(full_name_input, ''))) not between 1 and 120
     or date_of_birth_input is null or date_of_birth_input > current_date or date_of_birth_input < date '1900-01-01' then
    raise exception 'member name or date of birth is invalid' using errcode = '23514';
  end if;
  if not exists (select 1 from public.units where id = target_unit_id and club_id = target_club_id) then
    raise exception 'member unit is outside the scoped club' using errcode = '23514';
  end if;
  if staff_role_input is not null and staff_role_input not in ('INSTRUCTOR'::public.canonical_role, 'COUNSELOR'::public.canonical_role) then
    raise exception 'only INSTRUCTOR or COUNSELOR staff roles are permitted' using errcode = '23514';
  end if;
  select * into credential from public.member_credentials where provisioning_correlation_id = correlation_id for update;
  if found then
    select id into member_id from public.club_members where id = credential.member_id and club_id = target_club_id;
    if member_id is null then raise exception 'provisioning correlation is outside the scoped club' using errcode = '42501'; end if;
    return jsonb_build_object('memberId', member_id, 'credentialId', credential.id, 'username', credential.username, 'correlationId', correlation_id);
  end if;
  insert into public.club_members (club_id, full_name, date_of_birth, lifecycle)
  values (target_club_id, btrim(full_name_input), date_of_birth_input, 'ACTIVE') returning id into member_id;
  insert into public.member_unit_assignments (member_id, unit_id, assigned_by) values (member_id, target_unit_id, actor_id);
  if staff_role_input is not null then
    if public.member_condition_at(member_id) <> 'LEADER'::public.member_condition then
      raise exception 'staff assignments require a Leader member' using errcode = '23514';
    end if;
    insert into public.staff_unit_assignments (member_id, unit_id, role, assigned_by)
    values (member_id, target_unit_id, staff_role_input, actor_id);
  end if;
  insert into public.member_credentials (member_id, username, provisioning_correlation_id)
  values (member_id, lower(btrim(username_input)), correlation_id) returning * into credential;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.provisioning_started', 'club_member', member_id,
          jsonb_build_object('credentialId', credential.id, 'staffRole', staff_role_input, 'unitId', target_unit_id));
  return jsonb_build_object('memberId', member_id, 'credentialId', credential.id, 'username', credential.username, 'correlationId', correlation_id);
end;
$$;

create or replace function public.finalize_member_provisioning(correlation_id uuid, auth_user_id_input uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); credential public.member_credentials; target_club_id uuid;
begin
  select mc.* into credential from public.member_credentials mc
  where mc.provisioning_correlation_id = correlation_id for update;
  if not found then raise exception 'provisioning intent does not exist' using errcode = '23514'; end if;
  target_club_id := (select club_id from public.club_members where id = credential.member_id);
  perform public.require_v2_director(actor_id, target_club_id);
  if credential.state = 'INITIAL_CHANGE_REQUIRED' and credential.auth_user_id = auth_user_id_input then return credential.member_id; end if;
  if credential.state <> 'PROVISIONING' then
    raise exception 'provisioning intent cannot be finalized' using errcode = '23514';
  end if;
  insert into public.profiles (user_id, display_name)
  select auth_user_id_input, full_name from public.club_members where id = credential.member_id
  on conflict (user_id) do nothing;
  update public.club_members set user_id = auth_user_id_input where id = credential.member_id;
  update public.member_credentials set auth_user_id = auth_user_id_input, state = 'INITIAL_CHANGE_REQUIRED', finalized_at = now(), temporary_credential_expires_at = now() + interval '24 hours'
  where id = credential.id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.provisioning_finalized', 'club_member', credential.member_id, jsonb_build_object('credentialId', credential.id));
  return credential.member_id;
end;
$$;

-- The one-time token is generated and held only by the server adapter in an
-- HttpOnly cookie. The database retains its digest solely until the password
-- update succeeds; clients cannot complete the gate by calling this RPC alone.
create or replace function public.complete_initial_password_change(change_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); credential public.member_credentials; target_club_id uuid;
begin
  select mc.* into credential from public.member_credentials mc
  where mc.auth_user_id = actor_id for update;
  if not found or credential.state <> 'INITIAL_CHANGE_REQUIRED'
     or credential.temporary_credential_expires_at <= now()
     or credential.initial_password_change_token_hash is null
     or credential.initial_password_change_token_hash <> digest(change_token, 'sha256') then
    raise exception 'initial credential cannot be completed' using errcode = '42501';
  end if;
  update public.member_credentials
  set state = 'ACTIVE', temporary_credential_expires_at = null, initial_password_change_token_hash = null
  where id = credential.id;
  select club_id into target_club_id from public.club_members where id = credential.member_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.initial_password_changed', 'club_member', credential.member_id,
          jsonb_build_object('credentialId', credential.id));
end;
$$;

create or replace function public.credential_gate_status()
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case
    when exists (
      select 1 from public.member_credentials mc
      join public.club_members m on m.id = mc.member_id
      where mc.auth_user_id = auth.uid() and m.lifecycle = 'ACTIVE'
        and (mc.state = 'ACTIVE' or (mc.state = 'INITIAL_CHANGE_REQUIRED' and mc.temporary_credential_expires_at > now()))
    ) then case when exists (select 1 from public.member_credentials where auth_user_id = auth.uid() and state = 'INITIAL_CHANGE_REQUIRED') then 'CHANGE_PASSWORD' else 'ALLOW' end
    when exists (select 1 from public.club_members where user_id = auth.uid()) then 'DENY'
    else 'ALLOW'
  end
$$;

create or replace function public.reset_member_credential(target_member_id uuid, correlation_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid; credential public.member_credentials;
begin
  select club_id into target_club_id from public.club_members where id = target_member_id and lifecycle = 'ACTIVE' for update;
  if target_club_id is null then raise exception 'active member does not exist' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  update public.member_credentials set state = 'PROVISIONING', auth_user_id = null, temporary_credential_expires_at = null, finalized_at = null, provisioning_correlation_id = correlation_id
  where member_id = target_member_id returning * into credential;
  if not found then raise exception 'member credential does not exist' using errcode = '23514'; end if;
  update public.club_members set user_id = null where id = target_member_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.credential_reset_started', 'club_member', target_member_id, jsonb_build_object('credentialId', credential.id));
  return jsonb_build_object('memberId', target_member_id, 'credentialId', credential.id, 'username', credential.username, 'correlationId', correlation_id);
end;
$$;

create or replace function public.transfer_member_unit(target_member_id uuid, target_unit_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid; assignment_id uuid;
begin
  select club_id into target_club_id from public.club_members where id = target_member_id and lifecycle = 'ACTIVE' for update;
  if target_club_id is null or not exists (select 1 from public.units where id = target_unit_id and club_id = target_club_id) then raise exception 'active member and unit must share a club' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  update public.member_unit_assignments set ended_at = clock_timestamp() where member_id = target_member_id and ended_at is null;
  insert into public.member_unit_assignments (member_id, unit_id, assigned_by) values (target_member_id, target_unit_id, actor_id) returning id into assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'member.unit_transferred', 'member_unit_assignment', assignment_id, jsonb_build_object('memberId', target_member_id, 'unitId', target_unit_id));
  return assignment_id;
end;
$$;

create or replace function public.assign_staff_unit(target_member_id uuid, target_unit_id uuid, role_input public.canonical_role)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid; assignment_id uuid;
begin
  if role_input not in ('INSTRUCTOR'::public.canonical_role, 'COUNSELOR'::public.canonical_role) then raise exception 'only INSTRUCTOR or COUNSELOR staff roles are permitted' using errcode = '23514'; end if;
  select club_id into target_club_id from public.club_members where id = target_member_id and lifecycle = 'ACTIVE';
  if target_club_id is null or not exists (select 1 from public.units where id = target_unit_id and club_id = target_club_id) then raise exception 'active staff member and unit must share a club' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  if public.member_condition_at(target_member_id) <> 'LEADER'::public.member_condition then raise exception 'staff assignments require a Leader member' using errcode = '23514'; end if;
  insert into public.staff_unit_assignments (member_id, unit_id, role, assigned_by) values (target_member_id, target_unit_id, role_input, actor_id) returning id into assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'staff.unit_assigned', 'staff_unit_assignment', assignment_id, jsonb_build_object('memberId', target_member_id, 'unitId', target_unit_id, 'role', role_input));
  return assignment_id;
end;
$$;

create or replace function public.revoke_staff_unit(target_assignment_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid;
begin
  select m.club_id into target_club_id from public.staff_unit_assignments s join public.club_members m on m.id = s.member_id where s.id = target_assignment_id and s.ended_at is null for update;
  if target_club_id is null then raise exception 'active staff assignment does not exist' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  update public.staff_unit_assignments set ended_at = clock_timestamp() where id = target_assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id) values (target_club_id, actor_id, 'staff.unit_revoked', 'staff_unit_assignment', target_assignment_id);
  return target_assignment_id;
end;
$$;

create or replace function public.withdraw_member(target_member_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid;
begin
  select club_id into target_club_id from public.club_members where id = target_member_id and lifecycle = 'ACTIVE' for update;
  if target_club_id is null then raise exception 'active member does not exist' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  if exists (select 1 from public.club_director_assignments where club_id = target_club_id and member_id = target_member_id and active_until is null) then raise exception 'rotate the active director before withdrawal' using errcode = '23514'; end if;
  update public.staff_unit_assignments set ended_at = clock_timestamp() where member_id = target_member_id and ended_at is null;
  update public.member_unit_assignments set ended_at = clock_timestamp() where member_id = target_member_id and ended_at is null;
  update public.club_members set lifecycle = 'WITHDRAWN', withdrawn_at = now() where id = target_member_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id) values (target_club_id, actor_id, 'member.withdrawn', 'club_member', target_member_id);
  return target_member_id;
end;
$$;

create or replace function public.rotate_club_director(target_club_id uuid, successor_member_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); outgoing_member_id uuid; assignment_id uuid;
begin
  if not public.actor_is_system_admin(actor_id) then raise exception 'only a system administrator may rotate a club director' using errcode = '42501'; end if;
  perform 1 from public.clubs where id = target_club_id for update;
  if not found then raise exception 'club does not exist' using errcode = '23514'; end if;
  select member_id into outgoing_member_id from public.club_director_assignments where club_id = target_club_id and active_until is null for update;
  if outgoing_member_id is null then raise exception 'club has no active director to rotate' using errcode = '23514'; end if;
  if successor_member_id = outgoing_member_id or not exists (select 1 from public.club_members where id = successor_member_id and club_id = target_club_id and lifecycle = 'ACTIVE' and public.member_condition_at(id) = 'LEADER'::public.member_condition) then raise exception 'successor must be a different active Leader in the club' using errcode = '23514'; end if;
  update public.club_director_assignments set active_until = clock_timestamp() where club_id = target_club_id and active_until is null;
  update public.staff_unit_assignments set ended_at = clock_timestamp() where member_id = outgoing_member_id and ended_at is null;
  insert into public.club_director_assignments (club_id, member_id, assigned_by) values (target_club_id, successor_member_id, actor_id) returning id into assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'club.director_rotated', 'club_director_assignment', assignment_id, jsonb_build_object('outgoingMemberId', outgoing_member_id, 'successorMemberId', successor_member_id));
  return assignment_id;
end;
$$;

revoke all on table public.member_credentials from public, anon, authenticated;
revoke all on function public.actor_is_system_admin(uuid), public.require_v2_director(uuid, uuid) from public, anon, authenticated;
grant select, insert, update on public.member_credentials, public.units to pathfinders_scoped_command_owner;
grant select, insert on public.profiles to pathfinders_scoped_command_owner;
grant execute on function public.actor_is_system_admin(uuid), public.require_v2_director(uuid, uuid) to pathfinders_scoped_command_owner;

-- CREATE is needed only while ownership is transferred, then removed again.
grant usage, create on schema public to pathfinders_scoped_command_owner;
alter function public.create_unit(uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.begin_member_provisioning(uuid, text, date, uuid, text, public.canonical_role, uuid) owner to pathfinders_scoped_command_owner;
alter function public.finalize_member_provisioning(uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.complete_initial_password_change(text) owner to pathfinders_scoped_command_owner;
alter function public.credential_gate_status() owner to pathfinders_scoped_command_owner;
alter function public.reset_member_credential(uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.transfer_member_unit(uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.assign_staff_unit(uuid, uuid, public.canonical_role) owner to pathfinders_scoped_command_owner;
alter function public.revoke_staff_unit(uuid) owner to pathfinders_scoped_command_owner;
alter function public.withdraw_member(uuid) owner to pathfinders_scoped_command_owner;
alter function public.rotate_club_director(uuid, uuid) owner to pathfinders_scoped_command_owner;
revoke all on function public.create_unit(uuid, text), public.begin_member_provisioning(uuid, text, date, uuid, text, public.canonical_role, uuid), public.finalize_member_provisioning(uuid, uuid), public.complete_initial_password_change(text), public.credential_gate_status(), public.reset_member_credential(uuid, uuid), public.transfer_member_unit(uuid, uuid), public.assign_staff_unit(uuid, uuid, public.canonical_role), public.revoke_staff_unit(uuid), public.withdraw_member(uuid), public.rotate_club_director(uuid, uuid) from public, anon;
grant execute on function public.create_unit(uuid, text), public.begin_member_provisioning(uuid, text, date, uuid, text, public.canonical_role, uuid), public.finalize_member_provisioning(uuid, uuid), public.reset_member_credential(uuid, uuid), public.transfer_member_unit(uuid, uuid), public.assign_staff_unit(uuid, uuid, public.canonical_role), public.revoke_staff_unit(uuid), public.withdraw_member(uuid), public.rotate_club_director(uuid, uuid) to authenticated;
grant execute on function public.complete_initial_password_change(text), public.credential_gate_status() to authenticated;
revoke create on schema public from pathfinders_scoped_command_owner;

-- Audit the derived Pathfinder -> Leader transition at the same club-local
-- evaluation point used by staff and director eligibility commands. The unique
-- constraint in 033 makes repeated or concurrent observations idempotent.

create or replace function public.record_member_condition_transition(
  target_member_id uuid,
  observed_at_input timestamptz default now()
) returns public.member_condition
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare condition_at_observation public.member_condition;
begin
  select public.member_condition_at(target_member_id, observed_at_input)
  into condition_at_observation;
  if condition_at_observation is null then
    raise exception 'member does not exist' using errcode = '23514';
  end if;

  if condition_at_observation = 'LEADER'::public.member_condition then
    insert into public.member_condition_audit (member_id, condition, observed_at, reason)
    values (target_member_id, 'LEADER'::public.member_condition, observed_at_input, 'club_timezone_sixteenth_birthday')
    on conflict (member_id, condition) do nothing;
  end if;
  return condition_at_observation;
end;
$$;

-- This command is intentionally unavailable to browser roles. Commands that
-- require Leader eligibility call the same writer below, so no direct table DML
-- is needed from a client and each transition is recorded exactly once.
create or replace function public.evaluate_member_condition(target_member_id uuid)
returns public.member_condition
language sql security definer
set search_path = pg_catalog, public, pg_temp
as $$ select public.record_member_condition_transition(target_member_id, now()) $$;

create or replace function public.enforce_club_director_assignment()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.club_members m
    where m.id = new.member_id
      and m.club_id = new.club_id
      and m.lifecycle = 'ACTIVE'
      and public.record_member_condition_transition(m.id, now()) = 'LEADER'::public.member_condition
  ) then
    raise exception 'club directors require an active Leader in their club' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_staff_unit_assignment()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.club_members m
    join public.units u on u.id = new.unit_id
    where m.id = new.member_id
      and m.club_id = u.club_id
      and m.lifecycle = 'ACTIVE'
      and public.record_member_condition_transition(m.id, now()) = 'LEADER'::public.member_condition
  ) then
    raise exception 'staff assignments require an active Leader in the unit club' using errcode = '23514';
  end if;
  return new;
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
     or date_of_birth_input is null or date_of_birth_input > current_date or date_of_birth_input < date '1900-01-01' then raise exception 'member name or date of birth is invalid' using errcode = '23514'; end if;
  if not exists (select 1 from public.units where id = target_unit_id and club_id = target_club_id) then raise exception 'member unit is outside the scoped club' using errcode = '23514'; end if;
  if staff_role_input is not null and staff_role_input not in ('INSTRUCTOR'::public.canonical_role, 'COUNSELOR'::public.canonical_role) then raise exception 'only INSTRUCTOR or COUNSELOR staff roles are permitted' using errcode = '23514'; end if;
  select * into credential from public.member_credentials where provisioning_correlation_id = correlation_id for update;
  if found then
    select id into member_id from public.club_members where id = credential.member_id and club_id = target_club_id;
    if member_id is null then raise exception 'provisioning correlation is outside the scoped club' using errcode = '42501'; end if;
    return jsonb_build_object('memberId', member_id, 'credentialId', credential.id, 'username', credential.username, 'correlationId', correlation_id);
  end if;
  insert into public.club_members (club_id, full_name, date_of_birth, lifecycle) values (target_club_id, btrim(full_name_input), date_of_birth_input, 'ACTIVE') returning id into member_id;
  insert into public.member_unit_assignments (member_id, unit_id, assigned_by) values (member_id, target_unit_id, actor_id);
  if staff_role_input is not null then
    if public.record_member_condition_transition(member_id, now()) <> 'LEADER'::public.member_condition then raise exception 'staff assignments require a Leader member' using errcode = '23514'; end if;
    insert into public.staff_unit_assignments (member_id, unit_id, role, assigned_by) values (member_id, target_unit_id, staff_role_input, actor_id);
  end if;
  insert into public.member_credentials (member_id, username, provisioning_correlation_id) values (member_id, lower(btrim(username_input)), correlation_id) returning * into credential;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'member.provisioning_started', 'club_member', member_id, jsonb_build_object('credentialId', credential.id, 'staffRole', staff_role_input, 'unitId', target_unit_id));
  return jsonb_build_object('memberId', member_id, 'credentialId', credential.id, 'username', credential.username, 'correlationId', correlation_id);
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
  if public.record_member_condition_transition(target_member_id, now()) <> 'LEADER'::public.member_condition then raise exception 'staff assignments require a Leader member' using errcode = '23514'; end if;
  insert into public.staff_unit_assignments (member_id, unit_id, role, assigned_by) values (target_member_id, target_unit_id, role_input, actor_id) returning id into assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'staff.unit_assigned', 'staff_unit_assignment', assignment_id, jsonb_build_object('memberId', target_member_id, 'unitId', target_unit_id, 'role', role_input));
  return assignment_id;
end;
$$;

-- PostgreSQL requires the incoming function owner to hold CREATE on its schema
-- while ownership changes. Revoke it again immediately after the transfer.
grant usage, create on schema public to pathfinders_scoped_command_owner;
alter function public.record_member_condition_transition(uuid, timestamptz) owner to pathfinders_scoped_command_owner;
alter function public.evaluate_member_condition(uuid) owner to pathfinders_scoped_command_owner;
alter function public.begin_member_provisioning(uuid, text, date, uuid, text, public.canonical_role, uuid) owner to pathfinders_scoped_command_owner;
alter function public.assign_staff_unit(uuid, uuid, public.canonical_role) owner to pathfinders_scoped_command_owner;
revoke all on function public.record_member_condition_transition(uuid, timestamptz), public.evaluate_member_condition(uuid) from public, anon, authenticated;
grant execute on function public.record_member_condition_transition(uuid, timestamptz), public.evaluate_member_condition(uuid) to pathfinders_scoped_command_owner;
revoke create on schema public from pathfinders_scoped_command_owner;

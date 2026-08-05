-- Final v2 operational surface. Legacy role rows remain historical data, but
-- cannot grant access or be created as new operational assignments.

create or replace function public.remediate_member(
  target_member_id uuid, full_name_input text, date_of_birth_input date, target_unit_id uuid
) returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); target_club_id uuid; assignment_id uuid;
begin
  select club_id into target_club_id from public.club_members where id = target_member_id and lifecycle = 'PENDING_REMEDIATION' for update;
  if target_club_id is null then raise exception 'pending member does not exist' using errcode = '23514'; end if;
  perform public.require_v2_director(actor_id, target_club_id);
  if char_length(btrim(coalesce(full_name_input, ''))) not between 1 and 120 or date_of_birth_input is null or date_of_birth_input > current_date or date_of_birth_input < date '1900-01-01' then
    raise exception 'member name or date of birth is invalid' using errcode = '23514';
  end if;
  if not exists (select 1 from public.units where id = target_unit_id and club_id = target_club_id) then raise exception 'member unit is outside the scoped club' using errcode = '23514'; end if;
  update public.member_unit_assignments set ended_at = clock_timestamp() where member_id = target_member_id and ended_at is null;
  insert into public.member_unit_assignments (member_id, unit_id, assigned_by) values (target_member_id, target_unit_id, actor_id) returning id into assignment_id;
  update public.club_members set full_name = btrim(full_name_input), date_of_birth = date_of_birth_input, lifecycle = 'ACTIVE' where id = target_member_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.remediated', 'club_member', target_member_id, jsonb_build_object('unitId', target_unit_id, 'assignmentId', assignment_id));
  return target_member_id;
end;
$$;

create or replace function public.rotate_club_director(target_club_id uuid, successor_member_id uuid, reason_input text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); outgoing_member_id uuid; assignment_id uuid;
begin
  if char_length(btrim(coalesce(reason_input, ''))) not between 3 and 500 then raise exception 'a rotation reason is required' using errcode = '23514'; end if;
  if not public.actor_is_system_admin(actor_id) then raise exception 'only a system administrator may rotate a club director' using errcode = '42501'; end if;
  perform 1 from public.clubs where id = target_club_id for update;
  if not found then raise exception 'club does not exist' using errcode = '23514'; end if;
  select member_id into outgoing_member_id from public.club_director_assignments where club_id = target_club_id and active_until is null for update;
  if outgoing_member_id is null then raise exception 'club has no active director to rotate' using errcode = '23514'; end if;
  if successor_member_id = outgoing_member_id or not exists (select 1 from public.club_members where id = successor_member_id and club_id = target_club_id and lifecycle = 'ACTIVE' and public.member_condition_at(id) = 'LEADER'::public.member_condition) then raise exception 'successor must be a different active Leader in the club' using errcode = '23514'; end if;
  update public.club_director_assignments set active_until = clock_timestamp() where club_id = target_club_id and active_until is null;
  update public.staff_unit_assignments set ended_at = clock_timestamp() where member_id = outgoing_member_id and ended_at is null;
  insert into public.club_director_assignments (club_id, member_id, assigned_by) values (target_club_id, successor_member_id, actor_id) returning id into assignment_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata) values (target_club_id, actor_id, 'club.director_rotated', 'club_director_assignment', assignment_id, jsonb_build_object('outgoingMemberId', outgoing_member_id, 'successorMemberId', successor_member_id, 'reason', btrim(reason_input)));
  return assignment_id;
end;
$$;

create or replace function public.list_club_rotation_metadata()
returns table (club_id uuid, club_name text, director_member_id uuid, director_name text, successor_member_id uuid, successor_name text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select c.id, c.name, d.member_id, outgoing.full_name, successor.id, successor.full_name
  from public.clubs c
  join public.club_director_assignments d on d.club_id = c.id and d.active_until is null
  join public.club_members outgoing on outgoing.id = d.member_id
  left join public.club_members successor on successor.club_id = c.id and successor.lifecycle = 'ACTIVE' and successor.id <> d.member_id and public.member_condition_at(successor.id) = 'LEADER'::public.member_condition
  where public.actor_is_system_admin(public.request_actor_id())
  order by c.name, successor.full_name;
$$;

-- Directors need lifecycle remediation visibility within their own club; staff
-- continue to receive only active, unit-scoped records.
drop policy if exists "v2 actors read scoped members" on public.club_members;
create policy "v2 actors read scoped members" on public.club_members for select using (
  public.actor_can_access_v2_member(auth.uid(), id)
  or public.actor_has_v2_club_governance(auth.uid(), club_id)
);

-- Do not erase legacy records: close their authority windows and prohibit new
-- guardian/evaluator grants at the command boundary.
update public.role_assignments set revoked_at = coalesce(revoked_at, clock_timestamp())
where role in ('GUARDIAN'::public.canonical_role, 'EVALUATOR'::public.canonical_role);
create or replace function public.assign_role(target_user_id uuid, role_input public.canonical_role, target_club_id uuid default null, target_unit_id uuid default null, target_student_id uuid default null, target_assessment_id uuid default null, target_organization_id uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if role_input in ('GUARDIAN'::public.canonical_role, 'EVALUATOR'::public.canonical_role) then raise exception 'retired roles cannot be assigned' using errcode = '23514'; end if;
  raise exception 'legacy role assignment is retired; use v2 membership commands' using errcode = '42501';
end;
$$;

grant usage, create on schema public to pathfinders_scoped_command_owner;
alter function public.remediate_member(uuid, text, date, uuid) owner to pathfinders_scoped_command_owner;
alter function public.rotate_club_director(uuid, uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.list_club_rotation_metadata() owner to pathfinders_scoped_command_owner;
revoke all on function public.remediate_member(uuid, text, date, uuid), public.rotate_club_director(uuid, uuid, text), public.list_club_rotation_metadata() from public, anon;
grant execute on function public.remediate_member(uuid, text, date, uuid), public.rotate_club_director(uuid, uuid, text), public.list_club_rotation_metadata() to authenticated;
revoke create on schema public from pathfinders_scoped_command_owner;

-- Canonical authorization is additive and forward-only. Legacy memberships stay
-- intact for history/read compatibility, but no legacy role is an authority after
-- this migration (notably, viewer is deliberately never mapped).
create type public.canonical_role as enum (
  'SYSTEM_ADMIN', 'CLUB_DIRECTOR', 'INSTRUCTOR', 'COUNSELOR',
  'PATHFINDER', 'GUARDIAN', 'EVALUATOR'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (club_id, name)
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.canonical_role not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (active_until is null or active_until > active_from),
  check (
    (role = 'SYSTEM_ADMIN' and organization_id is not null and club_id is null and unit_id is null and student_id is null and assessment_id is null)
    or (role = 'CLUB_DIRECTOR' and club_id is not null and unit_id is null and student_id is null and assessment_id is null)
    or (role = 'INSTRUCTOR' and club_id is not null and unit_id is null and student_id is null and assessment_id is null)
    or (role = 'COUNSELOR' and unit_id is not null and club_id is null and student_id is null and assessment_id is null)
    or (role in ('PATHFINDER', 'GUARDIAN') and student_id is not null and club_id is null and unit_id is null and assessment_id is null)
    or (role = 'EVALUATOR' and assessment_id is not null and club_id is null and unit_id is null and student_id is null)
  )
);
create unique index role_assignments_active_scope_key on public.role_assignments
  (user_id, role, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'), coalesce(club_id, '00000000-0000-0000-0000-000000000000'), coalesce(unit_id, '00000000-0000-0000-0000-000000000000'), coalesce(student_id, '00000000-0000-0000-0000-000000000000'), coalesce(assessment_id, '00000000-0000-0000-0000-000000000000'))
  where revoked_at is null;
create index role_assignments_active_user_idx on public.role_assignments(user_id, role) where revoked_at is null;
create index units_club_id_idx on public.units(club_id);

create table public.role_assignment_migration_ledger (
  membership_club_id uuid not null,
  membership_user_id uuid not null,
  legacy_role public.club_role not null,
  canonical_assignment_id uuid references public.role_assignments(id) on delete set null,
  outcome text not null check (outcome in ('migrated', 'retired')),
  created_at timestamptz not null default now(),
  primary key (membership_club_id, membership_user_id)
);

-- Every legacy administrator is explicitly made a club director, never a system
-- administrator. Viewer is retained as historical data only and produces no row.
insert into public.role_assignments (user_id, role, club_id)
select m.user_id,
       case m.role when 'admin' then 'CLUB_DIRECTOR'::public.canonical_role when 'instructor' then 'INSTRUCTOR'::public.canonical_role end,
       m.club_id
from public.memberships m
where m.role in ('admin', 'instructor')
on conflict do nothing;

insert into public.role_assignments (user_id, role, student_id)
select s.guardian_user_id, 'GUARDIAN', s.id from public.students s where s.guardian_user_id is not null
on conflict do nothing;
insert into public.role_assignments (user_id, role, student_id)
select s.student_user_id, 'PATHFINDER', s.id from public.students s where s.student_user_id is not null
on conflict do nothing;

insert into public.role_assignment_migration_ledger (membership_club_id, membership_user_id, legacy_role, canonical_assignment_id, outcome)
select m.club_id, m.user_id, m.role, ra.id,
       case when m.role = 'viewer' then 'retired' else 'migrated' end
from public.memberships m
left join public.role_assignments ra on ra.user_id = m.user_id and ra.club_id = m.club_id
  and ra.role = case m.role when 'admin' then 'CLUB_DIRECTOR'::public.canonical_role when 'instructor' then 'INSTRUCTOR'::public.canonical_role else null end
on conflict (membership_club_id, membership_user_id) do nothing;

create or replace function public.has_canonical_role_at_club(target_club_id uuid, allowed_roles public.canonical_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = auth.uid() and ra.club_id = target_club_id and ra.role = any(allowed_roles)
      and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.has_canonical_role_in_unit(target_unit_id uuid, allowed_roles public.canonical_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.role_assignments ra where ra.user_id = auth.uid() and ra.unit_id = target_unit_id
      and ra.role = any(allowed_roles) and ra.revoked_at is null and ra.active_from <= now()
      and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.has_student_link(target_student_id uuid, allowed_roles public.canonical_role[] default array['PATHFINDER','GUARDIAN']::public.canonical_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.role_assignments ra where ra.user_id = auth.uid() and ra.student_id = target_student_id
      and ra.role = any(allowed_roles) and ra.revoked_at is null and ra.active_from <= now()
      and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.can_review_progress(target_progress_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id
    where p.id = target_progress_id and public.has_canonical_role_at_club(e.club_id, array['CLUB_DIRECTOR','INSTRUCTOR']::public.canonical_role[]));
$$;
create or replace function public.can_access_evidence(target_evidence_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.evidence ev join public.requirement_progress p on p.id = ev.progress_id join public.enrollments e on e.id = p.enrollment_id
    where ev.id = target_evidence_id and (public.has_student_link(e.student_id) or public.can_review_progress(p.id)));
$$;

-- Retain the old helper signature for migrations/read paths, but resolve through
-- canonical assignments. viewer has no canonical equivalent and can never match.
create or replace function public.is_club_member(target_club_id uuid, allowed_roles public.club_role[] default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    allowed_roles is null and exists (select 1 from public.role_assignments ra where ra.user_id = auth.uid() and ra.club_id = target_club_id and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now()))
    or public.has_canonical_role_at_club(target_club_id, array_remove(array[
      case when 'admin' = any(allowed_roles) then 'CLUB_DIRECTOR'::public.canonical_role end,
      case when 'instructor' = any(allowed_roles) then 'INSTRUCTOR'::public.canonical_role end
    ], null))
  );
$$;

alter table public.role_assignments enable row level security;
alter table public.units enable row level security;
alter table public.organizations enable row level security;
create policy "users read active own assignments" on public.role_assignments for select using (user_id = auth.uid() and revoked_at is null and active_from <= now() and (active_until is null or active_until > now()));
create policy "members read scoped units" on public.units for select using (public.is_club_member(club_id));
revoke all on function public.has_canonical_role_at_club(uuid, public.canonical_role[]) from public;
revoke all on function public.has_canonical_role_in_unit(uuid, public.canonical_role[]) from public;
revoke all on function public.has_student_link(uuid, public.canonical_role[]) from public;
revoke all on function public.can_review_progress(uuid) from public;
revoke all on function public.can_access_evidence(uuid) from public;
grant execute on function public.has_canonical_role_at_club(uuid, public.canonical_role[]) to authenticated;
grant execute on function public.has_canonical_role_in_unit(uuid, public.canonical_role[]) to authenticated;
grant execute on function public.has_student_link(uuid, public.canonical_role[]) to authenticated;
grant execute on function public.can_review_progress(uuid) to authenticated;
grant execute on function public.can_access_evidence(uuid) to authenticated;

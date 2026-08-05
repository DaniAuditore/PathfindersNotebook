-- Forward-only v2 membership/unit foundation.  This migration deliberately does
-- not replace the legacy reader graph: 034/035 must reconcile and cut it over.

alter table public.clubs
  add column timezone text not null default 'Etc/UTC';

create or replace function public.validate_club_timezone()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'club timezone must be a valid IANA timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger clubs_validate_timezone
before insert or update of timezone on public.clubs
for each row execute function public.validate_club_timezone();

create type public.member_lifecycle as enum ('ACTIVE', 'PENDING_REMEDIATION', 'WITHDRAWN');
create type public.member_condition as enum ('PATHFINDER', 'LEADER');

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  user_id uuid references public.profiles(user_id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  date_of_birth date not null check (date_of_birth <= current_date and date_of_birth >= date '1900-01-01'),
  lifecycle public.member_lifecycle not null default 'ACTIVE',
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lifecycle = 'WITHDRAWN') = (withdrawn_at is not null))
);
create unique index club_members_active_user_per_club
  on public.club_members (club_id, user_id) where user_id is not null and lifecycle <> 'WITHDRAWN';
create index club_members_club_lifecycle_idx on public.club_members(club_id, lifecycle);

create table public.club_director_assignments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  member_id uuid not null references public.club_members(id) on delete restrict,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  check (active_until is null or active_until > active_from)
);
create unique index club_director_assignments_one_active_director
  on public.club_director_assignments(club_id) where active_until is null;

create table public.member_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  check (ended_at is null or ended_at > assigned_at)
);
create unique index member_unit_assignments_one_active_member
  on public.member_unit_assignments(member_id) where ended_at is null;
create index member_unit_assignments_active_unit_idx
  on public.member_unit_assignments(unit_id) where ended_at is null;

create table public.staff_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  role public.canonical_role not null check (role in ('INSTRUCTOR', 'COUNSELOR')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  check (ended_at is null or ended_at > assigned_at)
);
create unique index staff_unit_assignments_one_active_counselor_unit
  on public.staff_unit_assignments(member_id) where role = 'COUNSELOR' and ended_at is null;
create unique index staff_unit_assignments_active_role_unit
  on public.staff_unit_assignments(member_id, unit_id, role) where ended_at is null;
create index staff_unit_assignments_active_unit_idx
  on public.staff_unit_assignments(unit_id) where ended_at is null;

create table public.member_condition_audit (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete restrict,
  condition public.member_condition not null,
  observed_at timestamptz not null default now(),
  reason text not null check (char_length(trim(reason)) between 1 and 120),
  unique (member_id, condition)
);

create or replace function public.member_condition_at(target_member_id uuid, observed_at timestamptz default now())
returns public.member_condition
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select case when (timezone(c.timezone, observed_at))::date >= m.date_of_birth + interval '16 years'
              then 'LEADER'::public.member_condition else 'PATHFINDER'::public.member_condition end
  from public.club_members m join public.clubs c on c.id = m.club_id
  where m.id = target_member_id
$$;

create or replace function public.enforce_member_unit_scope()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.club_members m join public.units u on u.id = new.unit_id
    where m.id = new.member_id and m.club_id = u.club_id
  ) then
    raise exception 'member and unit must belong to the same club' using errcode = '23514';
  end if;
  return new;
end;
$$;

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
      and public.member_condition_at(m.id) = 'LEADER'::public.member_condition
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
      and public.member_condition_at(m.id) = 'LEADER'::public.member_condition
  ) then
    raise exception 'staff assignments require an active Leader in the unit club' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger member_unit_assignments_validate_scope
before insert or update of member_id, unit_id on public.member_unit_assignments
for each row execute function public.enforce_member_unit_scope();
create trigger club_director_assignments_validate_scope
before insert or update of club_id, member_id on public.club_director_assignments
for each row execute function public.enforce_club_director_assignment();
create trigger staff_unit_assignments_validate_scope
before insert or update of member_id, unit_id, role on public.staff_unit_assignments
for each row execute function public.enforce_staff_unit_assignment();
create trigger club_members_updated_at before update on public.club_members
for each row execute function public.set_updated_at();

-- V2 predicates are additive and fail closed for pending/withdrawn members.
create or replace function public.actor_is_active_v2_member(actor_id uuid, target_member_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.club_members m
    where m.id = target_member_id and m.user_id = actor_id and m.lifecycle = 'ACTIVE'
  )
$$;
create or replace function public.actor_has_active_v2_staff_unit(actor_id uuid, target_member_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.club_members target
    join public.member_unit_assignments member_unit on member_unit.member_id = target.id and member_unit.ended_at is null
    join public.staff_unit_assignments staff on staff.unit_id = member_unit.unit_id and staff.ended_at is null
    join public.club_members staff_member on staff_member.id = staff.member_id and staff_member.user_id = actor_id and staff_member.lifecycle = 'ACTIVE'
    where target.id = target_member_id and target.lifecycle = 'ACTIVE'
  )
$$;
create or replace function public.actor_has_v2_club_governance(actor_id uuid, target_club_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.club_director_assignments d
    join public.club_members m on m.id = d.member_id
    where d.club_id = target_club_id and d.active_until is null
      and m.user_id = actor_id and m.lifecycle = 'ACTIVE'
  )
$$;
create or replace function public.actor_can_access_v2_member(actor_id uuid, target_member_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.actor_is_active_v2_member(actor_id, target_member_id)
      or public.actor_has_active_v2_staff_unit(actor_id, target_member_id)
      or exists (select 1 from public.club_members m where m.id = target_member_id and m.lifecycle = 'ACTIVE' and public.actor_has_v2_club_governance(actor_id, m.club_id))
$$;

-- SYSTEM_ADMIN has governance commands in the subsequent command migration, but
-- has no v2 member/card/evidence reader branch.  Guardian/evaluator remain on
-- the legacy graph until the separately reconciled withdrawal migration.

alter table public.club_members enable row level security;
alter table public.club_director_assignments enable row level security;
alter table public.member_unit_assignments enable row level security;
alter table public.staff_unit_assignments enable row level security;
alter table public.member_condition_audit enable row level security;
create policy "v2 actors read scoped members" on public.club_members for select
  using (public.actor_can_access_v2_member(auth.uid(), id));
create policy "v2 directors read their assignments" on public.club_director_assignments for select
  using (exists (select 1 from public.club_members m where m.id = member_id and m.user_id = auth.uid() and m.lifecycle = 'ACTIVE'));
create policy "v2 actors read scoped member units" on public.member_unit_assignments for select
  using (public.actor_can_access_v2_member(auth.uid(), member_id));
create policy "v2 actors read scoped staff units" on public.staff_unit_assignments for select
  using (exists (select 1 from public.units u where u.id = unit_id and public.actor_has_v2_club_governance(auth.uid(), u.club_id))
    or exists (select 1 from public.club_members m where m.id = member_id and m.user_id = auth.uid() and m.lifecycle = 'ACTIVE'));
create policy "v2 actors read scoped condition audit" on public.member_condition_audit for select
  using (public.actor_can_access_v2_member(auth.uid(), member_id));

revoke insert, update, delete on table public.club_members, public.club_director_assignments, public.member_unit_assignments, public.staff_unit_assignments, public.member_condition_audit from public, anon, authenticated;
grant select on table public.club_members, public.club_director_assignments, public.member_unit_assignments, public.staff_unit_assignments, public.member_condition_audit to authenticated;

revoke all on function public.member_condition_at(uuid, timestamptz), public.actor_is_active_v2_member(uuid, uuid), public.actor_has_active_v2_staff_unit(uuid, uuid), public.actor_has_v2_club_governance(uuid, uuid), public.actor_can_access_v2_member(uuid, uuid) from public, anon;
grant execute on function public.member_condition_at(uuid, timestamptz), public.actor_is_active_v2_member(uuid, uuid), public.actor_has_active_v2_staff_unit(uuid, uuid), public.actor_has_v2_club_governance(uuid, uuid), public.actor_can_access_v2_member(uuid, uuid) to authenticated;

-- The non-login command owner receives only the future command surface.  No
-- browser DML or legacy guardian/evaluator access is changed in this migration.
grant select, insert, update on public.club_members, public.club_director_assignments, public.member_unit_assignments, public.staff_unit_assignments, public.member_condition_audit to pathfinders_scoped_command_owner;
grant execute on function public.member_condition_at(uuid, timestamptz), public.actor_is_active_v2_member(uuid, uuid), public.actor_has_active_v2_staff_unit(uuid, uuid), public.actor_has_v2_club_governance(uuid, uuid), public.actor_can_access_v2_member(uuid, uuid) to pathfinders_scoped_command_owner;

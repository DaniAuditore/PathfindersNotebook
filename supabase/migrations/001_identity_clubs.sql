create type public.club_role as enum ('admin', 'instructor', 'guardian', 'student', 'viewer');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role public.club_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  birth_year smallint check (birth_year between 1900 and 2100),
  guardian_user_id uuid references public.profiles (user_id) on delete set null,
  student_user_id uuid unique references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index students_club_id_idx on public.students (club_id);
create index students_guardian_user_id_idx on public.students (guardian_user_id);
create index students_student_user_id_idx on public.students (student_user_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  actor_id uuid references public.profiles (user_id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 120),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_club_created_at_idx on public.audit_log (club_id, created_at desc);

create function public.is_club_member(target_club_id uuid, allowed_roles public.club_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where club_id = target_club_id
      and user_id = auth.uid()
      and (allowed_roles is null or role = any(allowed_roles))
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_log is immutable';
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger clubs_updated_at before update on public.clubs for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger students_updated_at before update on public.students for each row execute function public.set_updated_at();
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.prevent_audit_log_mutation();

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.memberships enable row level security;
alter table public.students enable row level security;
alter table public.audit_log enable row level security;

create policy "users read own profile" on public.profiles for select using (user_id = auth.uid());
create policy "users update own profile" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read clubs" on public.clubs for select using (public.is_club_member(id));
create policy "admins update clubs" on public.clubs for update using (public.is_club_member(id, array['admin']::public.club_role[])) with check (public.is_club_member(id, array['admin']::public.club_role[]));

create policy "members read memberships" on public.memberships for select using (public.is_club_member(club_id));
create policy "admins manage memberships" on public.memberships for all using (public.is_club_member(club_id, array['admin']::public.club_role[])) with check (public.is_club_member(club_id, array['admin']::public.club_role[]));

create policy "scoped users read students" on public.students for select using (
  public.is_club_member(club_id, array['admin', 'instructor', 'viewer']::public.club_role[])
  or guardian_user_id = auth.uid()
  or student_user_id = auth.uid()
);
create policy "admins and instructors manage students" on public.students for all using (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[])) with check (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[]));

create policy "authorized actors read audit log" on public.audit_log for select using (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[]));
create policy "members insert audit log" on public.audit_log for insert with check (actor_id = auth.uid() and public.is_club_member(club_id));

revoke all on function public.is_club_member(uuid, public.club_role[]) from public;
grant execute on function public.is_club_member(uuid, public.club_role[]) to authenticated;

create type public.catalog_class_type as enum ('regular', 'advanced');
create type public.requirement_type as enum ('manual', 'file', 'link', 'text', 'checklist', 'numeric', 'compound');
create type public.completion_rule as enum ('all', 'any', 'minimum_n');

create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  class_type public.catalog_class_type not null,
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, class_type, title)
);

create table public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, version_number),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  parent_requirement_id uuid references public.requirements (id) on delete cascade,
  requirement_type public.requirement_type not null,
  title text not null check (char_length(title) between 1 and 240),
  instructions text not null default '',
  position integer not null check (position >= 0),
  optional boolean not null default false,
  requires_evidence boolean not null default false,
  evidence_types text[] not null default '{}',
  reviewer_role public.club_role not null default 'instructor',
  completion_rule public.completion_rule,
  minimum_children integer,
  allow_reuse boolean not null default false,
  weight numeric(8, 2) not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, parent_requirement_id, position),
  check ((requirement_type = 'compound' and completion_rule is not null) or (requirement_type <> 'compound' and completion_rule is null)),
  check ((completion_rule = 'minimum_n' and minimum_children is not null and minimum_children > 0) or (completion_rule is distinct from 'minimum_n' and minimum_children is null))
);

create function public.prevent_published_catalog_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  affected_version_id uuid := coalesce(new.catalog_version_id, old.catalog_version_id, new.id, old.id);
begin
  if tg_table_name = 'catalog_versions' and old.status = 'published' then
    raise exception 'published catalog versions are immutable; create a new version';
  end if;

  if tg_table_name = 'requirements' and exists (
    select 1 from public.catalog_versions where id = affected_version_id and status = 'published'
  ) then
    raise exception 'requirements of published catalog versions are immutable; create a new version';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger catalogs_updated_at before update on public.catalogs for each row execute function public.set_updated_at();
create trigger catalog_versions_updated_at before update on public.catalog_versions for each row execute function public.set_updated_at();
create trigger requirements_updated_at before update on public.requirements for each row execute function public.set_updated_at();
create trigger published_catalog_version_immutable before update or delete on public.catalog_versions for each row execute function public.prevent_published_catalog_mutation();
create trigger published_catalog_requirements_immutable before update or delete on public.requirements for each row execute function public.prevent_published_catalog_mutation();

alter table public.catalogs enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.requirements enable row level security;

create policy "members read catalogs" on public.catalogs for select using (public.is_club_member(club_id));
create policy "admins manage catalogs" on public.catalogs for all using (public.is_club_member(club_id, array['admin']::public.club_role[])) with check (public.is_club_member(club_id, array['admin']::public.club_role[]));
create policy "members read catalog versions" on public.catalog_versions for select using (exists (select 1 from public.catalogs where id = catalog_id and public.is_club_member(club_id)));
create policy "admins manage catalog versions" on public.catalog_versions for all using (exists (select 1 from public.catalogs where id = catalog_id and public.is_club_member(club_id, array['admin']::public.club_role[]))) with check (exists (select 1 from public.catalogs where id = catalog_id and public.is_club_member(club_id, array['admin']::public.club_role[])));
create policy "members read requirements" on public.requirements for select using (exists (select 1 from public.catalog_versions join public.catalogs on public.catalogs.id = public.catalog_versions.catalog_id where public.catalog_versions.id = catalog_version_id and public.is_club_member(public.catalogs.club_id)));
create policy "admins manage requirements" on public.requirements for all using (exists (select 1 from public.catalog_versions join public.catalogs on public.catalogs.id = public.catalog_versions.catalog_id where public.catalog_versions.id = catalog_version_id and public.is_club_member(public.catalogs.club_id, array['admin']::public.club_role[]))) with check (exists (select 1 from public.catalog_versions join public.catalogs on public.catalogs.id = public.catalog_versions.catalog_id where public.catalog_versions.id = catalog_version_id and public.is_club_member(public.catalogs.club_id, array['admin']::public.club_role[])));

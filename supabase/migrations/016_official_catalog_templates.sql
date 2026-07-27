-- Add the reusable official-catalog contract without rewriting or backfilling
-- any club-owned catalog or its immutable published versions.
create type public.requirement_child_role as enum ('step', 'option', 'checklist_item');
create type public.requirement_progress_mode as enum ('direct', 'derived');
create type public.requirement_completion_semantics as enum ('direct', 'all_children', 'at_least_one', 'at_least_n');

create table public.official_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text not null unique check (source_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  authority text not null check (char_length(trim(authority)) between 1 and 160),
  locale text not null check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  revision_key text not null check (char_length(trim(revision_key)) between 1 and 80),
  is_undated boolean not null default true,
  provenance text not null check (char_length(trim(provenance)) > 0),
  transcription_notes text not null default '',
  created_at timestamptz not null default now(),
  unique (authority, document_sha256, locale, revision_key)
);

create table public.class_families (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique check (family_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.class_level_templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.class_families (id) on delete restrict,
  source_id uuid not null references public.official_sources (id) on delete restrict,
  level_code text not null unique check (level_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  class_type public.catalog_class_type not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  position integer not null check (position >= 0),
  related_level_template_id uuid references public.class_level_templates (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (family_id, class_type),
  unique (family_id, position),
  check (related_level_template_id is null or related_level_template_id <> id)
);

create function public.enforce_related_class_level()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  related_level public.class_level_templates;
begin
  if new.related_level_template_id is null then
    return new;
  end if;

  select * into related_level
  from public.class_level_templates
  where id = new.related_level_template_id;

  if not found
    or related_level.family_id <> new.family_id
    or related_level.class_type = new.class_type then
    raise exception 'related class levels must be distinct regular and advanced levels in the same family'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger class_level_relationship_valid
before insert or update of family_id, class_type, related_level_template_id
on public.class_level_templates
for each row execute function public.enforce_related_class_level();

alter table public.catalogs
  add column level_template_id uuid references public.class_level_templates (id) on delete restrict,
  add column source_catalog_code text check (source_catalog_code is null or source_catalog_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$');

create unique index catalogs_club_level_template_unique
on public.catalogs (club_id, level_template_id)
where level_template_id is not null;

create unique index catalogs_club_source_code_unique
on public.catalogs (club_id, source_catalog_code)
where source_catalog_code is not null;

create function public.enforce_official_catalog_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_class_type public.catalog_class_type;
begin
  if new.level_template_id is null then
    if new.source_catalog_code is not null then
      raise exception 'official catalog code requires a level template' using errcode = '23514';
    end if;
    return new;
  end if;

  select class_type into template_class_type
  from public.class_level_templates
  where id = new.level_template_id;

  if not found or new.source_catalog_code is null or template_class_type <> new.class_type then
    raise exception 'official catalog identity must match its class level template'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger official_catalog_identity_valid
before insert or update of level_template_id, source_catalog_code, class_type
on public.catalogs
for each row execute function public.enforce_official_catalog_identity();

alter table public.catalog_versions
  add column source_revision_key text check (source_revision_key is null or char_length(trim(source_revision_key)) between 1 and 80),
  add column source_document_sha256 text check (source_document_sha256 is null or source_document_sha256 ~ '^[0-9a-f]{64}$'),
  add column provenance text check (provenance is null or char_length(trim(provenance)) > 0);

create unique index catalog_versions_source_revision_unique
on public.catalog_versions (catalog_id, source_revision_key)
where source_revision_key is not null;

create function public.enforce_official_catalog_version_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_official boolean;
begin
  select level_template_id is not null into is_official
  from public.catalogs
  where id = new.catalog_id;

  if coalesce(is_official, false)
    and (new.source_revision_key is null
      or new.source_document_sha256 is null
      or new.provenance is null) then
    raise exception 'official catalog versions require revision, source hash, and provenance'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger official_catalog_version_provenance_valid
before insert or update of catalog_id, source_revision_key, source_document_sha256, provenance
on public.catalog_versions
for each row execute function public.enforce_official_catalog_version_provenance();

create table public.catalog_sections (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  source_code text not null check (source_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, source_code),
  unique (catalog_version_id, position),
  unique (id, catalog_version_id)
);

alter table public.requirements
  drop constraint requirements_weight_check,
  drop constraint requirements_check,
  drop constraint requirements_check1;
alter table public.requirements
  add constraint requirements_weight_check check (weight >= 0),
  add constraint requirements_type_completion_check check (
    (requirement_type = 'compound' and (completion_rule is not null or progress_mode = 'derived'))
    or (requirement_type <> 'compound' and completion_rule is null)
  ),
  add constraint requirements_minimum_children_check check (
    (completion_rule = 'minimum_n' and minimum_children is not null and minimum_children > 0)
    or (completion_rule is distinct from 'minimum_n' and minimum_children is null)
  ),
  add column section_id uuid,
  add column source_code text check (source_code is null or source_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  add column child_role public.requirement_child_role,
  add column modalities text[],
  add column progress_mode public.requirement_progress_mode,
  add column completion_semantics public.requirement_completion_semantics,
  add column completion_threshold integer check (completion_threshold is null or completion_threshold > 0),
  add constraint requirements_section_same_version_fk
    foreign key (section_id, catalog_version_id)
    references public.catalog_sections (id, catalog_version_id)
    on delete restrict;

alter table public.requirements
  add constraint requirements_modalities_known check (
    modalities is null or modalities <@ array[
      'administrative', 'automatic', 'reading', 'memorization_oral',
      'written', 'participation', 'specialty', 'practical_in_person'
    ]::text[]
  ),
  add constraint requirements_completion_contract check (
    completion_semantics is null
    or (completion_semantics = 'direct' and progress_mode = 'direct' and completion_threshold is null)
    or (completion_semantics in ('all_children', 'at_least_one') and progress_mode = 'derived' and completion_threshold is null)
    or (completion_semantics = 'at_least_n' and progress_mode = 'derived' and completion_threshold is not null)
  );

create unique index requirements_version_source_code_unique
on public.requirements (catalog_version_id, source_code)
where source_code is not null;

-- PostgreSQL UNIQUE treats NULL parents as distinct. Official roots need a real
-- position uniqueness rule within each ordered section.
create unique index requirements_root_section_position_unique
on public.requirements (catalog_version_id, section_id, position)
where parent_requirement_id is null and section_id is not null;

create function public.enforce_official_requirement_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_requirement public.requirements;
  is_official boolean;
begin
  if new.parent_requirement_id = new.id then
    raise exception 'a requirement cannot be its own parent' using errcode = '23514';
  end if;

  if new.parent_requirement_id is not null then
    select * into parent_requirement
    from public.requirements
    where id = new.parent_requirement_id;

    if not found or parent_requirement.catalog_version_id <> new.catalog_version_id then
      raise exception 'parent requirement must belong to the same catalog version'
        using errcode = '23514';
    end if;
    if parent_requirement.section_id is distinct from new.section_id then
      raise exception 'parent and child requirements must belong to the same section'
        using errcode = '23514';
    end if;

    if exists (
      with recursive ancestors as (
        select r.id, r.parent_requirement_id
        from public.requirements r
        where r.id = new.parent_requirement_id
        union all
        select r.id, r.parent_requirement_id
        from public.requirements r
        join ancestors a on r.id = a.parent_requirement_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'requirement hierarchy cannot contain a cycle'
        using errcode = '23514';
    end if;
  end if;

  select catalog.level_template_id is not null into is_official
  from public.catalog_versions version
  join public.catalogs catalog on catalog.id = version.catalog_id
  where version.id = new.catalog_version_id;

  if coalesce(is_official, false) then
    if new.section_id is null or new.source_code is null
      or new.modalities is null or cardinality(new.modalities) = 0
      or new.progress_mode is null or new.completion_semantics is null then
      raise exception 'official requirements require section, source code, modality, progress mode, and completion semantics'
        using errcode = '23514';
    end if;
    if new.parent_requirement_id is null and (new.child_role is not null or new.weight <> 1) then
      raise exception 'official root requirements must have no child role and unit weight'
        using errcode = '23514';
    end if;
    if new.parent_requirement_id is not null and (new.child_role is null or new.weight <> 0) then
      raise exception 'official child requirements require a child role and zero weight'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger official_requirement_contract_valid
before insert or update of catalog_version_id, parent_requirement_id, section_id,
  source_code, child_role, modalities, progress_mode, completion_semantics,
  completion_threshold, weight
on public.requirements
for each row execute function public.enforce_official_requirement_contract();

create function public.prevent_catalog_template_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.level_template_id is distinct from old.level_template_id
      or new.source_catalog_code is distinct from old.source_catalog_code)
    and exists (
      select 1 from public.catalog_versions
      where catalog_id = old.id and status = 'published'
    ) then
    raise exception 'official identity of a catalog with published versions is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger catalog_template_identity_immutable
before update of level_template_id, source_catalog_code on public.catalogs
for each row execute function public.prevent_catalog_template_reassignment();

create or replace function public.prevent_published_catalog_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mutation_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  affected_version_id uuid;
begin
  if tg_table_name = 'catalog_versions' then
    if (to_jsonb(old) ->> 'status') = 'published' then
      raise exception 'published catalog versions are immutable; create a new version';
    end if;
  elsif tg_table_name in ('requirements', 'catalog_sections') then
    affected_version_id := nullif(mutation_row ->> 'catalog_version_id', '')::uuid;
    if exists (
      select 1 from public.catalog_versions
      where id = affected_version_id and status = 'published'
    ) then
      if tg_table_name = 'catalog_sections' then
        raise exception 'sections of published catalog versions are immutable; create a new version';
      end if;
      raise exception 'requirements of published catalog versions are immutable; create a new version';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger catalog_sections_updated_at
before update on public.catalog_sections
for each row execute function public.set_updated_at();

create trigger published_catalog_sections_immutable
before insert or update or delete on public.catalog_sections
for each row execute function public.prevent_published_catalog_mutation();

alter table public.official_sources enable row level security;
alter table public.class_families enable row level security;
alter table public.class_level_templates enable row level security;
alter table public.catalog_sections enable row level security;

create policy "authenticated users read official sources"
on public.official_sources for select to authenticated using (true);
create policy "authenticated users read class families"
on public.class_families for select to authenticated using (true);
create policy "authenticated users read class level templates"
on public.class_level_templates for select to authenticated using (true);
create policy "members read catalog sections"
on public.catalog_sections for select to authenticated using (
  exists (
    select 1 from public.catalog_versions version
    join public.catalogs catalog on catalog.id = version.catalog_id
    where version.id = catalog_version_id and public.is_club_member(catalog.club_id)
  )
);
create policy "admins manage catalog sections"
on public.catalog_sections for all to authenticated using (
  exists (
    select 1 from public.catalog_versions version
    join public.catalogs catalog on catalog.id = version.catalog_id
    where version.id = catalog_version_id
      and public.is_club_member(catalog.club_id, array['admin']::public.club_role[])
  )
) with check (
  exists (
    select 1 from public.catalog_versions version
    join public.catalogs catalog on catalog.id = version.catalog_id
    where version.id = catalog_version_id
      and public.is_club_member(catalog.club_id, array['admin']::public.club_role[])
  )
);

grant select on table public.official_sources, public.class_families,
  public.class_level_templates, public.catalog_sections to authenticated;
grant insert, update, delete on table public.catalog_sections to authenticated;
grant select, insert, update, delete on table public.official_sources,
  public.class_families, public.class_level_templates, public.catalog_sections to service_role;

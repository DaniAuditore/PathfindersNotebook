-- Close the published-catalog immutability boundary around the reusable
-- metadata referenced by a published catalog version. Corrections remain
-- forward-only: create a new source, family, level template, and version.
create function public.prevent_published_official_metadata_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referenced_by_published_version boolean;
begin
  if tg_table_name = 'class_level_templates' then
    select exists (
      select 1
      from public.catalogs catalog
      join public.catalog_versions version on version.catalog_id = catalog.id
      where catalog.level_template_id = old.id
        and version.status = 'published'
    ) into referenced_by_published_version;
  elsif tg_table_name = 'class_families' then
    select exists (
      select 1
      from public.class_level_templates level
      join public.catalogs catalog on catalog.level_template_id = level.id
      join public.catalog_versions version on version.catalog_id = catalog.id
      where level.family_id = old.id
        and version.status = 'published'
    ) into referenced_by_published_version;
  elsif tg_table_name = 'official_sources' then
    select exists (
      select 1
      from public.class_level_templates level
      join public.catalogs catalog on catalog.level_template_id = level.id
      join public.catalog_versions version on version.catalog_id = catalog.id
      where level.source_id = old.id
        and version.status = 'published'
    ) into referenced_by_published_version;
  end if;

  if referenced_by_published_version then
    raise exception 'official metadata referenced by a published catalog version is immutable; create a new revision or template'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger published_official_sources_immutable
before update or delete on public.official_sources
for each row execute function public.prevent_published_official_metadata_mutation();

create trigger published_class_families_immutable
before update or delete on public.class_families
for each row execute function public.prevent_published_official_metadata_mutation();

create trigger published_class_level_templates_immutable
before update or delete on public.class_level_templates
for each row execute function public.prevent_published_official_metadata_mutation();

-- Validate both sides of the self-reference. The original trigger validated
-- the edited row's outgoing relation, but changing a referenced target could
-- invalidate incoming advanced/regular links.
create or replace function public.enforce_related_class_level()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  related_level public.class_level_templates;
begin
  if new.related_level_template_id is not null then
    select * into related_level
    from public.class_level_templates
    where id = new.related_level_template_id;

    if not found
      or related_level.family_id <> new.family_id
      or related_level.class_type = new.class_type then
      raise exception 'related class levels must be distinct regular and advanced levels in the same family'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
    from public.class_level_templates incoming
    where incoming.related_level_template_id = old.id
      and (incoming.family_id <> new.family_id or incoming.class_type = new.class_type)
  ) then
    raise exception 'related class levels must be distinct regular and advanced levels in the same family'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Provision the AC4-validated regular-Amigo snapshot through one transactional,
-- tenant-safe boundary. Legacy catalogs and the STG fixture remain untouched.
create extension if not exists pgcrypto with schema extensions;

alter table public.official_sources
  add column document_title text,
  add column visual_page_references integer[],
  add column source_payload_sha256 text
    check (source_payload_sha256 is null or source_payload_sha256 ~ '^[0-9a-f]{64}$');

alter table public.catalog_sections
  add column template_entity_id uuid,
  add column official_code text,
  add column slug text,
  add column visual_page_references integer[];

alter table public.requirements
  add column template_entity_id uuid,
  add column visual_page_references integer[];

alter table public.catalog_versions
  add column source_payload_sha256 text
    check (source_payload_sha256 is null or source_payload_sha256 ~ '^[0-9a-f]{64}$');

create unique index catalog_sections_version_template_entity_unique
on public.catalog_sections (catalog_version_id, template_entity_id)
where template_entity_id is not null;

create unique index requirements_version_template_entity_unique
on public.requirements (catalog_version_id, template_entity_id)
where template_entity_id is not null;

create function public.validate_official_amigo_catalog_version(target_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  section_count integer;
  root_count integer;
  child_count integer;
  row_count integer;
  bible_count integer;
  genesis_count integer;
  exodus_count integer;
  actual_distribution integer[];
  actual_group_counts integer[];
begin
  select count(*)::integer
  into section_count
  from public.catalog_sections
  where catalog_version_id = target_version_id;

  select
    count(*) filter (where parent_requirement_id is null)::integer,
    count(*) filter (where parent_requirement_id is not null)::integer,
    count(*)::integer
  into root_count, child_count, row_count
  from public.requirements
  where catalog_version_id = target_version_id;

  if section_count <> 9 or root_count <> 25 or child_count <> 96 or row_count <> 121 then
    raise exception 'official Amigo persisted counts must be 9/25/96/121; received %/%/%/%',
      section_count, root_count, child_count, row_count
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.requirements
    where catalog_version_id = target_version_id
      and ((parent_requirement_id is null and weight <> 1)
        or (parent_requirement_id is not null and weight <> 0))
  ) then
    raise exception 'official Amigo roots/children must preserve weights 1/0'
      using errcode = '23514';
  end if;

  select array_agg(root_total order by section_position)
  into actual_distribution
  from (
    select section.position as section_position,
      count(requirement.id) filter (where requirement.parent_requirement_id is null)::integer as root_total
    from public.catalog_sections section
    left join public.requirements requirement
      on requirement.section_id = section.id
      and requirement.catalog_version_id = target_version_id
    where section.catalog_version_id = target_version_id
    group by section.position
  ) distribution;

  if actual_distribution <> array[6,3,2,2,3,1,3,4,1] then
    raise exception 'official Amigo root distribution must be 6/3/2/2/3/1/3/4/1; received %', actual_distribution
      using errcode = '23514';
  end if;

  select array_agg(child_total order by group_position)
  into actual_group_counts
  from (
    select expected.group_position,
      count(child.id)::integer as child_total
    from unnest(array[
      'amigo.reg.s02.r01', 'amigo.reg.s02.r02', 'amigo.reg.s02.r03',
      'amigo.reg.s03.r01', 'amigo.reg.s05.r01', 'amigo.reg.s05.r02',
      'amigo.reg.s07.r01', 'amigo.reg.s08.r01'
    ]) with ordinality expected(source_code, group_position)
    left join public.requirements parent
      on parent.catalog_version_id = target_version_id
      and parent.source_code = expected.source_code
    left join public.requirements child
      on child.catalog_version_id = target_version_id
      and child.parent_requirement_id = parent.id
    group by expected.group_position
  ) groups;

  if actual_group_counts <> array[4,4,59,3,4,3,5,14] then
    raise exception 'official Amigo child groups must be 4/4/59/3/4/3/5/14; received %', actual_group_counts
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.requirements child
    join public.requirements parent on parent.id = child.parent_requirement_id
    where child.catalog_version_id = target_version_id
      and parent.source_code not in (
        'amigo.reg.s02.r01', 'amigo.reg.s02.r02', 'amigo.reg.s02.r03',
        'amigo.reg.s03.r01', 'amigo.reg.s05.r01', 'amigo.reg.s05.r02',
        'amigo.reg.s07.r01', 'amigo.reg.s08.r01'
      )
  ) then
    raise exception 'official Amigo contains an unknown child group'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(*) filter (where child.position between 0 and 37 and child.title ~ '^Gn\.? ')::integer,
    count(*) filter (where child.position between 38 and 58 and child.title like 'Éx %')::integer
  into bible_count, genesis_count, exodus_count
  from public.requirements child
  join public.requirements parent on parent.id = child.parent_requirement_id
  where child.catalog_version_id = target_version_id
    and parent.source_code = 'amigo.reg.s02.r03'
    and child.child_role = 'checklist_item';

  if bible_count <> 59 or genesis_count <> 38 or exodus_count <> 21 then
    raise exception 'official Amigo Bible checklist must be 59/38/21; received %/%/%', bible_count, genesis_count, exodus_count
      using errcode = '23514';
  end if;
end;
$$;

create function public.provision_official_amigo_catalog(target_club_id uuid, snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  source_id uuid := (snapshot #>> '{source,id}')::uuid;
  family_id uuid := (snapshot #>> '{family,id}')::uuid;
  level_id uuid := (snapshot #>> '{level,id}')::uuid;
  catalog_record public.catalogs;
  version_record public.catalog_versions;
  existing_source public.official_sources;
  existing_family public.class_families;
  existing_level public.class_level_templates;
  catalog_was_inserted boolean := false;
  payload_sha256 text := encode(extensions.digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex');
  revision_key text := snapshot #>> '{source,revisionKey}';
begin
  if auth.uid() is null or not public.is_club_member(target_club_id, array['admin']::public.club_role[]) then
    raise exception 'an authenticated club admin is required to provision an official catalog'
      using errcode = '42501';
  end if;

  if snapshot #>> '{source,sourceCode}' <> 'dsa.amigo.es'
    or snapshot #>> '{source,authority}' <> 'División Sudamericana, Ministerio de Conquistadores y Aventureros'
    or snapshot #>> '{source,locale}' <> 'es'
    or snapshot #>> '{source,documentSha256}' <> 'c29d62235ebfb819a89759f01af8e98858817ce3bc2d9947b5af11b652ad139a'
    or revision_key <> 'dsa-amigo-official-card-es-undated'
    or snapshot #>> '{family,familyCode}' <> 'amigo'
    or snapshot #>> '{level,levelCode}' <> 'amigo.regular'
    or snapshot #>> '{level,classType}' <> 'regular'
    or source_id <> 'd57be2a8-7a6a-5fdb-9181-99aaad22ebaa'
    or family_id <> '56590aef-c83d-56a0-be21-ff87940bb156'
    or level_id <> 'e2f7bfec-2ce3-5e78-ad31-d16a2611bef6' then
    raise exception 'payload is not the AC4 official regular-Amigo source revision'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_club_id::text || ':' || level_id::text || ':' || revision_key, 0));

  insert into public.official_sources (
    id, source_code, document_title, authority, locale, document_sha256,
    revision_key, is_undated, provenance, transcription_notes,
    visual_page_references, source_payload_sha256
  ) values (
    source_id, snapshot #>> '{source,sourceCode}', snapshot #>> '{source,documentTitle}',
    snapshot #>> '{source,authority}', snapshot #>> '{source,locale}',
    snapshot #>> '{source,documentSha256}', revision_key,
    (snapshot #>> '{source,isUndated}')::boolean, snapshot #>> '{source,provenance}',
    snapshot #>> '{source,transcriptionNotes}',
    array(select jsonb_array_elements_text(snapshot #> '{source,visualPageReferences}')::integer),
    payload_sha256
  ) on conflict do nothing;

  select * into existing_source from public.official_sources where id = source_id;
  if not found
    or existing_source.source_code <> snapshot #>> '{source,sourceCode}'
    or existing_source.document_title <> snapshot #>> '{source,documentTitle}'
    or existing_source.authority <> snapshot #>> '{source,authority}'
    or existing_source.locale <> snapshot #>> '{source,locale}'
    or existing_source.document_sha256 <> snapshot #>> '{source,documentSha256}'
    or existing_source.revision_key <> revision_key
    or existing_source.is_undated <> (snapshot #>> '{source,isUndated}')::boolean
    or existing_source.provenance <> snapshot #>> '{source,provenance}'
    or existing_source.transcription_notes <> snapshot #>> '{source,transcriptionNotes}'
    or existing_source.visual_page_references <> array(select jsonb_array_elements_text(snapshot #> '{source,visualPageReferences}')::integer)
    or existing_source.source_payload_sha256 is distinct from payload_sha256 then
    raise exception 'official source identity exists with different provenance payload'
      using errcode = '23514';
  end if;

  insert into public.class_families (id, family_code, title)
  values (family_id, snapshot #>> '{family,familyCode}', snapshot #>> '{family,title}')
  on conflict do nothing;
  select * into existing_family from public.class_families where id = family_id;
  if not found or existing_family.family_code <> snapshot #>> '{family,familyCode}'
    or existing_family.title <> snapshot #>> '{family,title}' then
    raise exception 'official family identity exists with different payload'
      using errcode = '23514';
  end if;

  insert into public.class_level_templates (
    id, family_id, source_id, level_code, class_type, title, position
  ) values (
    level_id, family_id, source_id, snapshot #>> '{level,levelCode}',
    (snapshot #>> '{level,classType}')::public.catalog_class_type,
    snapshot #>> '{level,title}', (snapshot #>> '{level,position}')::integer
  ) on conflict do nothing;
  select * into existing_level from public.class_level_templates where id = level_id;
  if not found or existing_level.family_id <> family_id or existing_level.source_id <> source_id
    or existing_level.level_code <> snapshot #>> '{level,levelCode}'
    or existing_level.class_type <> (snapshot #>> '{level,classType}')::public.catalog_class_type
    or existing_level.title <> snapshot #>> '{level,title}'
    or existing_level.position <> (snapshot #>> '{level,position}')::integer then
    raise exception 'official level identity exists with different payload'
      using errcode = '23514';
  end if;

  insert into public.catalogs (club_id, class_type, title, level_template_id, source_catalog_code)
  values (target_club_id, 'regular', snapshot #>> '{level,title}', level_id, snapshot #>> '{level,levelCode}')
  on conflict (club_id, level_template_id) where level_template_id is not null do nothing
  returning * into catalog_record;
  catalog_was_inserted := found;

  if not catalog_was_inserted then
    select * into catalog_record from public.catalogs
    where club_id = target_club_id and level_template_id = level_id;
    if not found or catalog_record.class_type <> 'regular'
      or catalog_record.source_catalog_code <> snapshot #>> '{level,levelCode}'
      or catalog_record.title <> snapshot #>> '{level,title}' then
      raise exception 'club official catalog identity exists with different payload'
        using errcode = '23514';
    end if;
  end if;

  select * into version_record
  from public.catalog_versions
  where catalog_id = catalog_record.id and source_revision_key = revision_key;

  if found then
    if version_record.status <> 'published' or version_record.source_payload_sha256 is null then
      raise exception 'official source revision has partial unpublished state'
        using errcode = '23514';
    end if;
    if version_record.source_payload_sha256 <> payload_sha256 then
      raise exception 'official source revision was already published with a different payload'
        using errcode = '23514';
    end if;
    perform public.validate_official_amigo_catalog_version(version_record.id);
    return jsonb_build_object(
      'catalogId', catalog_record.id, 'versionId', version_record.id,
      'versionNumber', version_record.version_number, 'alreadyPublished', true
    );
  end if;

  if not catalog_was_inserted and not exists (
    select 1 from public.catalog_versions where catalog_id = catalog_record.id and status = 'published'
  ) then
    raise exception 'official catalog exists in partial state without a published version'
      using errcode = '23514';
  end if;

  insert into public.catalog_versions (
    catalog_id, version_number, status, source_revision_key,
    source_document_sha256, provenance, source_payload_sha256
  ) values (
    catalog_record.id,
    coalesce((select max(version_number) + 1 from public.catalog_versions where catalog_id = catalog_record.id), 1),
    'draft', revision_key, snapshot #>> '{source,documentSha256}',
    snapshot #>> '{source,provenance}', payload_sha256
  ) returning * into version_record;

  insert into public.catalog_sections (
    catalog_version_id, template_entity_id, source_code, official_code,
    slug, title, position, visual_page_references
  )
  select version_record.id, (section ->> 'id')::uuid, section ->> 'sourceCode',
    section ->> 'officialCode', section ->> 'slug', section ->> 'title',
    (section ->> 'position')::integer,
    array(select jsonb_array_elements_text(section -> 'visualPageReferences')::integer)
  from jsonb_array_elements(snapshot -> 'sections') section;

  insert into public.requirements (
    catalog_version_id, template_entity_id, section_id, source_code,
    requirement_type, title, position, optional, weight, modalities,
    progress_mode, completion_semantics, completion_threshold,
    completion_rule, minimum_children, visual_page_references
  )
  select version_record.id, (requirement ->> 'id')::uuid, section.id,
    requirement ->> 'sourceCode', (requirement ->> 'requirementType')::public.requirement_type,
    requirement ->> 'title', (requirement ->> 'position')::integer,
    (requirement ->> 'optional')::boolean, (requirement ->> 'weight')::numeric,
    array(select jsonb_array_elements_text(requirement -> 'modalities')),
    case when requirement #>> '{completion,kind}' = 'direct' then 'direct' else 'derived' end::public.requirement_progress_mode,
    (requirement #>> '{completion,kind}')::public.requirement_completion_semantics,
    nullif(requirement #>> '{completion,threshold}', '')::integer,
    case requirement #>> '{completion,kind}'
      when 'all_children' then 'all' when 'at_least_one' then 'any'
      when 'at_least_n' then 'minimum_n' else null
    end::public.completion_rule,
    nullif(requirement #>> '{completion,threshold}', '')::integer,
    array(select jsonb_array_elements_text(requirement -> 'visualPageReferences')::integer)
  from jsonb_array_elements(snapshot -> 'requirements') requirement
  join public.catalog_sections section
    on section.catalog_version_id = version_record.id
    and section.source_code = requirement ->> 'sectionCode'
  where not (requirement ? 'parentSourceCode');

  insert into public.requirements (
    catalog_version_id, template_entity_id, parent_requirement_id, section_id,
    source_code, child_role, requirement_type, title, position, optional,
    weight, modalities, progress_mode, completion_semantics, visual_page_references
  )
  select version_record.id, (requirement ->> 'id')::uuid, parent.id, section.id,
    requirement ->> 'sourceCode', (requirement ->> 'childRole')::public.requirement_child_role,
    (requirement ->> 'requirementType')::public.requirement_type,
    requirement ->> 'title', (requirement ->> 'position')::integer,
    (requirement ->> 'optional')::boolean, (requirement ->> 'weight')::numeric,
    array(select jsonb_array_elements_text(requirement -> 'modalities')),
    'direct', 'direct',
    array(select jsonb_array_elements_text(requirement -> 'visualPageReferences')::integer)
  from jsonb_array_elements(snapshot -> 'requirements') requirement
  join public.requirements parent
    on parent.catalog_version_id = version_record.id
    and parent.source_code = requirement ->> 'parentSourceCode'
  join public.catalog_sections section
    on section.catalog_version_id = version_record.id
    and section.source_code = requirement ->> 'sectionCode'
  where requirement ? 'parentSourceCode';

  perform public.validate_official_amigo_catalog_version(version_record.id);

  update public.catalog_versions
  set status = 'published', published_at = now()
  where id = version_record.id
  returning * into version_record;

  return jsonb_build_object(
    'catalogId', catalog_record.id, 'versionId', version_record.id,
    'versionNumber', version_record.version_number, 'alreadyPublished', false
  );
exception
  when invalid_text_representation or not_null_violation or check_violation or foreign_key_violation then
    raise exception 'official Amigo payload could not be persisted: %', sqlerrm
      using errcode = '23514';
end;
$$;

revoke all on function public.validate_official_amigo_catalog_version(uuid) from public;
revoke all on function public.provision_official_amigo_catalog(uuid, jsonb) from public;
grant execute on function public.provision_official_amigo_catalog(uuid, jsonb) to authenticated;

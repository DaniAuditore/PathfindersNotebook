-- Close the authenticated AC5 boundary over the exact AC4 payload without
-- maintaining another field-by-field canonical copy. The database pins the
-- reviewed jsonb fingerprint and still verifies the persisted relational shape.

create table public.official_payload_contracts (
  contract_code text primary key,
  contract_version integer not null check (contract_version > 0),
  source_code text not null,
  revision_key text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (source_code, revision_key, contract_version)
);

insert into public.official_payload_contracts (
  contract_code, contract_version, source_code, revision_key, payload_sha256
) values (
  'amigo.regular.es', 1, 'dsa.amigo.es', 'dsa-amigo-official-card-es-undated',
  'dd4f85b0f20415cfcbcb95be97819ab4cdbfc9a54484689423c4982e065ba904'
);

create function public.prevent_official_payload_contract_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'official payload contracts are immutable; add a forward contract version';
end;
$$;

create trigger official_payload_contracts_immutable
before update or delete on public.official_payload_contracts
for each row execute function public.prevent_official_payload_contract_mutation();

alter table public.official_payload_contracts enable row level security;
revoke all on table public.official_payload_contracts from public, anon, authenticated;

-- Preserve migration 018 verbatim, but remove its unchecked entry point from
-- authenticated callers. Only the canonical wrapper below may invoke it.
alter function public.provision_official_amigo_catalog(uuid, jsonb)
rename to provision_official_amigo_catalog_unchecked_v1;

revoke all on function public.provision_official_amigo_catalog_unchecked_v1(uuid, jsonb)
from public, anon, authenticated;

create function public.assert_official_amigo_persisted_contract(
  target_version_id uuid,
  snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.validate_official_amigo_catalog_version(target_version_id);

  if (select count(*) from public.catalog_sections where catalog_version_id = target_version_id) <> jsonb_array_length(snapshot -> 'sections')
    or exists (
      select 1
      from jsonb_array_elements(snapshot -> 'sections') expected
      left join public.catalog_sections actual
        on actual.catalog_version_id = target_version_id
        and actual.template_entity_id = (expected ->> 'id')::uuid
      where actual.id is null
        or actual.source_code is distinct from expected ->> 'sourceCode'
        or actual.official_code is distinct from expected ->> 'officialCode'
        or actual.slug is distinct from expected ->> 'slug'
        or actual.title is distinct from expected ->> 'title'
        or actual.position is distinct from (expected ->> 'position')::integer
        or actual.visual_page_references is distinct from array(
          select jsonb_array_elements_text(expected -> 'visualPageReferences')::integer
        )
    ) then
    raise exception 'persisted official Amigo sections differ from the canonical payload'
      using errcode = '23514';
  end if;

  if (select count(*) from public.requirements where catalog_version_id = target_version_id) <> jsonb_array_length(snapshot -> 'requirements')
    or exists (
      select 1
      from jsonb_array_elements(snapshot -> 'requirements') expected
      left join public.requirements actual
        on actual.catalog_version_id = target_version_id
        and actual.template_entity_id = (expected ->> 'id')::uuid
      left join public.catalog_sections section on section.id = actual.section_id
      left join public.requirements parent on parent.id = actual.parent_requirement_id
      where actual.id is null
        or actual.source_code is distinct from expected ->> 'sourceCode'
        or section.source_code is distinct from expected ->> 'sectionCode'
        or parent.source_code is distinct from expected ->> 'parentSourceCode'
        or actual.child_role::text is distinct from expected ->> 'childRole'
        or actual.requirement_type::text is distinct from expected ->> 'requirementType'
        or actual.title is distinct from expected ->> 'title'
        or actual.position is distinct from (expected ->> 'position')::integer
        or actual.optional is distinct from (expected ->> 'optional')::boolean
        or actual.weight is distinct from (expected ->> 'weight')::numeric
        or actual.modalities is distinct from array(select jsonb_array_elements_text(expected -> 'modalities'))
        or actual.progress_mode::text is distinct from case
          when expected #>> '{completion,kind}' = 'direct' then 'direct' else 'derived'
        end
        or actual.completion_semantics::text is distinct from expected #>> '{completion,kind}'
        or actual.completion_threshold is distinct from nullif(expected #>> '{completion,threshold}', '')::integer
        or actual.visual_page_references is distinct from array(
          select jsonb_array_elements_text(expected -> 'visualPageReferences')::integer
        )
    ) then
    raise exception 'persisted official Amigo requirements differ from the canonical payload'
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
  expected_contract public.official_payload_contracts;
  actual_payload_sha256 text;
  provision_result jsonb;
  provisioned_version_id uuid;
begin
  if auth.uid() is null or not public.is_club_member(target_club_id, array['admin']::public.club_role[]) then
    raise exception 'an authenticated club admin is required to provision an official catalog'
      using errcode = '42501';
  end if;

  if snapshot is null or jsonb_typeof(snapshot) <> 'object'
    or snapshot ->> 'schemaVersion' <> '1'
    or jsonb_typeof(snapshot -> 'sections') <> 'array'
    or jsonb_typeof(snapshot -> 'requirements') <> 'array'
    or jsonb_array_length(snapshot -> 'sections') <> 9
    or jsonb_array_length(snapshot -> 'requirements') <> 121 then
    raise exception 'payload does not satisfy the official Amigo structural contract'
      using errcode = '23514';
  end if;

  select * into strict expected_contract
  from public.official_payload_contracts
  where contract_code = 'amigo.regular.es' and contract_version = 1;

  actual_payload_sha256 := encode(
    extensions.digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex'
  );
  if actual_payload_sha256 <> expected_contract.payload_sha256
    or snapshot #>> '{source,sourceCode}' <> expected_contract.source_code
    or snapshot #>> '{source,revisionKey}' <> expected_contract.revision_key then
    raise exception 'payload fingerprint does not match AC4 canonical contract amigo.regular.es/v1'
      using errcode = '23514';
  end if;

  provision_result := public.provision_official_amigo_catalog_unchecked_v1(
    target_club_id, snapshot
  );
  provisioned_version_id := (provision_result ->> 'versionId')::uuid;

  perform public.assert_official_amigo_persisted_contract(provisioned_version_id, snapshot);

  -- Retry telemetry is deliberately excluded from the Result contract. The same
  -- canonical command therefore returns semantically identical JSON every time.
  return provision_result - 'alreadyPublished';
end;
$$;

revoke all on function public.assert_official_amigo_persisted_contract(uuid, jsonb) from public;
revoke all on function public.provision_official_amigo_catalog(uuid, jsonb) from public;
grant execute on function public.provision_official_amigo_catalog(uuid, jsonb) to authenticated;

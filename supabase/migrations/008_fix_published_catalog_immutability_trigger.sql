-- `catalog_versions` and `requirements` have different row shapes. Read the
-- trigger rows as JSONB so this shared function never references a column that
-- is absent from the table currently invoking it.
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
  elsif tg_table_name = 'requirements' then
    affected_version_id := nullif(mutation_row ->> 'catalog_version_id', '')::uuid;

    if exists (
      select 1 from public.catalog_versions
      where id = affected_version_id and status = 'published'
    ) then
      raise exception 'requirements of published catalog versions are immutable; create a new version';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- The original trigger omitted INSERT, which would allow requirements to be
-- appended to an already-published version. Recreate it with all mutations.
drop trigger published_catalog_requirements_immutable on public.requirements;
create trigger published_catalog_requirements_immutable
before insert or update or delete on public.requirements
for each row execute function public.prevent_published_catalog_mutation();

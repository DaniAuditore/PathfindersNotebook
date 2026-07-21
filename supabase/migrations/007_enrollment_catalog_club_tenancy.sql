-- An enrollment may only pin a catalog owned by its own club. Keep this as a
-- security-invoker trigger so the catalog lookup remains subject to RLS.
create function public.enforce_enrollment_catalog_club()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.catalogs catalog
    where catalog.id = new.catalog_id
      and catalog.club_id = new.club_id
  ) then
    raise exception 'enrollment catalog must belong to the enrollment club'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger enrollments_catalog_club_matches
before insert or update of club_id, catalog_id on public.enrollments
for each row execute function public.enforce_enrollment_catalog_club();

-- The enrollment catalog-tenancy trigger intentionally remains security
-- invoker. Allow trusted service-role provisioning to evaluate only the catalog
-- identity and club columns needed by that invariant.
grant select (id, club_id)
on table public.catalogs
to service_role;

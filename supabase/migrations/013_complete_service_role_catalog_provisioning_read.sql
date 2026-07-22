-- Requirement immutability validation reads the parent version's publication
-- state in invoker context. The service-role provisioning path therefore needs
-- the status column in addition to the id granted by migration 012.
grant select (status)
on table public.catalog_versions
to service_role;

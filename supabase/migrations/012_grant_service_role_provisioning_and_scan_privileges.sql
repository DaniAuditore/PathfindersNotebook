-- The local Auth/Storage gate provisions disposable tenant fixtures through the
-- trusted service role, and the evidence scanner must be able to advance scan
-- state. Keep these grants operation-specific: authenticated actors still use
-- the existing RLS policies and receive no additional evidence write access.
grant insert on table
  public.profiles,
  public.clubs,
  public.memberships,
  public.students,
  public.catalogs,
  public.catalog_versions,
  public.requirements,
  public.enrollments
to service_role;

grant select (id), update (status, published_at)
on table public.catalog_versions
to service_role;

grant select (id, object_path, scan_status), update (scan_status)
on table public.evidence
to service_role;

-- Browser readers use explicit RLS projections, while all writes remain
-- SECURITY DEFINER commands. Canonical role assignments were added after the
-- earlier reader grants, so grant SELECT only; do not reopen table DML.
grant select on table
  public.profiles,
  public.clubs,
  public.memberships,
  public.students,
  public.role_assignments,
  public.catalogs,
  public.catalog_versions,
  public.requirements,
  public.enrollments,
  public.requirement_progress,
  public.assessments,
  public.investitures,
  public.audit_log
to authenticated;

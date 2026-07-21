-- RLS policies decide which rows an authenticated actor may access, but they do
-- not grant the underlying PostgreSQL privileges. Grant only the operations
-- already exposed by the catalog and progress policies/RPC workflow.

grant select on table
  public.catalogs,
  public.catalog_versions,
  public.requirements,
  public.enrollments,
  public.requirement_progress,
  public.progress_attempts,
  public.progress_reviews,
  public.assessments,
  public.investitures
to authenticated;

grant insert, update, delete on table
  public.catalogs,
  public.catalog_versions,
  public.requirements,
  public.assessments,
  public.investitures
to authenticated;

grant insert, update on table public.enrollments to authenticated;
grant update on table public.requirement_progress to authenticated;
grant insert, update on table public.progress_attempts to authenticated;
grant insert on table public.progress_reviews to authenticated;

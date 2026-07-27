-- Enrollment creation and lifecycle changes are controlled database operations.
-- Authenticated clients may read only rows permitted by RLS; they must use the
-- narrowly-authorized RPCs instead of writing enrollment rows through PostgREST.
drop policy if exists "admins and instructors create enrollments" on public.enrollments;
drop policy if exists "admins and instructors update enrollments" on public.enrollments;

revoke insert, update on table public.enrollments from authenticated;

-- These existing RPCs remain the controlled paths for the two legitimate
-- enrollment mutations. Their bodies authorize with auth.uid() and membership
-- checks before changing rows; SECURITY DEFINER supplies only the table rights
-- removed above.
alter function public.migrate_enrollment_version(uuid, uuid) security definer;
alter function public.migrate_enrollment_version(uuid, uuid) set search_path = public, pg_temp;

alter function public.record_investiture(uuid, text) security definer;
alter function public.record_investiture(uuid, text) set search_path = public, pg_temp;

-- Progress review commands lock their parent enrollment to preserve their
-- transactional authorization checks. They are likewise authenticated,
-- membership-authorized RPCs, not table-write permissions for callers.
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) security definer;
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) set search_path = public, pg_temp;

alter function public.reverse_progress_acceptance(uuid, uuid, text) security definer;
alter function public.reverse_progress_acceptance(uuid, uuid, text) set search_path = public, pg_temp;

alter function public.manually_complete_progress(uuid, text, text) security definer;
alter function public.manually_complete_progress(uuid, text, text) set search_path = public, pg_temp;

-- Close the browser table-write surface only after 023--026 supplied the
-- canonical command boundaries.  service_role remains the operational path for
-- provisioning, scanning and break-glass administration; browser clients must
-- use the explicitly granted SECURITY DEFINER commands.

revoke insert, update, delete on table
  public.catalogs,
  public.catalog_versions,
  public.catalog_sections,
  public.requirements,
  public.profiles,
  public.clubs,
  public.memberships,
  public.students,
  public.role_assignments,
  public.enrollments,
  public.requirement_progress,
  public.progress_attempts,
  public.progress_reviews,
  public.assessments,
  public.investitures,
  public.evidence,
  public.attempt_evidence,
  public.audit_log
from authenticated, anon;

-- Preserve separately reviewed SELECT policies while deleting every permissive
-- write policy on the closed tables.  This is name-independent so it also
-- removes legacy policies introduced by earlier migrations.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'catalogs', 'catalog_versions', 'catalog_sections', 'requirements',
        'profiles', 'clubs', 'memberships', 'students', 'role_assignments',
        'enrollments', 'requirement_progress', 'progress_attempts',
        'progress_reviews', 'assessments', 'investitures', 'evidence',
        'attempt_evidence', 'audit_log'
      ])
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end;
$$;

-- These helpers are implementation details of RLS and command predicates, not
-- anonymous API endpoints.  authenticated retains execute because read RLS and
-- authenticated commands call them under the caller identity.
alter function public.has_canonical_role_at_club(uuid, public.canonical_role[]) security definer;
alter function public.has_canonical_role_at_club(uuid, public.canonical_role[]) set search_path = public, pg_temp;
alter function public.has_canonical_role_in_unit(uuid, public.canonical_role[]) security definer;
alter function public.has_canonical_role_in_unit(uuid, public.canonical_role[]) set search_path = public, pg_temp;
alter function public.has_student_link(uuid, public.canonical_role[]) security definer;
alter function public.has_student_link(uuid, public.canonical_role[]) set search_path = public, pg_temp;
alter function public.can_review_progress(uuid) security definer;
alter function public.can_review_progress(uuid) set search_path = public, pg_temp;
alter function public.can_access_evidence(uuid) security definer;
alter function public.can_access_evidence(uuid) set search_path = public, pg_temp;
revoke all on function
  public.has_canonical_role_at_club(uuid, public.canonical_role[]),
  public.has_canonical_role_in_unit(uuid, public.canonical_role[]),
  public.has_student_link(uuid, public.canonical_role[]),
  public.can_review_progress(uuid),
  public.can_access_evidence(uuid)
from public, anon;
grant execute on function
  public.has_canonical_role_at_club(uuid, public.canonical_role[]),
  public.has_canonical_role_in_unit(uuid, public.canonical_role[]),
  public.has_student_link(uuid, public.canonical_role[]),
  public.can_review_progress(uuid),
  public.can_access_evidence(uuid)
to authenticated;

-- Operational commands are authenticated-only.  Neither accepts anonymous
-- traffic; service_role does not need EXECUTE because it retains table-level
-- operational administration.  No operational/canonical RPC intentionally
-- retains anon EXECUTE in this migration.
alter function public.provision_official_amigo_catalog(uuid, jsonb) security definer;
alter function public.provision_official_amigo_catalog(uuid, jsonb) set search_path = public, pg_temp;
alter function public.migrate_enrollment_version(uuid, uuid) security definer;
alter function public.migrate_enrollment_version(uuid, uuid) set search_path = public, pg_temp;
revoke all on function
  public.provision_official_amigo_catalog(uuid, jsonb),
  public.migrate_enrollment_version(uuid, uuid)
from public, anon;
grant execute on function
  public.provision_official_amigo_catalog(uuid, jsonb),
  public.migrate_enrollment_version(uuid, uuid)
to authenticated;

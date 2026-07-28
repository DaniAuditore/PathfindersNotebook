-- Harden the existing state-machine commands before direct table DML is revoked.
-- Each command is a pinned SECURITY DEFINER boundary; the canonical helpers
-- introduced in 023 resolve current scope at execution time, not from a client claim.
alter function public.submit_progress_attempt(uuid, text, text, uuid[]) security definer;
alter function public.submit_progress_attempt(uuid, text, text, uuid[]) set search_path = public, pg_temp;
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) security definer;
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) set search_path = public, pg_temp;
alter function public.reverse_progress_acceptance(uuid, uuid, text) security definer;
alter function public.reverse_progress_acceptance(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.manually_complete_progress(uuid, text, text) security definer;
alter function public.manually_complete_progress(uuid, text, text) set search_path = public, pg_temp;
alter function public.record_investiture(uuid, text) security definer;
alter function public.record_investiture(uuid, text) set search_path = public, pg_temp;
alter function public.prepare_evidence_upload(uuid, text, bigint) security definer;
alter function public.prepare_evidence_upload(uuid, text, bigint) set search_path = public, pg_temp;
alter function public.finalize_evidence_deletion(uuid) security definer;
alter function public.finalize_evidence_deletion(uuid) set search_path = public, pg_temp;
alter function public.prepare_evidence_deletion(uuid) security definer;
alter function public.prepare_evidence_deletion(uuid) set search_path = public, pg_temp;
alter function public.set_evidence_legal_hold(uuid, boolean) security definer;
alter function public.set_evidence_legal_hold(uuid, boolean) set search_path = public, pg_temp;

create or replace function public.enroll_student(target_student_id uuid, target_catalog_id uuid, target_catalog_version_id uuid, target_school_year smallint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare target_student public.students; enrollment_id uuid;
begin
  select * into target_student from public.students where id = target_student_id for update;
  if not found or not public.has_canonical_role_at_club(target_student.club_id, array['CLUB_DIRECTOR','INSTRUCTOR']::public.canonical_role[]) then
    raise exception 'only a scoped director or instructor may enroll a learner' using errcode = '42501';
  end if;
  if target_school_year not between 2000 and 2100 or not exists (select 1 from public.catalog_versions cv join public.catalogs c on c.id = cv.catalog_id where cv.id = target_catalog_version_id and cv.catalog_id = target_catalog_id and cv.status = 'published' and c.club_id = target_student.club_id) then
    raise exception 'enrollment must reference a published catalog in the learner club' using errcode = '23514';
  end if;
  insert into public.enrollments (club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by)
  values (target_student.club_id, target_student_id, target_catalog_id, target_catalog_version_id, target_school_year, auth.uid())
  returning id into enrollment_id;
  return jsonb_build_object('id', enrollment_id, 'clubId', target_student.club_id, 'studentId', target_student_id, 'catalogId', target_catalog_id, 'catalogVersionId', target_catalog_version_id, 'schoolYear', target_school_year);
end;
$$;

create or replace function public.record_assessment(target_enrollment_id uuid, decision_input public.assessment_decision, comments_input text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_club_id uuid; existing_assessment uuid;
begin
  select club_id into target_club_id from public.enrollments where id = target_enrollment_id for update;
  if target_club_id is null then raise exception 'assessment enrollment does not exist' using errcode = '23514'; end if;
  select id into existing_assessment from public.assessments where enrollment_id = target_enrollment_id;
  if not public.has_canonical_role_at_club(target_club_id, array['CLUB_DIRECTOR','INSTRUCTOR']::public.canonical_role[])
     and (existing_assessment is null or not exists (select 1 from public.role_assignments where user_id = auth.uid() and role = 'EVALUATOR' and assessment_id = existing_assessment and revoked_at is null and active_from <= now() and (active_until is null or active_until > now()))) then
    raise exception 'only an authorized scoped assessor can record an assessment' using errcode = '42501';
  end if;
  if decision_input = 'passed' and not public.enrollment_ready_for_assessment(target_enrollment_id) then raise exception 'incomplete progress cannot pass assessment' using errcode = '23514'; end if;
  insert into public.assessments (enrollment_id, assessor_id, decision, comments)
  values (target_enrollment_id, auth.uid(), decision_input, coalesce(comments_input, ''))
  on conflict (enrollment_id) do update set assessor_id = excluded.assessor_id, decision = excluded.decision, comments = excluded.comments, created_at = now();
end;
$$;

-- A SYSTEM_ADMIN is deliberately absent from evidence predicates. Replacing the
-- old enrollment-wide download predicate also prevents technical admin status
-- from becoming learner evidence access.
create or replace function public.authorized_evidence_download(target_evidence_id uuid)
returns table (club_id uuid, object_path text) language sql security definer set search_path = public, pg_temp as $$
  select ev.club_id, ev.object_path from public.evidence ev
  where ev.id = target_evidence_id and ev.scan_status = 'clean' and ev.deleted_at is null
    and public.can_access_evidence(ev.id);
$$;

revoke all on function public.submit_progress_attempt(uuid, text, text, uuid[]), public.review_progress_attempt(uuid, uuid, public.progress_status, text), public.reverse_progress_acceptance(uuid, uuid, text), public.manually_complete_progress(uuid, text, text), public.record_assessment(uuid, public.assessment_decision, text), public.record_investiture(uuid, text), public.prepare_evidence_upload(uuid, text, bigint), public.authorized_evidence_download(uuid), public.finalize_evidence_deletion(uuid), public.prepare_evidence_deletion(uuid), public.set_evidence_legal_hold(uuid, boolean) from public, anon;
grant execute on function public.submit_progress_attempt(uuid, text, text, uuid[]), public.review_progress_attempt(uuid, uuid, public.progress_status, text), public.reverse_progress_acceptance(uuid, uuid, text), public.manually_complete_progress(uuid, text, text), public.record_assessment(uuid, public.assessment_decision, text), public.record_investiture(uuid, text), public.prepare_evidence_upload(uuid, text, bigint), public.authorized_evidence_download(uuid), public.finalize_evidence_deletion(uuid), public.prepare_evidence_deletion(uuid), public.set_evidence_legal_hold(uuid, boolean) to authenticated;
revoke all on function public.enroll_student(uuid, uuid, uuid, smallint) from public, anon;
grant execute on function public.enroll_student(uuid, uuid, uuid, smallint) to authenticated;

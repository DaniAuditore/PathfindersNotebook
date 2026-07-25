-- Keep UX data-integrity rules at the authenticated database command boundary.
-- These replacements preserve the existing signatures, authorization, RLS, and
-- trigger-based transactional audit behavior introduced by migrations 004-010.
create or replace function public.submit_progress_attempt(target_progress_id uuid, submission_text_input text default null, credit_key_input text default null, evidence_ids_input uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_progress public.requirement_progress;
  target_requirement public.requirements;
  normalized_submission_text text := nullif(
    regexp_replace(submission_text_input, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
  next_attempt integer;
  new_attempt_id uuid;
begin
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not public.can_submit_evidence(target_progress_id) then
    raise exception 'only a linked guardian or student can submit progress';
  end if;
  if target_progress.status not in ('draft', 'rejected') then
    raise exception 'only draft or rejected progress can be submitted';
  end if;

  select r.* into target_requirement from public.requirements r where r.id = target_progress.requirement_id;
  if not found then
    raise exception 'only a linked guardian or student can submit progress';
  end if;
  if not target_requirement.requires_evidence and normalized_submission_text is null then
    raise exception 'submission text is required';
  end if;
  if target_requirement.requires_evidence and coalesce(array_length(evidence_ids_input, 1), 0) = 0 then
    raise exception 'this requirement requires clean evidence';
  end if;
  if exists (
    select 1 from unnest(evidence_ids_input) evidence_id
    left join public.evidence evidence on evidence.id = evidence_id
    where evidence.id is null
      or evidence.progress_id <> target_progress_id
      or evidence.uploaded_by <> auth.uid()
      or evidence.scan_status <> 'clean'
      or evidence.deleted_at is not null
  ) then
    raise exception 'only clean evidence prepared for this progress can be submitted';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into next_attempt
  from public.progress_attempts
  where progress_id = target_progress_id;

  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, submission_text, credit_key)
  values (target_progress_id, next_attempt, auth.uid(), normalized_submission_text, credit_key_input)
  returning id into new_attempt_id;
  insert into public.attempt_evidence (attempt_id, evidence_id)
  select new_attempt_id, evidence_id from unnest(evidence_ids_input) evidence_id;
  update public.requirement_progress
  set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null
  where id = target_progress_id;
  return new_attempt_id;
end;
$$;

create or replace function public.review_progress_attempt(target_progress_id uuid, target_attempt_id uuid, decision_input public.progress_status, reason_input text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_progress public.requirement_progress;
  target_requirement public.requirements;
  target_attempt public.progress_attempts;
  target_club_id uuid;
  normalized_reason text := nullif(
    regexp_replace(reason_input, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
begin
  if decision_input not in ('accepted', 'rejected') then
    raise exception 'review decision must be accepted or rejected';
  end if;
  if decision_input = 'rejected' and normalized_reason is null then
    raise exception 'a rejection reason is required';
  end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found then raise exception 'only an authorized reviewer can decide progress'; end if;
  select e.club_id into target_club_id from public.enrollments e where e.id = target_progress.enrollment_id for update;
  if not found or not public.is_club_member(target_club_id, array['admin', 'instructor']::public.club_role[]) then
    raise exception 'only an authorized reviewer can decide progress';
  end if;
  if target_progress.status <> 'submitted' then raise exception 'only submitted progress can be reviewed'; end if;
  select * into target_attempt from public.progress_attempts where id = target_attempt_id and progress_id = target_progress_id for update;
  if not found or target_attempt.decision is not null then raise exception 'attempt is unavailable for review'; end if;
  select * into target_requirement from public.requirements r where r.id = target_progress.requirement_id;
  if decision_input = 'accepted' and target_requirement.requires_evidence and not exists (
    select 1 from public.attempt_evidence attempt_evidence
    join public.evidence evidence on evidence.id = attempt_evidence.evidence_id
    where attempt_evidence.attempt_id = target_attempt_id and evidence.scan_status = 'clean' and evidence.deleted_at is null
  ) then raise exception 'accepted reviews require clean evidence'; end if;
  if decision_input = 'accepted' and target_attempt.credit_key is not null and not target_requirement.allow_reuse and exists (
    select 1 from public.requirement_progress p
    where p.id <> target_progress_id and p.status = 'accepted' and p.accepted_credit_key = target_attempt.credit_key and p.enrollment_id = target_progress.enrollment_id
  ) then raise exception 'a completion item can only be credited once'; end if;
  update public.progress_attempts
  set decision = decision_input, decision_reason = normalized_reason, decided_at = now(), decided_by = auth.uid()
  where id = target_attempt_id;
  update public.requirement_progress
  set status = decision_input, reviewed_at = now(), reviewer_id = auth.uid(), accepted_at = case when decision_input = 'accepted' then now() else null end, accepted_credit_key = case when decision_input = 'accepted' then target_attempt.credit_key else null end
  where id = target_progress_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason)
  values (target_club_id, target_progress_id, target_attempt_id, auth.uid(), decision_input, normalized_reason);
  return target_progress.enrollment_id;
end;
$$;

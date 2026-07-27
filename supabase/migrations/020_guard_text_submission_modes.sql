-- Text submission is a narrow learner command. Official derived, practical,
-- and evidence-backed requirements must not be smuggled through the legacy RPC.
create or replace function public.submit_progress_attempt(target_progress_id uuid, submission_text_input text default null, credit_key_input text default null, evidence_ids_input uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_progress public.requirement_progress;
  target_requirement public.requirements;
  normalized_submission_text text := nullif(regexp_replace(submission_text_input, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  next_attempt integer;
  new_attempt_id uuid;
begin
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not public.can_submit_evidence(target_progress_id) then raise exception 'only a linked guardian or student can submit progress'; end if;
  if target_progress.status not in ('draft', 'rejected') then raise exception 'only draft or rejected progress can be submitted'; end if;
  select r.* into target_requirement from public.requirements r where r.id = target_progress.requirement_id;
  if not found then raise exception 'only a linked guardian or student can submit progress'; end if;
  if target_requirement.progress_mode = 'derived'
    or target_requirement.completion_semantics in ('all_children', 'at_least_one', 'at_least_n')
    or coalesce(target_requirement.modalities, '{}'::text[]) @> array['practical_in_person']::text[] then
    raise exception 'this requirement cannot be submitted as text';
  end if;
  if not target_requirement.requires_evidence and normalized_submission_text is null then raise exception 'submission text is required'; end if;
  if target_requirement.requires_evidence and coalesce(array_length(evidence_ids_input, 1), 0) = 0 then raise exception 'this requirement requires clean evidence'; end if;
  if exists (
    select 1 from unnest(evidence_ids_input) evidence_id
    left join public.evidence evidence on evidence.id = evidence_id
    where evidence.id is null or evidence.progress_id <> target_progress_id
      or evidence.uploaded_by <> auth.uid() or evidence.scan_status <> 'clean' or evidence.deleted_at is not null
  ) then raise exception 'only clean evidence prepared for this progress can be submitted'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.progress_attempts where progress_id = target_progress_id;
  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, submission_text, credit_key)
  values (target_progress_id, next_attempt, auth.uid(), normalized_submission_text, credit_key_input) returning id into new_attempt_id;
  insert into public.attempt_evidence (attempt_id, evidence_id)
  select new_attempt_id, evidence_id from unnest(evidence_ids_input) evidence_id;
  update public.requirement_progress set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null where id = target_progress_id;
  return new_attempt_id;
end;
$$;

-- Linked guardians/students may not read catalog requirements directly, yet the
-- evidence workflow must inspect them to validate a prepared upload/submission.
-- These narrow functions retain their explicit actor, ownership, and state
-- checks while running the necessary joins with definer privileges; no direct
-- evidence-table privilege or RLS policy is broadened.
create or replace function public.prepare_evidence_upload(target_progress_id uuid, mime_type_input text, byte_size_input bigint)
returns table (evidence_id uuid, evidence_object_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club_id uuid;
  allows_mime boolean;
  new_evidence_id uuid := gen_random_uuid();
  next_count integer;
begin
  if mime_type_input not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') or byte_size_input <= 0 or byte_size_input > 10485760 then
    raise exception 'evidence MIME type or size is not allowed';
  end if;

  if not public.can_submit_evidence(target_progress_id) then
    raise exception 'only a linked guardian or student can upload evidence';
  end if;

  select e.club_id, (r.requires_evidence and (mime_type_input = any(r.evidence_types) or 'file' = any(r.evidence_types)))
  into target_club_id, allows_mime
  from public.requirement_progress p
  join public.enrollments e on e.id = p.enrollment_id
  join public.requirements r on r.id = p.requirement_id
  where p.id = target_progress_id;

  if target_club_id is null then
    raise exception 'only a linked guardian or student can upload evidence';
  end if;
  if not allows_mime then
    raise exception 'this requirement does not accept file evidence of this type';
  end if;

  next_count := public.consume_evidence_upload_rate_limit();
  if next_count > 20 then raise exception 'evidence upload rate limit exceeded'; end if;

  insert into public.evidence (id, club_id, progress_id, uploaded_by, object_path, mime_type, byte_size)
  values (new_evidence_id, target_club_id, target_progress_id, auth.uid(), target_club_id::text || '/' || new_evidence_id::text, mime_type_input, byte_size_input);
  return query select new_evidence_id, target_club_id::text || '/' || new_evidence_id::text;
end;
$$;

create or replace function public.submit_progress_attempt(target_progress_id uuid, submission_text_input text default null, credit_key_input text default null, evidence_ids_input uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_progress public.requirement_progress;
  target_requirement public.requirements;
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
  values (target_progress_id, next_attempt, auth.uid(), submission_text_input, credit_key_input)
  returning id into new_attempt_id;
  insert into public.attempt_evidence (attempt_id, evidence_id)
  select new_attempt_id, evidence_id from unnest(evidence_ids_input) evidence_id;
  update public.requirement_progress
  set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null
  where id = target_progress_id;
  return new_attempt_id;
end;
$$;

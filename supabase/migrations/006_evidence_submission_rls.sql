-- Keep rate-limit state private: callers may consume only their own quota through
-- this narrow helper, while attempt-evidence links remain subject to RLS.
create function public.consume_evidence_upload_rate_limit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if auth.uid() is null then
    raise exception 'an authenticated user is required to upload evidence';
  end if;

  insert into public.evidence_upload_rate_limits as limits (user_id, window_started_at, upload_count)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id) do update set
    window_started_at = case when limits.window_started_at <= now() - interval '1 hour' then date_trunc('hour', now()) else limits.window_started_at end,
    upload_count = case when limits.window_started_at <= now() - interval '1 hour' then 1 else limits.upload_count + 1 end,
    updated_at = now()
  returning upload_count into next_count;

  return next_count;
end;
$$;

create or replace function public.prepare_evidence_upload(target_progress_id uuid, mime_type_input text, byte_size_input bigint)
returns table (evidence_id uuid, evidence_object_path text)
language plpgsql security invoker set search_path = public as $$
declare
  target_club_id uuid;
  allows_mime boolean;
  new_evidence_id uuid := gen_random_uuid();
  next_count integer;
begin
  if mime_type_input not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') or byte_size_input <= 0 or byte_size_input > 10485760 then
    raise exception 'evidence MIME type or size is not allowed';
  end if;

  select e.club_id, (r.requires_evidence and (mime_type_input = any(r.evidence_types) or 'file' = any(r.evidence_types)))
  into target_club_id, allows_mime
  from public.requirement_progress p
  join public.enrollments e on e.id = p.enrollment_id
  join public.requirements r on r.id = p.requirement_id
  where p.id = target_progress_id;

  if target_club_id is null or not public.can_submit_evidence(target_progress_id) then
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

create policy "linked users attach own clean evidence to own attempts"
on public.attempt_evidence
for insert
with check (
  exists (
    select 1
    from public.progress_attempts attempt
    join public.evidence evidence on evidence.id = evidence_id
    where attempt.id = attempt_id
      and attempt.submitted_by = auth.uid()
      and attempt.decision is null
      and evidence.uploaded_by = auth.uid()
      and evidence.progress_id = attempt.progress_id
      and evidence.scan_status = 'clean'
      and evidence.deleted_at is null
      and public.can_submit_evidence(attempt.progress_id)
  )
);

revoke all on function public.consume_evidence_upload_rate_limit() from public;
grant execute on function public.consume_evidence_upload_rate_limit() to authenticated;

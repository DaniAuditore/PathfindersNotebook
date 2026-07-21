create type public.evidence_scan_status as enum ('pending_scan', 'clean', 'quarantined', 'deleted');

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  progress_id uuid not null references public.requirement_progress (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (user_id) on delete restrict,
  object_path text not null unique check (object_path ~ '^[0-9a-f-]+/[0-9a-f-]+$'),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  scan_status public.evidence_scan_status not null default 'pending_scan',
  upload_expires_at timestamptz not null default (now() + interval '15 minutes'),
  retain_until timestamptz not null default (now() + interval '24 months'),
  legal_hold boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scan_status = 'deleted') = (deleted_at is not null))
);

create table public.attempt_evidence (
  attempt_id uuid not null references public.progress_attempts (id) on delete cascade,
  evidence_id uuid not null references public.evidence (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (attempt_id, evidence_id)
);

create table public.evidence_upload_rate_limits (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  window_started_at timestamptz not null,
  upload_count integer not null check (upload_count > 0),
  updated_at timestamptz not null default now()
);

create index evidence_progress_idx on public.evidence (progress_id);
create index evidence_club_status_idx on public.evidence (club_id, scan_status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.can_submit_evidence(target_progress_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.requirement_progress p
    join public.enrollments e on e.id = p.enrollment_id
    join public.students s on s.id = e.student_id
    where p.id = target_progress_id
      and (s.guardian_user_id = auth.uid() or s.student_user_id = auth.uid())
  );
$$;

create function public.prepare_evidence_upload(target_progress_id uuid, mime_type_input text, byte_size_input bigint)
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

  insert into public.evidence_upload_rate_limits as limits (user_id, window_started_at, upload_count)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id) do update set
    window_started_at = case when limits.window_started_at <= now() - interval '1 hour' then date_trunc('hour', now()) else limits.window_started_at end,
    upload_count = case when limits.window_started_at <= now() - interval '1 hour' then 1 else limits.upload_count + 1 end,
    updated_at = now()
  returning upload_count into next_count;
  if next_count > 20 then raise exception 'evidence upload rate limit exceeded'; end if;

  insert into public.evidence (id, club_id, progress_id, uploaded_by, object_path, mime_type, byte_size)
  values (new_evidence_id, target_club_id, target_progress_id, auth.uid(), target_club_id::text || '/' || new_evidence_id::text, mime_type_input, byte_size_input);
  return query select new_evidence_id, target_club_id::text || '/' || new_evidence_id::text;
end;
$$;

drop function public.submit_progress_attempt(uuid, text, text);
create function public.submit_progress_attempt(target_progress_id uuid, submission_text_input text default null, credit_key_input text default null, evidence_ids_input uuid[] default '{}')
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_progress public.requirement_progress; target_requirement public.requirements; next_attempt integer; new_attempt_id uuid;
begin
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found then raise exception 'only a linked guardian or student can submit progress'; end if;
  select r.* into target_requirement from public.requirements r where r.id = target_progress.requirement_id;
  if not found or not public.can_submit_evidence(target_progress_id) then raise exception 'only a linked guardian or student can submit progress'; end if;
  if target_progress.status not in ('draft', 'rejected') then raise exception 'only draft or rejected progress can be submitted'; end if;
  if target_requirement.requires_evidence and coalesce(array_length(evidence_ids_input, 1), 0) = 0 then raise exception 'this requirement requires clean evidence'; end if;
  if exists (
    select 1 from unnest(evidence_ids_input) evidence_id
    left join public.evidence evidence on evidence.id = evidence_id
    where evidence.id is null or evidence.progress_id <> target_progress_id or evidence.uploaded_by <> auth.uid() or evidence.scan_status <> 'clean'
  ) then raise exception 'only clean evidence prepared for this progress can be submitted'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.progress_attempts where progress_id = target_progress_id;
  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, submission_text, credit_key) values (target_progress_id, next_attempt, auth.uid(), submission_text_input, credit_key_input) returning id into new_attempt_id;
  insert into public.attempt_evidence (attempt_id, evidence_id) select new_attempt_id, evidence_id from unnest(evidence_ids_input) evidence_id;
  update public.requirement_progress set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null where id = target_progress_id;
  return new_attempt_id;
end;
$$;

create function public.authorized_evidence_download(target_evidence_id uuid)
returns table (club_id uuid, object_path text)
language plpgsql security invoker set search_path = public as $$
begin
  return query
  select evidence.club_id, evidence.object_path
  from public.evidence evidence
  join public.requirement_progress p on p.id = evidence.progress_id
  where evidence.id = target_evidence_id
    and evidence.scan_status = 'clean'
    and evidence.deleted_at is null
    and public.can_access_enrollment(p.enrollment_id);
end;
$$;

create or replace function public.review_progress_attempt(target_progress_id uuid, target_attempt_id uuid, decision_input public.progress_status, reason_input text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_progress public.requirement_progress; target_requirement public.requirements; target_attempt public.progress_attempts; target_club_id uuid;
begin
  if decision_input not in ('accepted', 'rejected') then raise exception 'review decision must be accepted or rejected'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found then raise exception 'only an authorized reviewer can decide progress'; end if;
  select e.club_id into target_club_id from public.enrollments e where e.id = target_progress.enrollment_id for update;
  if not found or not public.is_club_member(target_club_id, array['admin', 'instructor']::public.club_role[]) then raise exception 'only an authorized reviewer can decide progress'; end if;
  if target_progress.status <> 'submitted' then raise exception 'only submitted progress can be reviewed'; end if;
  select * into target_attempt from public.progress_attempts where id = target_attempt_id and progress_id = target_progress_id for update;
  if not found or target_attempt.decision is not null then raise exception 'attempt is unavailable for review'; end if;
  select * into target_requirement from public.requirements r where r.id = target_progress.requirement_id;
  if decision_input = 'accepted' and target_requirement.requires_evidence and not exists (
    select 1 from public.attempt_evidence attempt_evidence
    join public.evidence evidence on evidence.id = attempt_evidence.evidence_id
    where attempt_evidence.attempt_id = target_attempt_id and evidence.scan_status = 'clean' and evidence.deleted_at is null
  ) then raise exception 'accepted reviews require clean evidence'; end if;
  if decision_input = 'accepted' and target_attempt.credit_key is not null and not target_requirement.allow_reuse and exists (select 1 from public.requirement_progress p where p.id <> target_progress_id and p.status = 'accepted' and p.accepted_credit_key = target_attempt.credit_key and p.enrollment_id = target_progress.enrollment_id) then raise exception 'a completion item can only be credited once'; end if;
  update public.progress_attempts set decision = decision_input, decision_reason = reason_input, decided_at = now(), decided_by = auth.uid() where id = target_attempt_id;
  update public.requirement_progress set status = decision_input, reviewed_at = now(), reviewer_id = auth.uid(), accepted_at = case when decision_input = 'accepted' then now() else null end, accepted_credit_key = case when decision_input = 'accepted' then target_attempt.credit_key else null end where id = target_progress_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, target_attempt_id, auth.uid(), decision_input, reason_input);
  return target_progress.enrollment_id;
end;
$$;

create function public.finalize_evidence_deletion(target_evidence_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_evidence public.evidence;
begin
  select * into target_evidence from public.evidence where id = target_evidence_id for update;
  if not found or not public.is_club_member(target_evidence.club_id, array['admin']::public.club_role[]) then raise exception 'only a club administrator can delete evidence'; end if;
  if target_evidence.legal_hold or target_evidence.retain_until > now() then raise exception 'evidence is protected by a retention hold or retention period'; end if;
  update public.evidence set scan_status = 'deleted', deleted_at = now() where id = target_evidence_id;
  return target_evidence.club_id;
end;
$$;

create function public.prepare_evidence_deletion(target_evidence_id uuid)
returns table (club_id uuid, object_path text)
language plpgsql security invoker set search_path = public as $$
begin
  return query
  select evidence.club_id, evidence.object_path
  from public.evidence evidence
  where evidence.id = target_evidence_id
    and evidence.deleted_at is null
    and not evidence.legal_hold
    and evidence.retain_until <= now()
    and public.is_club_member(evidence.club_id, array['admin']::public.club_role[]);
end;
$$;

create function public.set_evidence_legal_hold(target_evidence_id uuid, hold_input boolean)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_evidence public.evidence;
begin
  select * into target_evidence from public.evidence where id = target_evidence_id for update;
  if not found or not public.is_club_member(target_evidence.club_id, array['admin']::public.club_role[]) then raise exception 'only a club administrator can manage an evidence hold'; end if;
  if target_evidence.deleted_at is not null then raise exception 'deleted evidence cannot be placed on hold'; end if;
  update public.evidence set legal_hold = hold_input where id = target_evidence_id;
  return target_evidence.club_id;
end;
$$;

create trigger evidence_updated_at before update on public.evidence for each row execute function public.set_updated_at();

alter table public.evidence enable row level security;
alter table public.attempt_evidence enable row level security;
alter table public.evidence_upload_rate_limits enable row level security;

create policy "scoped users read evidence metadata" on public.evidence for select using (public.can_access_enrollment((select enrollment_id from public.requirement_progress where id = progress_id)));
create policy "linked users create evidence metadata" on public.evidence for insert with check (uploaded_by = auth.uid() and scan_status = 'pending_scan' and public.can_submit_evidence(progress_id));
create policy "scoped users read attempt evidence" on public.attempt_evidence for select using (exists (select 1 from public.progress_attempts a join public.requirement_progress p on p.id = a.progress_id where a.id = attempt_id and public.can_access_enrollment(p.enrollment_id)));

create policy "linked users upload prepared private evidence" on storage.objects for insert to authenticated with check (
  bucket_id = 'evidence' and exists (
    select 1 from public.evidence evidence
    where evidence.object_path = name and evidence.uploaded_by = auth.uid() and evidence.scan_status = 'pending_scan' and evidence.upload_expires_at > now()
  )
);
create policy "scoped users read private evidence" on storage.objects for select to authenticated using (
  bucket_id = 'evidence' and exists (
    select 1 from public.evidence evidence join public.requirement_progress p on p.id = evidence.progress_id
    where evidence.object_path = name and evidence.scan_status = 'clean' and evidence.deleted_at is null and public.can_access_enrollment(p.enrollment_id)
  )
);
create policy "admins delete retained evidence" on storage.objects for delete to authenticated using (
  bucket_id = 'evidence' and exists (
    select 1 from public.evidence evidence
    where evidence.object_path = name and not evidence.legal_hold and evidence.retain_until <= now() and public.is_club_member(evidence.club_id, array['admin']::public.club_role[])
  )
);

revoke all on function public.can_submit_evidence(uuid) from public;
revoke all on function public.prepare_evidence_upload(uuid, text, bigint) from public;
revoke all on function public.authorized_evidence_download(uuid) from public;
revoke all on function public.finalize_evidence_deletion(uuid) from public;
revoke all on function public.prepare_evidence_deletion(uuid) from public;
revoke all on function public.set_evidence_legal_hold(uuid, boolean) from public;
grant execute on function public.can_submit_evidence(uuid) to authenticated;
grant execute on function public.prepare_evidence_upload(uuid, text, bigint) to authenticated;
grant execute on function public.authorized_evidence_download(uuid) to authenticated;
grant execute on function public.finalize_evidence_deletion(uuid) to authenticated;
grant execute on function public.prepare_evidence_deletion(uuid) to authenticated;
grant execute on function public.set_evidence_legal_hold(uuid, boolean) to authenticated;
grant execute on function public.submit_progress_attempt(uuid, text, text, uuid[]) to authenticated;

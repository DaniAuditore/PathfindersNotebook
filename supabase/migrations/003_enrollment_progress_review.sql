create type public.enrollment_status as enum ('active', 'completed', 'withdrawn');
create type public.progress_status as enum ('draft', 'submitted', 'accepted', 'rejected');
create type public.assessment_decision as enum ('passed', 'failed');

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  catalog_id uuid not null references public.catalogs (id) on delete restrict,
  catalog_version_id uuid not null references public.catalog_versions (id) on delete restrict,
  school_year smallint not null check (school_year between 2000 and 2100),
  status public.enrollment_status not null default 'active',
  enrolled_by uuid not null references public.profiles (user_id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, catalog_id, school_year),
  check ((status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null))
);

create table public.requirement_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  requirement_id uuid not null references public.requirements (id) on delete restrict,
  status public.progress_status not null default 'draft',
  manual_rationale text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles (user_id) on delete set null,
  accepted_at timestamptz,
  accepted_credit_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, requirement_id),
  check ((status = 'submitted' and submitted_at is not null) or status <> 'submitted'),
  check ((status = 'accepted' and reviewed_at is not null and reviewer_id is not null and accepted_at is not null) or status <> 'accepted'),
  check ((manual_rationale is null) or char_length(trim(manual_rationale)) > 0)
);

create table public.progress_attempts (
  id uuid primary key default gen_random_uuid(),
  progress_id uuid not null references public.requirement_progress (id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  submitted_by uuid not null references public.profiles (user_id) on delete restrict,
  submission_text text,
  credit_key text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (user_id) on delete set null,
  decision public.progress_status check (decision in ('accepted', 'rejected')),
  decision_reason text,
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (progress_id, attempt_number),
  check ((decision is null and decided_at is null and decided_by is null) or (decision is not null and decided_at is not null and decided_by is not null)),
  check ((reversed_at is null and reversed_by is null and reversal_reason is null) or (reversed_at is not null and reversed_by is not null and char_length(trim(reversal_reason)) > 0))
);

create table public.progress_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  progress_id uuid not null references public.requirement_progress (id) on delete cascade,
  attempt_id uuid not null references public.progress_attempts (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (user_id) on delete restrict,
  decision public.progress_status not null check (decision in ('accepted', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  assessor_id uuid not null references public.profiles (user_id) on delete restrict,
  decision public.assessment_decision not null,
  comments text not null default '',
  created_at timestamptz not null default now(),
  unique (enrollment_id)
);

create table public.investitures (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.enrollments (id) on delete cascade,
  recorded_by uuid not null references public.profiles (user_id) on delete restrict,
  rationale text not null check (char_length(trim(rationale)) > 0),
  invested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index enrollments_club_student_idx on public.enrollments (club_id, student_id);
create index requirement_progress_enrollment_idx on public.requirement_progress (enrollment_id);
create index progress_attempts_progress_idx on public.progress_attempts (progress_id, attempt_number desc);
create index progress_reviews_club_progress_idx on public.progress_reviews (club_id, progress_id, created_at desc);

create function public.enrollment_belongs_to_club(target_enrollment_id uuid, target_club_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments where id = target_enrollment_id and club_id = target_club_id);
$$;

create function public.can_access_enrollment(target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.id = target_enrollment_id and (
      public.is_club_member(e.club_id, array['admin', 'instructor', 'viewer']::public.club_role[])
      or s.guardian_user_id = auth.uid()
      or s.student_user_id = auth.uid()
    )
  );
$$;

create function public.initialize_enrollment_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.catalog_versions cv where cv.id = new.catalog_version_id and cv.catalog_id = new.catalog_id and cv.status = 'published'
  ) then raise exception 'enrollments must pin a published version of their catalog'; end if;
  if not exists (select 1 from public.students s where s.id = new.student_id and s.club_id = new.club_id) then
    raise exception 'student must belong to enrollment club';
  end if;
  insert into public.requirement_progress (enrollment_id, requirement_id)
  select new.id, r.id from public.requirements r where r.catalog_version_id = new.catalog_version_id;
  return new;
end;
$$;

create function public.prevent_enrollment_version_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.catalog_id <> old.catalog_id or new.student_id <> old.student_id or new.school_year <> old.school_year then
    raise exception 'enrollment identity and pinned catalog version are immutable; use an audited migration';
  end if;
  if new.catalog_version_id <> old.catalog_version_id and current_setting('app.allow_version_migration', true) is distinct from 'on' then
    raise exception 'enrollment version is immutable; use an audited migration';
  end if;
  return new;
end;
$$;

create function public.migrate_enrollment_version(target_enrollment_id uuid, target_catalog_version_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare target_enrollment public.enrollments;
begin
  select * into target_enrollment from public.enrollments where id = target_enrollment_id for update;
  if not found or not public.is_club_member(target_enrollment.club_id, array['admin']::public.club_role[]) then
    raise exception 'only a club administrator can migrate an enrollment';
  end if;
  if not exists (select 1 from public.catalog_versions where id = target_catalog_version_id and catalog_id = target_enrollment.catalog_id and status = 'published') then
    raise exception 'target version must be published and belong to the enrolled catalog';
  end if;
  perform set_config('app.allow_version_migration', 'on', true);
  update public.enrollments set catalog_version_id = target_catalog_version_id where id = target_enrollment_id;
  insert into public.requirement_progress (enrollment_id, requirement_id)
  select target_enrollment_id, r.id from public.requirements r
  where r.catalog_version_id = target_catalog_version_id
  on conflict (enrollment_id, requirement_id) do nothing;
end;
$$;

create function public.submit_progress_attempt(target_progress_id uuid, submission_text_input text default null, credit_key_input text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_progress public.requirement_progress; next_attempt integer; new_attempt_id uuid;
begin
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id where e.id = target_progress.enrollment_id and (s.guardian_user_id = auth.uid() or s.student_user_id = auth.uid())) then raise exception 'only a linked guardian or student can submit progress'; end if;
  if target_progress.status not in ('draft', 'rejected') then raise exception 'only draft or rejected progress can be submitted'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.progress_attempts where progress_id = target_progress_id;
  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, submission_text, credit_key) values (target_progress_id, next_attempt, auth.uid(), submission_text_input, credit_key_input) returning id into new_attempt_id;
  update public.requirement_progress set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null where id = target_progress_id;
  return new_attempt_id;
end;
$$;

create function public.review_progress_attempt(target_progress_id uuid, target_attempt_id uuid, decision_input public.progress_status, reason_input text default null)
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
  if decision_input = 'accepted' and target_attempt.credit_key is not null and not target_requirement.allow_reuse and exists (select 1 from public.requirement_progress p where p.id <> target_progress_id and p.status = 'accepted' and p.accepted_credit_key = target_attempt.credit_key and p.enrollment_id = target_progress.enrollment_id) then raise exception 'a completion item can only be credited once'; end if;
  update public.progress_attempts set decision = decision_input, decision_reason = reason_input, decided_at = now(), decided_by = auth.uid() where id = target_attempt_id;
  update public.requirement_progress set status = decision_input, reviewed_at = now(), reviewer_id = auth.uid(), accepted_at = case when decision_input = 'accepted' then now() else null end, accepted_credit_key = case when decision_input = 'accepted' then target_attempt.credit_key else null end where id = target_progress_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, target_attempt_id, auth.uid(), decision_input, reason_input);
  return target_progress.enrollment_id;
end;
$$;

create function public.reverse_progress_acceptance(target_progress_id uuid, target_attempt_id uuid, rationale_input text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_progress public.requirement_progress; target_club_id uuid;
begin
  if char_length(trim(coalesce(rationale_input, ''))) = 0 then raise exception 'a reversal rationale is required'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found then raise exception 'only an authorized reviewer can reverse progress'; end if;
  select e.club_id into target_club_id from public.enrollments e where e.id = target_progress.enrollment_id for update;
  if not found or not public.is_club_member(target_club_id, array['admin', 'instructor']::public.club_role[]) then raise exception 'only an authorized reviewer can reverse progress'; end if;
  if target_progress.status <> 'accepted' then raise exception 'only accepted progress can be reversed'; end if;
  update public.progress_attempts set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = rationale_input where id = target_attempt_id and progress_id = target_progress_id and decision = 'accepted' and reversed_at is null;
  if not found then raise exception 'accepted attempt not found'; end if;
  update public.requirement_progress set status = 'rejected', reviewed_at = now(), reviewer_id = auth.uid(), accepted_at = null, accepted_credit_key = null where id = target_progress_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, target_attempt_id, auth.uid(), 'rejected', rationale_input);
  return target_progress.enrollment_id;
end;
$$;

create function public.requirement_complete(target_enrollment_id uuid, target_requirement_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare target_requirement public.requirements; child_requirement public.requirements; child_count integer := 0; completed_count integer := 0;
begin
  select * into target_requirement from public.requirements where id = target_requirement_id;
  if not found then return false; end if;
  for child_requirement in select * from public.requirements where parent_requirement_id = target_requirement_id loop
    child_count := child_count + 1;
    if public.requirement_complete(target_enrollment_id, child_requirement.id) then completed_count := completed_count + 1; end if;
  end loop;
  if child_count = 0 then return exists (select 1 from public.requirement_progress where enrollment_id = target_enrollment_id and requirement_id = target_requirement_id and status = 'accepted'); end if;
  if target_requirement.completion_rule = 'any' then return completed_count >= 1; end if;
  if target_requirement.completion_rule = 'minimum_n' then return completed_count >= target_requirement.minimum_children; end if;
  return completed_count = child_count;
end;
$$;

create function public.manually_complete_progress(target_progress_id uuid, rationale_input text, credit_key_input text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_progress public.requirement_progress; target_requirement public.requirements; target_club_id uuid; next_attempt integer; new_attempt_id uuid;
begin
  if char_length(trim(coalesce(rationale_input, ''))) = 0 then raise exception 'manual completion requires a rationale'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found then raise exception 'only an authorized reviewer can manually complete progress'; end if;
  select e.club_id into target_club_id from public.enrollments e where e.id = target_progress.enrollment_id for update;
  if not found or not public.is_club_member(target_club_id, array['admin', 'instructor']::public.club_role[]) then raise exception 'only an authorized reviewer can manually complete progress'; end if;
  if target_progress.status = 'accepted' then raise exception 'accepted progress must be reversed before it can be manually completed'; end if;
  select * into target_requirement from public.requirements where id = target_progress.requirement_id;
  if credit_key_input is not null and not target_requirement.allow_reuse and exists (select 1 from public.requirement_progress p where p.id <> target_progress_id and p.status = 'accepted' and p.accepted_credit_key = credit_key_input and p.enrollment_id = target_progress.enrollment_id) then raise exception 'a completion item can only be credited once'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.progress_attempts where progress_id = target_progress_id;
  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, submission_text, credit_key, decision, decision_reason, decided_at, decided_by) values (target_progress_id, next_attempt, auth.uid(), null, credit_key_input, 'accepted', rationale_input, now(), auth.uid()) returning id into new_attempt_id;
  update public.requirement_progress set status = 'accepted', manual_rationale = rationale_input, submitted_at = now(), reviewed_at = now(), reviewer_id = auth.uid(), accepted_at = now(), accepted_credit_key = credit_key_input where id = target_progress_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, new_attempt_id, auth.uid(), 'accepted', rationale_input);
  return target_progress.enrollment_id;
end;
$$;

create function public.enrollment_ready_for_assessment(target_enrollment_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare target_enrollment public.enrollments; root_requirement public.requirements;
begin
  select * into target_enrollment from public.enrollments where id = target_enrollment_id;
  if not found then return false; end if;
  for root_requirement in select r.* from public.requirements r where r.catalog_version_id = target_enrollment.catalog_version_id and r.parent_requirement_id is null and not r.optional loop
    if not public.requirement_complete(target_enrollment_id, root_requirement.id) then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.record_assessment(target_enrollment_id uuid, decision_input public.assessment_decision, comments_input text default '')
returns void language plpgsql security invoker set search_path = public as $$
declare target_club_id uuid;
begin
  select club_id into target_club_id from public.enrollments where id = target_enrollment_id;
  if target_club_id is null or not public.is_club_member(target_club_id, array['admin', 'instructor']::public.club_role[]) then raise exception 'only an authorized assessor can record an assessment'; end if;
  if decision_input = 'passed' and not public.enrollment_ready_for_assessment(target_enrollment_id) then raise exception 'incomplete progress cannot pass assessment'; end if;
  insert into public.assessments (enrollment_id, assessor_id, decision, comments) values (target_enrollment_id, auth.uid(), decision_input, comments_input) on conflict (enrollment_id) do update set assessor_id = excluded.assessor_id, decision = excluded.decision, comments = excluded.comments, created_at = now();
end;
$$;

create function public.record_investiture(target_enrollment_id uuid, rationale_input text)
returns void language plpgsql security invoker set search_path = public as $$
declare target_club_id uuid;
begin
  select club_id into target_club_id from public.enrollments where id = target_enrollment_id;
  if target_club_id is null or not public.is_club_member(target_club_id, array['admin']::public.club_role[]) then raise exception 'only a club administrator can record investiture'; end if;
  if not exists (select 1 from public.assessments where enrollment_id = target_enrollment_id and decision = 'passed') or not public.enrollment_ready_for_assessment(target_enrollment_id) then raise exception 'a passing assessment and complete progress are required before investiture'; end if;
  insert into public.investitures (enrollment_id, recorded_by, rationale) values (target_enrollment_id, auth.uid(), rationale_input);
  update public.enrollments set status = 'completed', completed_at = now() where id = target_enrollment_id;
end;
$$;

create trigger enrollments_updated_at before update on public.enrollments for each row execute function public.set_updated_at();
create trigger requirement_progress_updated_at before update on public.requirement_progress for each row execute function public.set_updated_at();
create trigger initialize_enrollment_progress after insert on public.enrollments for each row execute function public.initialize_enrollment_progress();
create trigger prevent_enrollment_version_change before update on public.enrollments for each row execute function public.prevent_enrollment_version_change();

alter table public.enrollments enable row level security;
alter table public.requirement_progress enable row level security;
alter table public.progress_attempts enable row level security;
alter table public.progress_reviews enable row level security;
alter table public.assessments enable row level security;
alter table public.investitures enable row level security;

create policy "scoped users read enrollments" on public.enrollments for select using (public.can_access_enrollment(id));
create policy "admins and instructors create enrollments" on public.enrollments for insert with check (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[]) and enrolled_by = auth.uid());
create policy "admins and instructors update enrollments" on public.enrollments for update using (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[])) with check (public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[]));

create policy "scoped users read progress" on public.requirement_progress for select using (public.can_access_enrollment(enrollment_id));
create policy "instructors manage progress" on public.requirement_progress for update using (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[]))) with check (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[])));

create policy "scoped users read attempts" on public.progress_attempts for select using (exists (select 1 from public.requirement_progress p where p.id = progress_id and public.can_access_enrollment(p.enrollment_id)));
create policy "linked users submit attempts" on public.progress_attempts for insert with check (submitted_by = auth.uid() and exists (select 1 from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id join public.students s on s.id = e.student_id where p.id = progress_id and (s.guardian_user_id = auth.uid() or s.student_user_id = auth.uid())));
create policy "instructors review attempts" on public.progress_attempts for update using (exists (select 1 from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id where p.id = progress_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[]))) with check (exists (select 1 from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id where p.id = progress_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[])));

create policy "scoped users read reviews" on public.progress_reviews for select using (public.can_access_enrollment((select enrollment_id from public.requirement_progress where id = progress_id)));
create policy "instructors create reviews" on public.progress_reviews for insert with check (reviewer_id = auth.uid() and public.is_club_member(club_id, array['admin', 'instructor']::public.club_role[]) and public.enrollment_belongs_to_club((select enrollment_id from public.requirement_progress where id = progress_id), club_id));

create policy "scoped users read assessments" on public.assessments for select using (public.can_access_enrollment(enrollment_id));
create policy "instructors manage assessments" on public.assessments for all using (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[]))) with check (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin', 'instructor']::public.club_role[])));
create policy "scoped users read investitures" on public.investitures for select using (public.can_access_enrollment(enrollment_id));
create policy "admins manage investitures" on public.investitures for all using (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin']::public.club_role[]))) with check (exists (select 1 from public.enrollments e where e.id = enrollment_id and public.is_club_member(e.club_id, array['admin']::public.club_role[])));

revoke all on function public.enrollment_belongs_to_club(uuid, uuid) from public;
revoke all on function public.can_access_enrollment(uuid) from public;
grant execute on function public.enrollment_belongs_to_club(uuid, uuid) to authenticated;
grant execute on function public.can_access_enrollment(uuid) to authenticated;
revoke all on function public.migrate_enrollment_version(uuid, uuid) from public;
grant execute on function public.migrate_enrollment_version(uuid, uuid) to authenticated;
revoke all on function public.submit_progress_attempt(uuid, text, text) from public;
revoke all on function public.review_progress_attempt(uuid, uuid, public.progress_status, text) from public;
revoke all on function public.reverse_progress_acceptance(uuid, uuid, text) from public;
revoke all on function public.requirement_complete(uuid, uuid) from public;
revoke all on function public.enrollment_ready_for_assessment(uuid) from public;
revoke all on function public.record_assessment(uuid, public.assessment_decision, text) from public;
revoke all on function public.record_investiture(uuid, text) from public;
revoke all on function public.manually_complete_progress(uuid, text, text) from public;
grant execute on function public.submit_progress_attempt(uuid, text, text) to authenticated;
grant execute on function public.review_progress_attempt(uuid, uuid, public.progress_status, text) to authenticated;
grant execute on function public.reverse_progress_acceptance(uuid, uuid, text) to authenticated;
grant execute on function public.record_assessment(uuid, public.assessment_decision, text) to authenticated;
grant execute on function public.record_investiture(uuid, text) to authenticated;
grant execute on function public.manually_complete_progress(uuid, text, text) to authenticated;

-- Reconcile legacy learners to the v2 member graph before enabling the content
-- cutover.  This migration never guesses a DOB, unit, or identity: unresolved
-- rows are ledgered and fail closed until a director remediates them.

create type public.v2_cutover_state as enum ('PENDING_RECONCILIATION', 'ENABLED', 'ROLLED_BACK');

create table public.v2_cutover_control (
  singleton boolean primary key default true check (singleton),
  state public.v2_cutover_state not null default 'PENDING_RECONCILIATION',
  reconciled_at timestamptz,
  reconciled_by uuid references public.profiles(user_id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.v2_cutover_control (singleton) values (true) on conflict do nothing;

create table public.member_legacy_reconciliation_ledger (
  legacy_student_id uuid primary key references public.students(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  member_id uuid references public.club_members(id) on delete restrict,
  outcome text not null check (outcome in ('RECONCILED', 'PENDING_REMEDIATION')),
  reason text not null check (char_length(reason) between 1 and 160),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz,
  unique (legacy_student_id, outcome)
);

create table public.member_legacy_student_links (
  legacy_student_id uuid primary key references public.students(id) on delete restrict,
  member_id uuid not null unique references public.club_members(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  linked_at timestamptz not null default now(),
  check (club_id is not null)
);

-- Only a pre-existing v2 member with the same authenticated identity AND an
-- active unit is provable. Legacy birth_year is deliberately insufficient.
insert into public.member_legacy_student_links (legacy_student_id, member_id, club_id)
select s.id, m.id, s.club_id
from public.students s
join public.club_members m on m.club_id = s.club_id and m.user_id = s.student_user_id
join public.member_unit_assignments mua on mua.member_id = m.id and mua.ended_at is null
where m.lifecycle = 'ACTIVE'
on conflict do nothing;

insert into public.member_legacy_reconciliation_ledger (legacy_student_id, club_id, member_id, outcome, reason, snapshot, reconciled_at)
select s.id, s.club_id, l.member_id,
       case when l.member_id is null then 'PENDING_REMEDIATION' else 'RECONCILED' end,
       case when l.member_id is null then 'missing proven v2 DOB, identity, or active unit' else 'pre-existing v2 identity and active unit matched' end,
       jsonb_build_object('displayName', s.display_name, 'birthYear', s.birth_year, 'guardianUserId', s.guardian_user_id, 'studentUserId', s.student_user_id),
       case when l.member_id is null then null else now() end
from public.students s
left join public.member_legacy_student_links l on l.legacy_student_id = s.id
on conflict (legacy_student_id) do nothing;

insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
select l.club_id, null, 'v2.cutover.reconciliation_snapshotted', 'legacy_student', l.legacy_student_id,
       jsonb_build_object('outcome', l.outcome, 'reason', l.reason, 'memberId', l.member_id)
from public.member_legacy_reconciliation_ledger l
where not exists (
  select 1 from public.audit_log a
  where a.action = 'v2.cutover.reconciliation_snapshotted' and a.entity_id = l.legacy_student_id
);

create or replace function public.v2_cutover_enabled()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.v2_cutover_control where singleton and state = 'ENABLED')
$$;

create or replace function public.actor_can_access_v2_enrollment(actor_id uuid, target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.v2_cutover_enabled() and exists (
    select 1 from public.enrollments e
    join public.member_legacy_student_links l on l.legacy_student_id = e.student_id and l.club_id = e.club_id
    where e.id = target_enrollment_id
      and public.actor_can_access_v2_member(actor_id, l.member_id)
  )
$$;

create or replace function public.actor_can_review_v2_enrollment(actor_id uuid, target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.v2_cutover_enabled() and exists (
    select 1 from public.enrollments e
    join public.member_legacy_student_links l on l.legacy_student_id = e.student_id and l.club_id = e.club_id
    join public.club_members target on target.id = l.member_id and target.lifecycle = 'ACTIVE'
    where e.id = target_enrollment_id and (
      public.actor_has_v2_club_governance(actor_id, e.club_id)
      or public.actor_has_active_v2_staff_unit(actor_id, target.id)
    )
  )
$$;

create or replace function public.actor_owns_v2_enrollment(actor_id uuid, target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.v2_cutover_enabled() and exists (
    select 1 from public.enrollments e
    join public.member_legacy_student_links l on l.legacy_student_id = e.student_id and l.club_id = e.club_id
    where e.id = target_enrollment_id and public.actor_is_active_v2_member(actor_id, l.member_id)
  )
$$;

create or replace function public.can_access_enrollment(target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.actor_can_access_v2_enrollment(auth.uid(), target_enrollment_id)
$$;
create or replace function public.can_review_progress(target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.requirement_progress p where p.id = target_progress_id and public.actor_can_review_v2_enrollment(auth.uid(), p.enrollment_id))
$$;
create or replace function public.can_submit_evidence(target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.requirement_progress p where p.id = target_progress_id and public.actor_owns_v2_enrollment(auth.uid(), p.enrollment_id))
$$;
create or replace function public.can_access_evidence(target_evidence_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.evidence ev join public.requirement_progress p on p.id = ev.progress_id
    where ev.id = target_evidence_id and public.actor_can_access_v2_enrollment(auth.uid(), p.enrollment_id)
  )
$$;
-- Migration 030's command-owner facades call these actor-explicit helpers.
-- Replace their legacy guardian/evaluator graph too, rather than relying on
-- browser-facing RLS helpers that use auth.uid().
create or replace function public.actor_can_submit_progress(actor_id uuid, target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.requirement_progress p
    where p.id = target_progress_id
      and public.actor_owns_v2_enrollment(actor_id, p.enrollment_id)
  )
$$;
create or replace function public.actor_can_review_progress(actor_id uuid, target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.requirement_progress p
    where p.id = target_progress_id
      and public.actor_can_review_v2_enrollment(actor_id, p.enrollment_id)
  )
$$;

-- Replace every content SELECT policy; the helper predicates are intentionally
-- shared by cards, progress, reviews, assessments, and evidence.
do $$
declare policy_row record;
begin
  for policy_row in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename = any (array['enrollments','requirement_progress','progress_attempts','progress_reviews','assessments','investitures','evidence','attempt_evidence'])
    and cmd = 'SELECT'
  loop execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename); end loop;
end;
$$;
create policy "v2 scoped enrollment reads" on public.enrollments for select using (public.can_access_enrollment(id));
create policy "v2 scoped progress reads" on public.requirement_progress for select using (public.can_access_enrollment(enrollment_id));
create policy "v2 scoped attempt reads" on public.progress_attempts for select using (exists (select 1 from public.requirement_progress p where p.id = progress_id and public.can_access_enrollment(p.enrollment_id)));
create policy "v2 scoped review reads" on public.progress_reviews for select using (exists (select 1 from public.requirement_progress p where p.id = progress_id and public.can_access_enrollment(p.enrollment_id)));
create policy "v2 scoped assessment reads" on public.assessments for select using (public.can_access_enrollment(enrollment_id));
create policy "v2 scoped investiture reads" on public.investitures for select using (public.can_access_enrollment(enrollment_id));
create policy "v2 scoped evidence reads" on public.evidence for select using (public.can_access_evidence(id));
create policy "v2 scoped attempt evidence reads" on public.attempt_evidence for select using (exists (select 1 from public.evidence ev where ev.id = evidence_id and public.can_access_evidence(ev.id)));

-- Audits are historical records, not a legacy-role capability. Directors retain
-- their club audit trail while guardians, evaluators, staff from other units,
-- and SYSTEM_ADMIN remain outside the protected-content audit reader.
do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd = 'SELECT'
  loop execute format('drop policy if exists %I on public.audit_log', policy_row.policyname); end loop;
end;
$$;
create policy "v2 directors read club audit" on public.audit_log for select using (public.actor_has_v2_club_governance(auth.uid(), club_id));

-- The prior staff-assignment policy traversed `units`, whose browser SELECT
-- privilege is intentionally closed after cutover. Resolve club scope through
-- the assigned member instead so the v2 reader can inspect its own assignment
-- without reopening the legacy unit-reader surface.
drop policy if exists "v2 actors read scoped staff units" on public.staff_unit_assignments;
create policy "v2 actors read scoped staff units" on public.staff_unit_assignments for select
  using (
    exists (select 1 from public.club_members assigned where assigned.id = member_id and public.actor_has_v2_club_governance(auth.uid(), assigned.club_id))
    or exists (select 1 from public.club_members self_member where self_member.id = member_id and self_member.user_id = auth.uid() and self_member.lifecycle = 'ACTIVE')
  );

-- Existing state-machine functions are retained, but their authorization
-- predicates now use the v2 graph. Evaluation is staff/director only; the
-- historical EVALUATOR assignment is no longer an authority.
create or replace function public.record_assessment(target_enrollment_id uuid, decision_input public.assessment_decision, comments_input text default '')
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.actor_can_review_v2_enrollment(public.request_actor_id(), target_enrollment_id) then raise exception 'only v2 scoped staff or director may record an assessment' using errcode = '42501'; end if;
  if decision_input = 'passed' and not public.enrollment_ready_for_assessment(target_enrollment_id) then raise exception 'incomplete progress cannot pass assessment' using errcode = '23514'; end if;
  insert into public.assessments (enrollment_id, assessor_id, decision, comments) values (target_enrollment_id, public.request_actor_id(), decision_input, coalesce(comments_input, ''))
  on conflict (enrollment_id) do update set assessor_id = excluded.assessor_id, decision = excluded.decision, comments = excluded.comments, created_at = now();
end;
$$;

create or replace function public.review_progress_attempt(target_progress_id uuid, target_attempt_id uuid, decision_input public.progress_status, reason_input text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare target_progress public.requirement_progress; target_attempt public.progress_attempts; target_requirement public.requirements; target_club_id uuid;
begin
  if decision_input not in ('accepted', 'rejected') then raise exception 'review decision must be accepted or rejected' using errcode = '23514'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not public.actor_can_review_v2_enrollment(public.request_actor_id(), target_progress.enrollment_id) then raise exception 'only v2 scoped staff or director may decide progress' using errcode = '42501'; end if;
  if target_progress.status <> 'submitted' then raise exception 'only submitted progress can be reviewed' using errcode = '23514'; end if;
  select * into target_attempt from public.progress_attempts where id = target_attempt_id and progress_id = target_progress_id for update;
  if not found or target_attempt.decision is not null then raise exception 'attempt is unavailable for review' using errcode = '23514'; end if;
  select * into target_requirement from public.requirements where id = target_progress.requirement_id;
  if decision_input = 'accepted' and target_attempt.credit_key is not null and not target_requirement.allow_reuse and exists (select 1 from public.requirement_progress p where p.id <> target_progress_id and p.status = 'accepted' and p.accepted_credit_key = target_attempt.credit_key and p.enrollment_id = target_progress.enrollment_id) then raise exception 'a completion item can only be credited once' using errcode = '23514'; end if;
  update public.progress_attempts set decision = decision_input, decision_reason = reason_input, decided_at = now(), decided_by = public.request_actor_id() where id = target_attempt_id;
  update public.requirement_progress set status = decision_input, reviewed_at = now(), reviewer_id = public.request_actor_id(), accepted_at = case when decision_input = 'accepted' then now() else null end, accepted_credit_key = case when decision_input = 'accepted' then target_attempt.credit_key else null end where id = target_progress_id;
  select club_id into target_club_id from public.enrollments where id = target_progress.enrollment_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, target_attempt_id, public.request_actor_id(), decision_input, reason_input);
  return target_progress.enrollment_id;
end;
$$;

create or replace function public.reverse_progress_acceptance(target_progress_id uuid, target_attempt_id uuid, rationale_input text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare target_progress public.requirement_progress; target_club_id uuid;
begin
  if char_length(btrim(coalesce(rationale_input, ''))) = 0 then raise exception 'a reversal rationale is required' using errcode = '23514'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not public.actor_can_review_v2_enrollment(public.request_actor_id(), target_progress.enrollment_id) then raise exception 'only v2 scoped staff or director may reverse progress' using errcode = '42501'; end if;
  if target_progress.status <> 'accepted' then raise exception 'only accepted progress can be reversed' using errcode = '23514'; end if;
  update public.progress_attempts set reversed_at = now(), reversed_by = public.request_actor_id(), reversal_reason = rationale_input where id = target_attempt_id and progress_id = target_progress_id and decision = 'accepted' and reversed_at is null;
  if not found then raise exception 'accepted attempt not found' using errcode = '23514'; end if;
  update public.requirement_progress set status = 'rejected', reviewed_at = now(), reviewer_id = public.request_actor_id(), accepted_at = null, accepted_credit_key = null where id = target_progress_id;
  select club_id into target_club_id from public.enrollments where id = target_progress.enrollment_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, target_attempt_id, public.request_actor_id(), 'rejected', rationale_input);
  return target_progress.enrollment_id;
end;
$$;

create or replace function public.manually_complete_progress(target_progress_id uuid, rationale_input text, credit_key_input text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare target_progress public.requirement_progress; next_attempt integer; attempt_id uuid; target_club_id uuid;
begin
  if char_length(btrim(coalesce(rationale_input, ''))) = 0 then raise exception 'manual completion requires a rationale' using errcode = '23514'; end if;
  select p.* into target_progress from public.requirement_progress p where p.id = target_progress_id for update;
  if not found or not public.actor_can_review_v2_enrollment(public.request_actor_id(), target_progress.enrollment_id) then raise exception 'only v2 scoped staff or director may manually complete progress' using errcode = '42501'; end if;
  if target_progress.status = 'accepted' then raise exception 'accepted progress must be reversed before it can be manually completed' using errcode = '23514'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.progress_attempts where progress_id = target_progress_id;
  insert into public.progress_attempts (progress_id, attempt_number, submitted_by, credit_key, decision, decision_reason, decided_at, decided_by) values (target_progress_id, next_attempt, public.request_actor_id(), credit_key_input, 'accepted', rationale_input, now(), public.request_actor_id()) returning id into attempt_id;
  update public.requirement_progress set status = 'accepted', manual_rationale = rationale_input, submitted_at = now(), reviewed_at = now(), reviewer_id = public.request_actor_id(), accepted_at = now(), accepted_credit_key = credit_key_input where id = target_progress_id;
  select club_id into target_club_id from public.enrollments where id = target_progress.enrollment_id;
  insert into public.progress_reviews (club_id, progress_id, attempt_id, reviewer_id, decision, reason) values (target_club_id, target_progress_id, attempt_id, public.request_actor_id(), 'accepted', rationale_input);
  return target_progress.enrollment_id;
end;
$$;

create or replace function public.record_investiture(target_enrollment_id uuid, rationale_input text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare target_club_id uuid;
begin
  select club_id into target_club_id from public.enrollments where id = target_enrollment_id for update;
  if target_club_id is null or not public.actor_has_v2_club_governance(public.request_actor_id(), target_club_id) or not public.v2_cutover_enabled() then raise exception 'only a v2 scoped director can record investiture' using errcode = '42501'; end if;
  if not exists (select 1 from public.assessments where enrollment_id = target_enrollment_id and decision = 'passed') or not public.enrollment_ready_for_assessment(target_enrollment_id) then raise exception 'a passing assessment and complete progress are required before investiture' using errcode = '23514'; end if;
  insert into public.investitures (enrollment_id, recorded_by, rationale) values (target_enrollment_id, public.request_actor_id(), rationale_input);
  update public.enrollments set status = 'completed', completed_at = now() where id = target_enrollment_id;
end;
$$;

-- Reconcile first; only an owner-level migration/test operation may enable the
-- gate. Production starts fail-closed, and rollback preserves all ledger/history.
alter table public.v2_cutover_control enable row level security;
alter table public.member_legacy_reconciliation_ledger enable row level security;
alter table public.member_legacy_student_links enable row level security;
create policy "v2 linked members read their linkage" on public.member_legacy_student_links for select using (public.actor_can_access_v2_member(auth.uid(), member_id));
create policy "v2 linked members read reconciliation" on public.member_legacy_reconciliation_ledger for select using (member_id is not null and public.actor_can_access_v2_member(auth.uid(), member_id));
revoke all on table public.v2_cutover_control, public.member_legacy_reconciliation_ledger, public.member_legacy_student_links from public, anon, authenticated;
grant select on public.member_legacy_reconciliation_ledger, public.member_legacy_student_links to authenticated;
grant select, insert, update on public.v2_cutover_control, public.member_legacy_reconciliation_ledger, public.member_legacy_student_links to pathfinders_scoped_command_owner;
revoke all on function public.v2_cutover_enabled(), public.actor_can_access_v2_enrollment(uuid, uuid), public.actor_can_review_v2_enrollment(uuid, uuid), public.actor_owns_v2_enrollment(uuid, uuid) from public, anon;
grant execute on function public.v2_cutover_enabled(), public.actor_can_access_v2_enrollment(uuid, uuid), public.actor_can_review_v2_enrollment(uuid, uuid), public.actor_owns_v2_enrollment(uuid, uuid) to authenticated, pathfinders_scoped_command_owner;

grant usage, create on schema public to pathfinders_scoped_command_owner;
grant usage on schema auth to pathfinders_scoped_command_owner;
alter function public.record_assessment(uuid, public.assessment_decision, text) owner to pathfinders_scoped_command_owner;
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) owner to pathfinders_scoped_command_owner;
alter function public.reverse_progress_acceptance(uuid, uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.manually_complete_progress(uuid, text, text) owner to pathfinders_scoped_command_owner;
alter function public.record_investiture(uuid, text) owner to pathfinders_scoped_command_owner;
revoke create on schema public from pathfinders_scoped_command_owner;

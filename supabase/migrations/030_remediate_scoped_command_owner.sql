-- Forward-only remediation for the uncommitted 029 command-owner boundary.
-- Reuse 029's non-login, non-inheriting BYPASSRLS owner. Managed Supabase
-- requires postgres to retain its administrative SET ROLE membership for
-- ownership transfer; no application-capable role may be a member of this role.
do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = 'pathfinders_scoped_command_owner'
      and not rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and rolbypassrls
  ) then
    raise exception 'pathfinders_scoped_command_owner must be NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and BYPASSRLS';
  end if;
end;
$$;

comment on role pathfinders_scoped_command_owner is
  'NOLOGIN/NOINHERIT BYPASSRLS owner for the 024/025 SECURITY DEFINER command boundary only. Managed Supabase postgres retains the sole administrative SET ROLE membership required for ownership transfer; no application-capable role may assume this role. JWT actor is captured at each command boundary and every command enforces explicit canonical scope predicates.';

-- already established by 029. Do not revoke it: on managed Supabase its
-- supabase_admin grantor cannot be impersonated by this migration executor.
grant usage, create on schema public to pathfinders_scoped_command_owner;
revoke all privileges on all tables in schema public from pathfinders_scoped_command_owner;
revoke all privileges on all sequences in schema public from pathfinders_scoped_command_owner;
revoke all on schema auth from pathfinders_scoped_command_owner;
revoke all on function auth.uid(), auth.jwt() from pathfinders_scoped_command_owner;

-- Grant only objects reached by the 024/025 commands and their private actor
-- helpers. Browser roles retain no direct domain-table DML under migration 027.
grant select, update on public.profiles, public.clubs to pathfinders_scoped_command_owner;
grant select, insert, update on public.students, public.role_assignments to pathfinders_scoped_command_owner;
grant select on public.organizations, public.units, public.requirements, public.catalog_sections to pathfinders_scoped_command_owner;
grant select, insert on public.catalogs, public.catalog_versions to pathfinders_scoped_command_owner;
grant select, insert, update on public.enrollments, public.requirement_progress, public.progress_attempts, public.assessments, public.evidence to pathfinders_scoped_command_owner;
grant insert on public.progress_reviews, public.investitures, public.audit_log to pathfinders_scoped_command_owner;
grant select, insert on public.attempt_evidence to pathfinders_scoped_command_owner;
grant select, insert, update on public.evidence_upload_rate_limits to pathfinders_scoped_command_owner;

-- The helper avoids the reserved auth schema and fails closed for absent,
-- malformed, or non-UUID claims. It is private to the command owner.
create or replace function public.request_actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  claim_sub text := nullif(btrim(current_setting('request.jwt.claim.sub', true)), '');
begin
  if claim_sub is null then
    begin
      claim_sub := nullif(btrim((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '');
    exception when sqlstate '22P02' then
      return null;
    end;
  end if;
  if claim_sub is null then return null; end if;
  return claim_sub::uuid;
exception when sqlstate '22P02' then
  return null;
end;
$$;

-- Actor projections execute as v3 and accept the request-bound actor explicitly;
-- authorization never derives from SECURITY DEFINER current_user or membership.
create or replace function public.actor_has_canonical_role_at_club(actor_id uuid, target_club_id uuid, allowed_roles public.canonical_role[])
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = actor_id and ra.club_id = target_club_id and ra.role = any(allowed_roles)
      and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.actor_has_canonical_role_in_unit(actor_id uuid, target_unit_id uuid, allowed_roles public.canonical_role[])
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = actor_id and ra.unit_id = target_unit_id and ra.role = any(allowed_roles)
      and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.actor_has_student_link(actor_id uuid, target_student_id uuid, allowed_roles public.canonical_role[] default array['PATHFINDER','GUARDIAN']::public.canonical_role[])
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = actor_id and ra.student_id = target_student_id and ra.role = any(allowed_roles)
      and ra.revoked_at is null and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
  );
$$;
create or replace function public.actor_can_submit_progress(actor_id uuid, target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.requirement_progress p
    join public.enrollments e on e.id = p.enrollment_id
    join public.students s on s.id = e.student_id
    where p.id = target_progress_id and (s.guardian_user_id = actor_id or s.student_user_id = actor_id)
  );
$$;
create or replace function public.actor_can_review_progress(actor_id uuid, target_progress_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id
    where p.id = target_progress_id and public.actor_has_canonical_role_at_club(actor_id, e.club_id, array['CLUB_DIRECTOR','INSTRUCTOR']::public.canonical_role[])
  );
$$;
create or replace function public.actor_can_access_evidence(actor_id uuid, target_evidence_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.evidence ev join public.requirement_progress p on p.id = ev.progress_id
    where ev.id = target_evidence_id and (public.actor_can_submit_progress(actor_id, p.id) or public.actor_can_review_progress(actor_id, p.id))
  );
$$;
create or replace function public.actor_is_club_member(actor_id uuid, target_club_id uuid, allowed_roles public.club_role[] default null)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select actor_id is not null and exists (
    select 1 from public.role_assignments ra
    where ra.user_id = actor_id and ra.club_id = target_club_id and ra.revoked_at is null
      and ra.active_from <= now() and (ra.active_until is null or ra.active_until > now())
      and (allowed_roles is null or ra.role = any(array_remove(array[
        case when 'admin' = any(allowed_roles) then 'CLUB_DIRECTOR'::public.canonical_role end,
        case when 'instructor' = any(allowed_roles) then 'INSTRUCTOR'::public.canonical_role end
      ], null)))
  );
$$;
create or replace function public.actor_consume_evidence_upload_rate_limit(actor_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare next_count integer;
begin
  if actor_id is null then raise exception 'an authenticated user is required to upload evidence'; end if;
  insert into public.evidence_upload_rate_limits as limits (user_id, window_started_at, upload_count)
  values (actor_id, date_trunc('hour', now()), 1)
  on conflict (user_id) do update set
    window_started_at = case when limits.window_started_at <= now() - interval '1 hour' then date_trunc('hour', now()) else limits.window_started_at end,
    upload_count = case when limits.window_started_at <= now() - interval '1 hour' then 1 else limits.upload_count + 1 end,
    updated_at = now()
  returning upload_count into next_count;
  return next_count;
end;
$$;

revoke all on function public.request_actor_id(),
  public.actor_has_canonical_role_at_club(uuid, uuid, public.canonical_role[]),
  public.actor_has_canonical_role_in_unit(uuid, uuid, public.canonical_role[]),
  public.actor_has_student_link(uuid, uuid, public.canonical_role[]),
  public.actor_can_submit_progress(uuid, uuid), public.actor_can_review_progress(uuid, uuid),
  public.actor_can_access_evidence(uuid, uuid), public.actor_is_club_member(uuid, uuid, public.club_role[]),
  public.actor_consume_evidence_upload_rate_limit(uuid)
from public, anon, authenticated;
grant execute on function public.request_actor_id(),
  public.actor_has_canonical_role_at_club(uuid, uuid, public.canonical_role[]),
  public.actor_has_canonical_role_in_unit(uuid, uuid, public.canonical_role[]),
  public.actor_has_student_link(uuid, uuid, public.canonical_role[]),
  public.actor_can_submit_progress(uuid, uuid), public.actor_can_review_progress(uuid, uuid),
  public.actor_can_access_evidence(uuid, uuid), public.actor_is_club_member(uuid, uuid, public.club_role[]),
  public.actor_consume_evidence_upload_rate_limit(uuid)
to pathfinders_scoped_command_owner;

-- Capture the request actor at every command boundary and replace legacy
-- implicit helpers with the actor-parameterized v3 helpers.
do $$
declare command_oid regprocedure; function_definition text;
begin
  foreach command_oid in array array[
    'public.update_own_profile(text)'::regprocedure,
    'public.update_club(uuid,text)'::regprocedure,
    'public.create_or_update_student(uuid,uuid,text,smallint,uuid,uuid)'::regprocedure,
    'public.assign_role(uuid,public.canonical_role,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'public.revoke_role(uuid)'::regprocedure,
    'public.publish_catalog_draft(uuid,public.catalog_class_type,text)'::regprocedure,
    'public.submit_progress_attempt(uuid,text,text,uuid[])'::regprocedure,
    'public.review_progress_attempt(uuid,uuid,public.progress_status,text)'::regprocedure,
    'public.reverse_progress_acceptance(uuid,uuid,text)'::regprocedure,
    'public.manually_complete_progress(uuid,text,text)'::regprocedure,
    'public.record_investiture(uuid,text)'::regprocedure,
    'public.prepare_evidence_upload(uuid,text,bigint)'::regprocedure,
    'public.finalize_evidence_deletion(uuid)'::regprocedure,
    'public.prepare_evidence_deletion(uuid)'::regprocedure,
    'public.set_evidence_legal_hold(uuid,boolean)'::regprocedure,
    'public.enroll_student(uuid,uuid,uuid,smallint)'::regprocedure,
    'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure
  ] loop
    function_definition := pg_get_functiondef(command_oid);
    if function_definition ~* E'\n[[:space:]]*declare[[:space:]]+' then
      function_definition := regexp_replace(function_definition, E'(\n[[:space:]]*declare[[:space:]]+)', E'\\1request_actor_id uuid := public.request_actor_id();\n  ', 'i');
    else
      function_definition := regexp_replace(function_definition, E'(\n[[:space:]]*begin[[:space:]]+)', E'\ndeclare\n  request_actor_id uuid := public.request_actor_id();\nbegin\n', 'i');
    end if;
    function_definition := replace(function_definition, 'auth.uid()', 'request_actor_id');
    function_definition := replace(function_definition, 'public.has_canonical_role_at_club(', 'public.actor_has_canonical_role_at_club(request_actor_id, ');
    function_definition := replace(function_definition, 'public.has_canonical_role_in_unit(', 'public.actor_has_canonical_role_in_unit(request_actor_id, ');
    function_definition := replace(function_definition, 'public.has_student_link(', 'public.actor_has_student_link(request_actor_id, ');
    function_definition := replace(function_definition, 'public.can_review_progress(', 'public.actor_can_review_progress(request_actor_id, ');
    function_definition := replace(function_definition, 'public.can_access_evidence(', 'public.actor_can_access_evidence(request_actor_id, ');
    function_definition := replace(function_definition, 'public.can_submit_evidence(', 'public.actor_can_submit_progress(request_actor_id, ');
    function_definition := replace(function_definition, 'public.is_club_member(', 'public.actor_is_club_member(request_actor_id, ');
    function_definition := replace(function_definition, 'public.consume_evidence_upload_rate_limit()', 'public.actor_consume_evidence_upload_rate_limit(request_actor_id)');
    -- `auth.uid()` may still be reached indirectly by a legacy trigger or helper
    -- while PostgreSQL evaluates this command. A malformed JWT must fail closed
    -- as command authorization rather than expose its parse error.
    if command_oid = 'public.submit_progress_attempt(uuid,text,text,uuid[])'::regprocedure then
      function_definition := regexp_replace(
        function_definition,
        E'\nend;\n\\$function\\$',
        E'\nexception when sqlstate ''22P02'' then\n  raise exception ''only a linked guardian or student can submit progress'' using errcode = ''P0001'';\nend;\n$function$'
      );
    end if;
    execute function_definition;
  end loop;
end;
$$;

create or replace function public.authorized_evidence_download(target_evidence_id uuid)
returns table (club_id uuid, object_path text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request_actor_id uuid := public.request_actor_id();
  target_evidence public.evidence;
begin
  select ev.* into target_evidence from public.evidence ev
  where ev.id = target_evidence_id and ev.scan_status = 'clean' and ev.deleted_at is null
    and public.actor_can_access_evidence(request_actor_id, ev.id);
  if not found then return; end if;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_evidence.club_id, request_actor_id, 'evidence.download_authorized', 'evidence', target_evidence.id, jsonb_build_object('delivery', 'signed_url'));
  return query select target_evidence.club_id, target_evidence.object_path;
end;
$$;

-- The existing command owner owns every 024/025 command. The sole postgres
-- membership is an administrative ownership-transfer exception, never an
-- application execution path.
alter function public.update_own_profile(text) owner to pathfinders_scoped_command_owner;
alter function public.update_club(uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.revoke_role(uuid) owner to pathfinders_scoped_command_owner;
alter function public.publish_catalog_draft(uuid, public.catalog_class_type, text) owner to pathfinders_scoped_command_owner;
alter function public.submit_progress_attempt(uuid, text, text, uuid[]) owner to pathfinders_scoped_command_owner;
alter function public.review_progress_attempt(uuid, uuid, public.progress_status, text) owner to pathfinders_scoped_command_owner;
alter function public.reverse_progress_acceptance(uuid, uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.manually_complete_progress(uuid, text, text) owner to pathfinders_scoped_command_owner;
alter function public.record_investiture(uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.prepare_evidence_upload(uuid, text, bigint) owner to pathfinders_scoped_command_owner;
alter function public.finalize_evidence_deletion(uuid) owner to pathfinders_scoped_command_owner;
alter function public.prepare_evidence_deletion(uuid) owner to pathfinders_scoped_command_owner;
alter function public.set_evidence_legal_hold(uuid, boolean) owner to pathfinders_scoped_command_owner;
alter function public.enroll_student(uuid, uuid, uuid, smallint) owner to pathfinders_scoped_command_owner;
alter function public.record_assessment(uuid, public.assessment_decision, text) owner to pathfinders_scoped_command_owner;
alter function public.authorized_evidence_download(uuid) owner to pathfinders_scoped_command_owner;

-- Keep the existing narrow RPC surface; never make commands callable by PUBLIC or anon.
revoke all on function public.update_own_profile(text), public.update_club(uuid, text), public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid), public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid), public.revoke_role(uuid), public.publish_catalog_draft(uuid, public.catalog_class_type, text), public.submit_progress_attempt(uuid, text, text, uuid[]), public.review_progress_attempt(uuid, uuid, public.progress_status, text), public.reverse_progress_acceptance(uuid, uuid, text), public.manually_complete_progress(uuid, text, text), public.record_assessment(uuid, public.assessment_decision, text), public.record_investiture(uuid, text), public.prepare_evidence_upload(uuid, text, bigint), public.authorized_evidence_download(uuid), public.finalize_evidence_deletion(uuid), public.prepare_evidence_deletion(uuid), public.set_evidence_legal_hold(uuid, boolean), public.enroll_student(uuid, uuid, uuid, smallint) from public, anon;
grant execute on function public.update_own_profile(text), public.update_club(uuid, text), public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid), public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid), public.revoke_role(uuid), public.publish_catalog_draft(uuid, public.catalog_class_type, text), public.submit_progress_attempt(uuid, text, text, uuid[]), public.review_progress_attempt(uuid, uuid, public.progress_status, text), public.reverse_progress_acceptance(uuid, uuid, text), public.manually_complete_progress(uuid, text, text), public.record_assessment(uuid, public.assessment_decision, text), public.record_investiture(uuid, text), public.prepare_evidence_upload(uuid, text, bigint), public.authorized_evidence_download(uuid), public.finalize_evidence_deletion(uuid), public.prepare_evidence_deletion(uuid), public.set_evidence_legal_hold(uuid, boolean), public.enroll_student(uuid, uuid, uuid, smallint) to authenticated;

revoke create on schema public from pathfinders_scoped_command_owner;

begin;

\ir fixtures.sql

select plan(101);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before scoped command-owner assertions'
);

select ok(not rolcanlogin, 'the command owner cannot log in')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(not rolinherit, 'the command owner cannot inherit privileges')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(not rolsuper, 'the command owner is not a superuser')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(not rolcreatedb, 'the command owner cannot create databases')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(not rolcreaterole, 'the command owner cannot create roles')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(rolbypassrls, 'the non-login command owner bypasses RLS only behind actor-scoped command boundaries')
from pg_roles where rolname = 'pathfinders_scoped_command_owner';
select ok(
  exists (
    select 1 from pg_auth_members membership
    where membership.roleid = 'pathfinders_scoped_command_owner'::regrole
      and membership.member = 'postgres'::regrole
  )
  and not exists (
    select 1 from pg_auth_members membership
    where membership.roleid = 'pathfinders_scoped_command_owner'::regrole
      and membership.member <> 'postgres'::regrole
  ),
  'postgres is the sole administrative SET ROLE member; no application role can assume the command owner'
);
select ok(
  not has_schema_privilege('pathfinders_scoped_command_owner', 'auth', 'USAGE')
  and not has_table_privilege('pathfinders_scoped_command_owner', 'auth.users', 'SELECT'),
  'the command owner has no Auth schema or table access'
);
select ok(
  has_function_privilege('pathfinders_scoped_command_owner', 'public.request_actor_id()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.request_actor_id()', 'EXECUTE'),
  'only the command owner executes the private request actor helper'
);
select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
select is(public.request_actor_id(), test_fixtures.id('student_a_user'), 'the request actor helper returns the request.jwt.claim.sub subject');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', test_fixtures.id('student_a_user'))::text, true);
select is(public.request_actor_id(), test_fixtures.id('student_a_user'), 'the request actor helper returns the request.jwt.claims JSON subject when the scalar subject is blank');
select set_config('request.jwt.claims', '', true);
select is(public.request_actor_id(), null::uuid, 'the request actor helper returns null for absent claim sources');
select set_config('request.jwt.claim.sub', 'not-a-uuid', true);
select is(public.request_actor_id(), null::uuid, 'the request actor helper returns null for an invalid subject');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"sub":"not-a-uuid"}', true);
select is(public.request_actor_id(), null::uuid, 'the request actor helper returns null for an invalid JSON subject');
select set_config('request.jwt.claims', '{not-json}', true);
select is(public.request_actor_id(), null::uuid, 'the request actor helper returns null for malformed JSON claims');
select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
insert into public.evidence (id, club_id, progress_id, uploaded_by, object_path, mime_type, byte_size, scan_status)
values (
  '80000000-0000-0000-0000-000000000001',
  test_fixtures.id('club_a'),
  (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
  test_fixtures.id('student_a_user'),
  test_fixtures.id('club_a')::text || '/80000000-0000-0000-0000-000000000001',
  'application/pdf',
  1024,
  'clean'
);

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
select ok(
  has_table_privilege('pathfinders_scoped_command_owner', 'public.attempt_evidence', 'INSERT')
  and has_table_privilege('pathfinders_scoped_command_owner', 'public.attempt_evidence', 'SELECT')
  and not has_table_privilege('pathfinders_scoped_command_owner', 'public.attempt_evidence', 'UPDATE, DELETE'),
  'the command owner receives only attempt_evidence SELECT and INSERT'
);

select is(
  pg_get_userbyid(proowner),
  'pathfinders_scoped_command_owner',
  'the command owner owns ' || proname
)
from pg_proc
where oid = any(array[
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
  'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure,
  'public.authorized_evidence_download(uuid)'::regprocedure
]);

select ok(prosecdef, 'the command remains SECURITY DEFINER: ' || proname)
from pg_proc
where oid = any(array[
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
  'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure,
  'public.authorized_evidence_download(uuid)'::regprocedure
]);

select ok(
  ('search_path=public, pg_temp' = any(coalesce(proconfig, '{}'::text[]))
    or 'search_path=pg_catalog, public, pg_temp' = any(coalesce(proconfig, '{}'::text[]))),
  'the command pins a fixed safe search path: ' || proname
)
from pg_proc
where oid = any(array[
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
  'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure,
  'public.authorized_evidence_download(uuid)'::regprocedure
]);

select ok(
  not exists (
    select 1 from aclexplode(coalesce(proacl, '{}'::aclitem[])) grant_item
    where grant_item.grantee = 0 and grant_item.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon', oid, 'EXECUTE')
  and has_function_privilege('authenticated', oid, 'EXECUTE'),
  'only authenticated, never PUBLIC or anon, executes: ' || proname
)
from pg_proc
where oid = any(array[
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
  'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure,
  'public.authorized_evidence_download(uuid)'::regprocedure
]);

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select lives_ok(
  $$select * from public.prepare_evidence_upload(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'application/pdf', 1024
  )$$,
  'a scoped authenticated member can execute an owner-bound evidence command'
);
select lives_ok(
  $$select public.submit_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'owner policy graph permits a linked member submission',
    null,
    array['80000000-0000-0000-0000-000000000001'::uuid]
  )$$,
  'a linked member can submit progress through the non-login command owner'
);
select throws_ok(
  $$insert into public.attempt_evidence (attempt_id, evidence_id) values (gen_random_uuid(), gen_random_uuid())$$,
  '42501', 'permission denied for table attempt_evidence',
  'an authenticated member cannot directly insert attempt evidence'
);
select ok(
  not has_table_privilege('public', 'public.attempt_evidence', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('anon', 'public.attempt_evidence', 'INSERT, UPDATE, DELETE'),
  'PUBLIC and anon have no direct attempt_evidence DML'
);
reset role;

-- Resolve the protected target before clearing the JWT. Otherwise argument
-- evaluation itself would invoke browser RLS and mask command authorization.
select id as target_progress_id
from public.requirement_progress
where enrollment_id = test_fixtures.id('enrollment_a')
\gset

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok(
  format('select public.submit_progress_attempt(%L::uuid, %L)', :'target_progress_id', 'missing actor'),
  'P0001', NULL,
  'a missing JWT subject cannot submit through the command owner'
);
reset role;
select set_config('request.jwt.claim.sub', 'not-a-uuid', true);
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok(
  format('select public.submit_progress_attempt(%L::uuid, %L)', :'target_progress_id', 'invalid actor'),
  'P0001', NULL,
  'an invalid JWT subject cannot submit through the command owner'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{not-json}', true);
set local role authenticated;
select throws_ok(
  format('select public.submit_progress_attempt(%L::uuid, %L)', :'target_progress_id', 'malformed JSON actor'),
  'P0001', NULL,
  'malformed JWT JSON cannot submit through the private actor helper'
);
reset role;

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and roles = array['pathfinders_scoped_command_owner'::name]
  ),
  'the BYPASSRLS command owner has no owner-only policy graph'
);
select ok(
  not exists (
    select 1 from pg_proc
    where oid = any(array[
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
      'public.record_assessment(uuid,public.assessment_decision,text)'::regprocedure,
      'public.authorized_evidence_download(uuid)'::regprocedure
    ])
      and pg_get_functiondef(oid) like '%auth.uid()%'
  ),
  'transferred command bodies resolve the actor without auth.uid()'
);
select ok(
  not exists (
    select 1 from pg_auth_members membership
    where membership.roleid = 'pathfinders_scoped_command_owner'::regrole
      and membership.member <> 'postgres'::regrole
  ),
  'no application-capable role can assume the BYPASSRLS command owner'
);
select ok(
  not exists (
    select 1 from pg_proc
    where oid = any(array[
      'public.create_unit(uuid,text)'::regprocedure,
      'public.begin_member_provisioning(uuid,text,date,uuid,text,public.canonical_role,uuid)'::regprocedure,
      'public.finalize_member_provisioning(uuid,uuid)'::regprocedure,
      'public.reset_member_credential(uuid,uuid)'::regprocedure,
      'public.transfer_member_unit(uuid,uuid)'::regprocedure,
      'public.assign_staff_unit(uuid,uuid,public.canonical_role)'::regprocedure,
      'public.revoke_staff_unit(uuid)'::regprocedure,
      'public.withdraw_member(uuid)'::regprocedure,
      'public.rotate_club_director(uuid,uuid)'::regprocedure
    ])
      and (pg_get_userbyid(proowner) <> 'pathfinders_scoped_command_owner'
        or not prosecdef
        or not ('search_path=pg_catalog, public, pg_temp' = any(coalesce(proconfig, '{}'::text[])))
        or has_function_privilege('anon', oid, 'EXECUTE')
        or not has_function_privilege('authenticated', oid, 'EXECUTE'))
  ),
  'all v2 governance commands are command-owner SECURITY DEFINER functions with a fixed path and authenticated-only execution'
);
select test_fixtures.assume_authenticated(test_fixtures.id('student_b_user'));
set local role authenticated;
select throws_ok(
  $$select * from public.prepare_evidence_upload(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'application/pdf', 1024
  )$$,
  'P0001', NULL,
  'a foreign authenticated identity cannot execute the command across club scope'
);
reset role;

select * from finish();
rollback;

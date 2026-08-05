begin;
\ir fixtures.sql

select plan(37);
select lives_ok('select test_fixtures.install()', 'v2 fixtures install');

select is(public.member_condition_at(test_fixtures.id('member_pathfinder'), '2026-08-04 02:59:59+00'), 'PATHFINDER'::public.member_condition, 'club-local time before the sixteenth birthday remains Pathfinder');
select is(public.member_condition_at(test_fixtures.id('member_pathfinder'), '2026-08-04 03:00:00+00'), 'LEADER'::public.member_condition, 'club-local midnight begins Leader condition');
select is(public.record_member_condition_transition(test_fixtures.id('member_pathfinder'), '2026-08-04 02:59:59+00'), 'PATHFINDER'::public.member_condition, 'the transition writer keeps the condition Pathfinder before club-local midnight');
select is_empty($$select 1 from public.member_condition_audit where member_id = test_fixtures.id('member_pathfinder') and condition = 'LEADER'$$, 'no Leader audit exists before the club-local transition');
select is(public.record_member_condition_transition(test_fixtures.id('member_pathfinder'), '2026-08-04 03:00:00+00'), 'LEADER'::public.member_condition, 'the transition writer evaluates the Leader boundary in the club timezone');
select is((select count(*)::integer from public.member_condition_audit where member_id = test_fixtures.id('member_pathfinder') and condition = 'LEADER'), 1, 'the Leader transition writes one audit event');
select is(public.record_member_condition_transition(test_fixtures.id('member_pathfinder'), '2026-08-04 03:00:01+00'), 'LEADER'::public.member_condition, 'repeated Leader evaluation is permitted');
select is((select count(*)::integer from public.member_condition_audit where member_id = test_fixtures.id('member_pathfinder') and condition = 'LEADER'), 1, 'repeated Leader evaluation is idempotent and writes no second audit event');
insert into public.club_members (id, club_id, full_name, date_of_birth)
values ('90000000-0000-0000-0000-000000000009', test_fixtures.id('club_b'), 'UTC boundary member', date '2010-08-04');
select is(public.member_condition_at('90000000-0000-0000-0000-000000000009', '2026-08-03 23:59:59+00'), 'PATHFINDER'::public.member_condition, 'UTC club remains Pathfinder before its own sixteenth-birthday midnight');
select is(public.member_condition_at('90000000-0000-0000-0000-000000000009', '2026-08-04 00:00:00+00'), 'LEADER'::public.member_condition, 'UTC club becomes Leader at its own sixteenth-birthday midnight');
select throws_ok($$insert into public.club_members (club_id, full_name, date_of_birth) values (test_fixtures.id('club_a'), 'Invalid DOB', current_date + 1)$$, '23514', NULL, 'future DOB is rejected');
select throws_ok($$insert into public.member_unit_assignments (member_id, unit_id) values (test_fixtures.id('member_pathfinder'), test_fixtures.id('unit_b'))$$, '23514', 'member and unit must belong to the same club', 'cross-club member assignment is rejected');
select throws_ok($$insert into public.member_unit_assignments (member_id, unit_id) values (test_fixtures.id('member_pathfinder'), test_fixtures.id('unit_a'))$$, '23505', NULL, 'a member has at most one active unit');
select throws_ok($$insert into public.staff_unit_assignments (member_id, unit_id, role) values (test_fixtures.id('member_young'), test_fixtures.id('unit_a'), 'COUNSELOR')$$, '23514', 'staff assignments require an active Leader in the unit club', 'a Pathfinder cannot receive a staff assignment');
select lives_ok($$insert into public.staff_unit_assignments (member_id, unit_id, role) values (test_fixtures.id('counselor_b_member'), test_fixtures.id('unit_a'), 'COUNSELOR')$$, 'a unit may have multiple counselors');
select throws_ok($$insert into public.staff_unit_assignments (member_id, unit_id, role) values (test_fixtures.id('counselor_a_member'), test_fixtures.id('unit_a_secondary'), 'COUNSELOR')$$, '23505', NULL, 'a counselor has at most one active unit');

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is_empty('select 1 from public.club_members where id = test_fixtures.id(''member_pending'')', 'pending remediation member is denied v2 access');
select is_empty('select 1 from public.club_members where id = test_fixtures.id(''member_withdrawn'')', 'withdrawn member is denied v2 access');
reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('system_admin_a'));
set local role authenticated;
select is_empty('select 1 from public.club_members where id = test_fixtures.id(''member_leader'')', 'SYSTEM_ADMIN has no v2 card/member access');
reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;
select throws_ok($$select public.evaluate_member_condition(test_fixtures.id('member_pathfinder'))$$, '42501', NULL, 'browser roles cannot invoke the condition audit writer directly');
select lives_ok(
  $$select public.create_unit(test_fixtures.id('club_a'), 'Fixture Command Unit')$$,
  'the active director creates a unit only in their scoped club'
);
select throws_ok(
  $$select public.begin_member_provisioning(test_fixtures.id('club_a'), 'Invalid Staff', date '1980-01-01', test_fixtures.id('unit_a'), 'invalid-staff', 'CLUB_DIRECTOR'::public.canonical_role, '11111111-1111-1111-1111-111111111111')$$,
  '23514', 'only INSTRUCTOR or COUNSELOR staff roles are permitted', 'provisioning rejects non-staff canonical roles'
);
select lives_ok(
  $$select public.begin_member_provisioning(test_fixtures.id('club_a'), 'Provisioned Leader', date '1980-01-01', test_fixtures.id('unit_a'), 'provisioned.leader', 'COUNSELOR'::public.canonical_role, '22222222-2222-2222-2222-222222222222')$$,
  'director provisioning creates a complete member and optional valid staff assignment without a password'
);
select throws_ok(
  $$select state from public.member_credentials where provisioning_correlation_id = '22222222-2222-2222-2222-222222222222'::uuid$$,
  '42501', NULL, 'authenticated actors cannot read credential records directly'
);
reset role;
select is(
  (select state from public.member_credentials where provisioning_correlation_id = '22222222-2222-2222-2222-222222222222'::uuid),
  'PROVISIONING'::public.member_credential_state,
  'privileged fixture context verifies new credentials remain server-finalized provisioning intents'
);
insert into public.member_credentials (member_id, username, auth_user_id, provisioning_correlation_id, state, temporary_credential_expires_at)
values (
  test_fixtures.id('member_pathfinder'),
  'fixture.initial-change',
  test_fixtures.id('student_a_user'),
  '33333333-3333-3333-3333-333333333333',
  'INITIAL_CHANGE_REQUIRED',
   now() + interval '1 hour'
);
update public.member_credentials
set initial_password_change_token_hash = extensions.digest('fixture-change-token', 'sha256')
where username = 'fixture.initial-change';
select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is(
  public.credential_gate_status(),
  'CHANGE_PASSWORD',
  'an authenticated initial credential holder reaches the password-change gate without auth-schema privileges'
);
select lives_ok(
  $$select public.complete_initial_password_change('fixture-change-token')$$,
  'an authenticated initial credential holder completes the gate using the schema-qualified digest function'
);
reset role;
select is(
  (select state from public.member_credentials where username = 'fixture.initial-change'),
  'ACTIVE'::public.member_credential_state,
  'successful initial password completion activates the credential exactly once'
);
select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;
select lives_ok(
  $$select public.transfer_member_unit(test_fixtures.id('member_pathfinder'), test_fixtures.id('unit_a_secondary'))$$,
  'director transfers a member atomically to a same-club unit'
);
select is(
  (select unit_id from public.member_unit_assignments where member_id = test_fixtures.id('member_pathfinder') and ended_at is null),
  test_fixtures.id('unit_a_secondary'),
  'transfer leaves exactly the requested active unit'
);
select throws_ok(
  $$select public.assign_staff_unit(test_fixtures.id('counselor_a_member'), test_fixtures.id('unit_a_secondary'), 'COUNSELOR'::public.canonical_role)$$,
  '23505', NULL, 'command preserves one active unit for each counselor'
);
select lives_ok(
  $$select public.assign_staff_unit(test_fixtures.id('instructor_a_member'), test_fixtures.id('unit_a_secondary'), 'INSTRUCTOR'::public.canonical_role)$$,
  'command permits an instructor to hold multiple active unit assignments'
);
reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('system_admin_a'));
set local role authenticated;
select lives_ok(
  $$select public.rotate_club_director(test_fixtures.id('club_a'), test_fixtures.id('instructor_a_member'))$$,
  'SYSTEM_ADMIN rotates the sole active director atomically'
);
reset role;
select is(
  (select count(*)::integer from public.club_director_assignments where club_id = test_fixtures.id('club_a') and active_until is null),
  1,
  'rotation retains exactly one active director'
);
select is_empty(
  $$select 1 from public.staff_unit_assignments where member_id = test_fixtures.id('member_leader') and ended_at is null$$,
  'rotation leaves the outgoing director with Leader condition rather than staff authority'
);
select ok(
  exists (select 1 from public.audit_log where action = 'club.director_rotated' and club_id = test_fixtures.id('club_a')),
  'director rotation writes its audit record in the command transaction'
);
select * from finish();
rollback;

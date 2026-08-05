begin;
\ir fixtures.sql

select plan(14);
select lives_ok('select test_fixtures.install()', 'v2 cutover fixtures install');

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is((select id from public.enrollments where id = test_fixtures.id('enrollment_a')), test_fixtures.id('enrollment_a'), 'active v2 member reads only own reconciled card');
select ok(public.actor_owns_v2_enrollment(auth.uid(), test_fixtures.id('enrollment_a')), 'active v2 member has own-card submission authority');
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;
select is_empty($$select 1 from public.enrollments where id = test_fixtures.id('enrollment_a')$$, 'guardian cannot read a reconciled v2 card');
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'guardian submission', null, '{}'::uuid[])$$, 'P0001', NULL, 'guardian cannot submit v2 progress');
select throws_ok($$select * from public.prepare_evidence_upload((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'application/pdf', 1)$$, 'P0001', NULL, 'guardian cannot prepare v2 evidence');
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('evaluator_a'));
set local role authenticated;
select throws_ok($$select public.record_assessment(test_fixtures.id('enrollment_a'), 'failed', 'legacy evaluator')$$, '42501', 'only v2 scoped staff or director may record an assessment', 'evaluator has no separate assessment authority');
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('counselor_a'));
set local role authenticated;
select ok(public.actor_can_review_v2_enrollment(auth.uid(), test_fixtures.id('enrollment_a')), 'assigned counselor has assigned-unit review authority');
select lives_ok($$select public.record_assessment(test_fixtures.id('enrollment_a'), 'failed', 'counselor review')$$, 'assigned counselor records assessment');
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;
select ok(public.actor_can_review_v2_enrollment(auth.uid(), test_fixtures.id('enrollment_a')), 'assigned instructor has equal assigned-unit review authority');
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('system_admin_a'));
set local role authenticated;
select is_empty($$select 1 from public.enrollments where id = test_fixtures.id('enrollment_a')$$, 'system admin cannot read card content');
select is_empty($$select * from public.authorized_evidence_download('00000000-0000-0000-0000-000000000001'::uuid)$$, 'system admin cannot access evidence');
reset role;

update public.v2_cutover_control set state = 'ROLLED_BACK', note = 'test rollback';
select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is_empty($$select 1 from public.enrollments where id = test_fixtures.id('enrollment_a')$$, 'rollback-safe gate fails content reads closed without deleting history');
reset role;
select is((select count(*)::integer from public.member_legacy_reconciliation_ledger where legacy_student_id = test_fixtures.id('student_a')), 1, 'reconciliation ledger remains after gate rollback');

select * from finish();
rollback;

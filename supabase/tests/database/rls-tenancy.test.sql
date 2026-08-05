begin;

\ir fixtures.sql

select plan(14);
select lives_ok('select test_fixtures.install()', 'privileged setup installs deterministic v2 fixtures');

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is((select id from public.enrollments where id = test_fixtures.id('enrollment_a')), test_fixtures.id('enrollment_a'), 'an active reconciled member reads only their own enrollment');
select is_empty($$select 1 from public.enrollments where id = test_fixtures.id('enrollment_b')$$, 'an active reconciled member cannot read another club card');
select lives_ok($$select * from public.prepare_evidence_upload((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'application/pdf', 1024)$$, 'the card owner can prepare evidence for their own progress');

reset role;
select ok(exists (select 1 from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) and uploaded_by = test_fixtures.id('student_a_user')), 'permitted preparation persists owner evidence metadata');
update public.evidence set scan_status = 'clean' where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a'));

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select is((select object_path from public.authorized_evidence_download((select id from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) limit 1))), (select object_path from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) limit 1), 'the card owner receives the evidence delivery path through the audited command');

reset role;
select ok(exists (select 1 from public.audit_log where action = 'evidence.download_authorized' and entity_type = 'evidence' and actor_id = test_fixtures.id('student_a_user')), 'evidence delivery writes its immutable authorization audit');

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'submitted without required evidence')$$, 'P0001', 'this requirement requires clean evidence', 'an evidence-required item cannot be submitted without clean evidence');
select lives_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'submitted with clean evidence', null, array[(select id from public.evidence where uploaded_by = test_fixtures.id('student_a_user'))])$$, 'the card owner submits their clean evidence');

reset role;
select is((select status from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')), 'submitted'::public.progress_status, 'the valid v2 submission advances the protected workflow');

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;
select throws_ok($$select * from public.prepare_evidence_upload('00000000-0000-0000-0000-000000000001', 'application/pdf', 1024)$$, 'P0001', NULL, 'a guardian cannot prepare v2 evidence');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('system_admin_a'));
set local role authenticated;
select is_empty($$select * from public.authorized_evidence_download('00000000-0000-0000-0000-000000000001'::uuid)$$, 'SYSTEM_ADMIN alone cannot access learner evidence');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('counselor_a'));
set local role authenticated;
select ok(public.actor_can_review_v2_enrollment(auth.uid(), test_fixtures.id('enrollment_a')) and not public.actor_can_review_v2_enrollment(auth.uid(), test_fixtures.id('enrollment_b')), 'a counselor is restricted to their assigned unit');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('evaluator_a'));
set local role authenticated;
select throws_ok($$select public.record_assessment(test_fixtures.id('enrollment_a'), 'failed', 'retired evaluator')$$, '42501', 'only v2 scoped staff or director may record an assessment', 'an evaluator has no v2 assessment authority');
reset role;
select * from finish();
rollback;

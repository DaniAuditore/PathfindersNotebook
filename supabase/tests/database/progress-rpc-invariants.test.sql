begin;

\ir fixtures.sql

select plan(23);
select lives_ok('select test_fixtures.install()', 'privileged setup installs deterministic fixtures');

-- A text-only card exercises the v2 member submission and unit-scoped review
-- lifecycle without preserving the retired guardian path.
insert into public.catalogs (id, club_id, class_type, title)
values ('40000000-0000-0000-0000-000000000003', test_fixtures.id('club_a'), 'advanced', 'Fixture Text Catalog A');
insert into public.catalog_versions (id, catalog_id, version_number, status)
values ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 1, 'draft');
insert into public.requirements (id, catalog_version_id, requirement_type, title, position, requires_evidence, evidence_types)
values ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'text', 'Fixture text requirement A', 0, false, '{}');
update public.catalog_versions set status = 'published', published_at = now()
where id = '50000000-0000-0000-0000-000000000003';
insert into public.enrollments (id, club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by)
values ('70000000-0000-0000-0000-000000000003', test_fixtures.id('club_a'), test_fixtures.id('student_a'), '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 2027, test_fixtures.id('admin_a'));

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select ok(public.actor_owns_v2_enrollment(auth.uid(), '70000000-0000-0000-0000-000000000003'), 'the reconciled member owns the card before command evaluation');
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), null)$$, 'P0001', 'submission text is required', 'the member cannot submit null text');
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), E' \t ')$$, 'P0001', 'submission text is required', 'the member cannot submit whitespace-only text');
select lives_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), '  completed reading  ')$$, 'the reconciled member submits normalized text');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;
select throws_ok($$select public.submit_progress_attempt('00000000-0000-0000-0000-000000000001', 'retired guardian')$$, 'P0001', NULL, 'a guardian has no v2 progress authority');

reset role;
select is((select submission_text from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 'completed reading', 'the RPC persists normalized submission text');
select is((select count(*)::integer from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 1, 'failed blank submissions leave no attempt behind');
select is((select count(*)::integer from public.audit_log where entity_type = 'progress_attempts' and action = 'protected_mutation.insert' and actor_id = test_fixtures.id('student_a_user')), 1, 'member submission produces one transactional attempt audit');
select is((select count(*)::integer from public.audit_log where entity_type = 'requirement_progress' and action = 'protected_mutation.update' and actor_id = test_fixtures.id('student_a_user')), 1, 'member submission produces one transactional progress audit');

select test_fixtures.assume_authenticated(test_fixtures.id('admin_b'));
set local role authenticated;
select throws_ok($$select public.review_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 'accepted', null)$$, '42501', 'only v2 scoped staff or director may decide progress', 'a foreign-club director cannot review progress');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('counselor_a'));
set local role authenticated;
select lives_ok($$select public.review_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 'rejected', 'Add the date.')$$, 'an assigned counselor can request changes');

reset role;
select is((select reason from public.progress_reviews where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 'Add the date.', 'the counselor reason is recorded');
select is((select status from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), 'rejected'::public.progress_status, 'request changes advances progress to rejected');
select is((select count(*)::integer from public.audit_log where entity_type = 'progress_reviews' and action = 'protected_mutation.insert' and actor_id = test_fixtures.id('counselor_a')), 1, 'counselor review produces one transactional audit');

select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select lives_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), 'Resubmitted with date')$$, 'a rejected card can be resubmitted by its member');

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;
select lives_ok($$select public.review_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003') and decision is null), 'accepted', null)$$, 'an assigned instructor has equal unit review authority');

reset role;
select is((select status from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), 'accepted'::public.progress_status, 'the resubmitted progress becomes approved');
select is((select count(*)::integer from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 2, 'resubmission retains both attempts');
select is((select count(*)::integer from public.progress_reviews where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')), 2, 'review history retains counselor rejection and instructor approval');

select test_fixtures.assume_authenticated(test_fixtures.id('evaluator_a'));
set local role authenticated;
select throws_ok($$select public.record_assessment('70000000-0000-0000-0000-000000000003', 'failed', 'retired evaluator')$$, '42501', 'only v2 scoped staff or director may record an assessment', 'an evaluator has no v2 assessment authority');

reset role;
insert into public.catalogs (id, club_id, class_type, title) values ('40000000-0000-0000-0000-000000000004', test_fixtures.id('club_a'), 'advanced', 'Fixture guarded catalog A');
insert into public.catalog_versions (id, catalog_id, version_number, status) values ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 1, 'draft');
insert into public.requirements (id, catalog_version_id, requirement_type, title, position, requires_evidence, evidence_types, modalities, progress_mode, completion_semantics) values ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 'compound', 'Fixture derived requirement A', 0, false, '{}', array['reading']::text[], 'derived', 'all_children'), ('60000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000004', 'manual', 'Fixture practical requirement A', 1, false, '{}', array['practical_in_person']::text[], 'direct', 'direct');
update public.catalog_versions set status = 'published', published_at = now() where id = '50000000-0000-0000-0000-000000000004';
insert into public.enrollments (id, club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by) values ('70000000-0000-0000-0000-000000000004', test_fixtures.id('club_a'), test_fixtures.id('student_a'), '40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 2027, test_fixtures.id('admin_a'));
select test_fixtures.assume_authenticated(test_fixtures.id('student_a_user'));
set local role authenticated;
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000004' and requirement_id = '60000000-0000-0000-0000-000000000004'), 'attempted derived text')$$, 'P0001', 'this requirement cannot be submitted as text', 'the member cannot submit direct text for a derived requirement');
select throws_ok($$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000004' and requirement_id = '60000000-0000-0000-0000-000000000005'), 'attempted practical text')$$, 'P0001', 'this requirement cannot be submitted as text', 'the member cannot submit direct text for a practical requirement');

reset role;
select * from finish();
rollback;

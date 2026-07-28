begin;

\ir fixtures.sql

select plan(23);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures'
);

-- Add a text-only requirement without changing the shared fixture shape relied
-- on by the evidence suites.
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

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;

select ok(
  public.can_submit_evidence((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  'the linked guardian predicate resolves before the command owner evaluates RLS'
);

select throws_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), null)$$,
  'P0001', 'submission text is required',
  'the authenticated RPC rejects null text for a text-only requirement'
);
select throws_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), E' \t ')$$,
  'P0001', 'submission text is required',
  'the authenticated RPC rejects whitespace-only text'
);
select lives_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), '  completed reading  ')$$,
  'a linked guardian can submit normalized nonblank text'
);

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
select throws_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_b')), 'foreign linked learner')$$,
  'P0001', 'only a linked guardian or student can submit progress',
  'a guardian cannot submit progress for an unlinked learner in another club'
);

reset role;
select is(
  (select submission_text from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  'completed reading',
  'the RPC persists normalized submission text'
);
select is(
  (select count(*)::integer from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  1,
  'failed blank submissions leave no attempt behind'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'progress_attempts' and action = 'protected_mutation.insert' and actor_id = test_fixtures.id('guardian_a')),
  1,
  'submission produces exactly one transactional attempt audit'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'requirement_progress' and action = 'protected_mutation.update' and actor_id = test_fixtures.id('guardian_a')),
  1,
  'submission produces exactly one transactional progress audit'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_b'));
set local role authenticated;
select throws_ok(
  $$select public.review_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
    (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
    'accepted', null
  )$$,
  'P0001', 'only an authorized reviewer can decide progress',
  'a foreign-club administrator cannot review progress'
);

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;
select throws_ok(
  $$select public.review_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
    (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
    'rejected', E' \n '
  )$$,
  'P0001', 'a rejection reason is required',
  'the authenticated review RPC rejects a blank rejection reason'
);
select lives_ok(
  $$select public.review_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
    (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
    'rejected', '  Add the date.  '
  )$$,
  'an in-club instructor can request changes with a reason'
);

reset role;
select is(
  (select reason from public.progress_reviews where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  'Add the date.',
  'the rejection reason is normalized and recorded'
);
select is(
  (select status from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
  'rejected'::public.progress_status,
  'request changes advances progress to rejected'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'progress_reviews' and action = 'protected_mutation.insert' and actor_id = test_fixtures.id('instructor_a')),
  1,
  'review produces exactly one transactional review audit'
);

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;
select lives_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'), 'Resubmitted with date')$$,
  'a rejected text attempt can be resubmitted'
);

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;
select lives_ok(
  $$select public.review_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
    (select id from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003') and decision is null),
    'accepted', null
  )$$,
  'approval remains valid without a reason'
);

reset role;
select is(
  (select status from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003'),
  'accepted'::public.progress_status,
  'the resubmitted progress becomes approved'
);
select is(
  (select count(*)::integer from public.progress_attempts where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  2,
  'resubmission retains both attempts'
);
select is(
  (select count(*)::integer from public.progress_reviews where progress_id = (select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000003')),
  2,
  'review history retains rejection and approval exactly once'
);

-- A separate published fixture proves migration 020 guards the authenticated
-- boundary without changing the legacy text workflow fixture above.
insert into public.catalogs (id, club_id, class_type, title)
values ('40000000-0000-0000-0000-000000000004', test_fixtures.id('club_a'), 'advanced', 'Fixture guarded catalog A');
insert into public.catalog_versions (id, catalog_id, version_number, status)
values ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 1, 'draft');
insert into public.requirements (id, catalog_version_id, requirement_type, title, position, requires_evidence, evidence_types, modalities, progress_mode, completion_semantics)
values
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 'compound', 'Fixture derived requirement A', 0, false, '{}', array['reading']::text[], 'derived', 'all_children'),
  ('60000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000004', 'manual', 'Fixture practical requirement A', 1, false, '{}', array['practical_in_person']::text[], 'direct', 'direct');
update public.catalog_versions set status = 'published', published_at = now()
where id = '50000000-0000-0000-0000-000000000004';
insert into public.enrollments (id, club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by)
values ('70000000-0000-0000-0000-000000000004', test_fixtures.id('club_a'), test_fixtures.id('student_a'), '40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 2027, test_fixtures.id('admin_a'));

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;
select throws_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000004' and requirement_id = '60000000-0000-0000-0000-000000000004'), 'attempted derived text')$$,
  'P0001', 'this requirement cannot be submitted as text',
  'the authenticated RPC rejects direct text for a derived requirement'
);
select throws_ok(
  $$select public.submit_progress_attempt((select id from public.requirement_progress where enrollment_id = '70000000-0000-0000-0000-000000000004' and requirement_id = '60000000-0000-0000-0000-000000000005'), 'attempted practical text')$$,
  'P0001', 'this requirement cannot be submitted as text',
  'the authenticated RPC rejects direct text for a practical requirement'
);
reset role;

select * from finish();
rollback;

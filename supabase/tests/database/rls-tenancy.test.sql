begin;

\ir fixtures.sql

select plan(9);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;

select is(
  (select id from public.enrollments where id = test_fixtures.id('enrollment_a')),
  test_fixtures.id('enrollment_a'),
  'a linked guardian can read its own enrollment'
);

select is_empty(
  $$select 1 from public.enrollments where id = test_fixtures.id('enrollment_b')$$,
  'a linked guardian cannot read a foreign-club enrollment'
);

select lives_ok(
  $$select * from public.prepare_evidence_upload(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'application/pdf',
    1024
  )$$,
  'a linked guardian can prepare evidence for its own progress'
);

reset role;
select ok(
  exists (
    select 1
    from public.evidence
    where progress_id = (
      select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')
    )
      and uploaded_by = test_fixtures.id('guardian_a')
  ),
  'the permitted evidence preparation persists metadata'
);

update public.evidence
set scan_status = 'clean'
where progress_id = (
  select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')
);

select test_fixtures.assume_authenticated(test_fixtures.id('guardian_a'));
set local role authenticated;

select throws_ok(
  $$select public.submit_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'submitted without required evidence'
  )$$,
  'P0001',
  'this requirement requires clean evidence',
  'an evidence-required progress item cannot be submitted without clean evidence'
);

select lives_ok(
  $$select public.submit_progress_attempt(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'submitted with clean evidence',
    null,
    array[(select id from public.evidence where uploaded_by = test_fixtures.id('guardian_a'))]
  )$$,
  'a linked guardian can submit progress with its own clean evidence'
);

reset role;
select is(
  (select status from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
  'submitted'::public.progress_status,
  'the valid submission advances the protected progress workflow'
);

select test_fixtures.assume_authenticated(test_fixtures.id('student_b_user'));
set local role authenticated;

select throws_ok(
  $$select * from public.prepare_evidence_upload(
    (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')),
    'application/pdf',
    1024
  )$$,
  'P0001',
  'only a linked guardian or student can upload evidence',
  'a foreign authenticated identity cannot prepare Club A evidence'
);

reset role;
select * from finish();
rollback;

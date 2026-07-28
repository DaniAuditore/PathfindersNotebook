begin;

\ir fixtures.sql

select plan(14);

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

select is(
  (select object_path from public.authorized_evidence_download((select id from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) limit 1))),
  (select object_path from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) limit 1),
  'an authorized guardian receives the evidence delivery path through the audited command'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'evidence.download_authorized'
      and entity_type = 'evidence'
      and actor_id = test_fixtures.id('guardian_a')
  ),
  'the evidence delivery authorization writes its immutable audit in the RPC transaction'
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
select test_fixtures.assume_authenticated(test_fixtures.id('system_admin_a'));
set local role authenticated;
select is_empty(
  $$select * from public.authorized_evidence_download((select id from public.evidence where progress_id = (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a')) limit 1))$$,
  'SYSTEM_ADMIN alone cannot access learner evidence'
);
reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('counselor_a'));
set local role authenticated;
select ok(
  public.has_canonical_role_in_unit(test_fixtures.id('unit_a'), array['COUNSELOR']::public.canonical_role[])
  and not public.has_canonical_role_in_unit(test_fixtures.id('unit_b'), array['COUNSELOR']::public.canonical_role[]),
  'a COUNSELOR assignment is restricted to its exact unit at runtime'
);
reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('evaluator_a'));
set local role authenticated;
select throws_ok(
  $$select public.record_assessment(test_fixtures.id('enrollment_a'), 'failed', 'outside assigned assessment')$$,
  '42501',
  'only an authorized scoped assessor can record an assessment',
  'an EVALUATOR cannot record an assessment outside its exact assignment'
);
reset role;
select * from finish();
rollback;

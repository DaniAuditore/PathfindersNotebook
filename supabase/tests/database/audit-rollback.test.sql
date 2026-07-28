begin;

\ir fixtures.sql

select plan(9);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select lives_ok(
  $$select public.publish_catalog_draft(test_fixtures.id('club_a'), 'advanced', 'Audited catalog title')$$,
  'an authorized command mutation succeeds'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_log
    where entity_type = 'catalogs'
      and action = 'protected_mutation.insert'
      and actor_id = test_fixtures.id('admin_a')
  ),
  'the protected mutation writes an audit record in the same transaction'
);

insert into public.evidence (id, club_id, progress_id, uploaded_by, object_path, mime_type, byte_size, scan_status, retain_until)
values
  ('90000000-0000-0000-0000-000000000001', test_fixtures.id('club_a'), (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a') limit 1), test_fixtures.id('guardian_a'), test_fixtures.id('club_a')::text || '/90000000-0000-0000-0000-000000000001', 'application/pdf', 1024, 'clean', now() - interval '1 day'),
  ('90000000-0000-0000-0000-000000000002', test_fixtures.id('club_a'), (select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a') limit 1), test_fixtures.id('guardian_a'), test_fixtures.id('club_a')::text || '/90000000-0000-0000-0000-000000000002', 'application/pdf', 1024, 'clean', now() - interval '1 day');

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;
select lives_ok(
  $$select public.set_evidence_legal_hold('90000000-0000-0000-0000-000000000001', true)$$,
  'an authorized evidence legal-hold command succeeds without direct audit DML'
);
reset role;
select ok(
  (select legal_hold from public.evidence where id = '90000000-0000-0000-0000-000000000001')
  and exists (
    select 1 from public.audit_log
    where entity_type = 'evidence'
      and action = 'protected_mutation.update'
      and entity_id = '90000000-0000-0000-0000-000000000001'
      and actor_id = test_fixtures.id('admin_a')
  ),
  'the legal-hold mutation and its immutable audit persist together'
);

alter table public.audit_log
  add constraint audit_log_forced_test_failure check (false) not valid;

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select throws_ok(
   $$select public.publish_catalog_draft(test_fixtures.id('club_a'), 'advanced', 'This must roll back')$$,
  '23514',
  'new row for relation "audit_log" violates check constraint "audit_log_forced_test_failure"',
  'an audit insert failure rejects the protected mutation'
);

reset role;
select is(
  (select count(*)::integer from public.catalogs where title = 'This must roll back'),
  0,
  'the command mutation rolls back when its audit insert fails'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;
select throws_ok(
  $$select public.finalize_evidence_deletion('90000000-0000-0000-0000-000000000002')$$,
  '23514',
  'new row for relation "audit_log" violates check constraint "audit_log_forced_test_failure"',
  'an evidence deletion audit failure rejects the deletion command'
);
reset role;
select is(
  (select deleted_at from public.evidence where id = '90000000-0000-0000-0000-000000000002'),
  null,
  'the evidence deletion remains uncommitted when its audit insert fails'
);

select * from finish();
rollback;

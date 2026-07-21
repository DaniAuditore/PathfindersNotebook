begin;

\ir fixtures.sql

select plan(5);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select lives_ok(
  $$update public.catalogs set title = 'Audited Club A title' where id = test_fixtures.id('catalog_a')$$,
  'an authorized protected mutation succeeds'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_log
    where entity_type = 'catalogs'
      and action = 'protected_mutation.update'
      and entity_id = test_fixtures.id('catalog_a')
      and actor_id = test_fixtures.id('admin_a')
  ),
  'the protected mutation writes an audit record in the same transaction'
);

alter table public.audit_log
  add constraint audit_log_forced_test_failure check (false) not valid;

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select throws_ok(
  $$update public.catalogs set title = 'This must roll back' where id = test_fixtures.id('catalog_a')$$,
  '23514',
  'new row for relation "audit_log" violates check constraint "audit_log_forced_test_failure"',
  'an audit insert failure rejects the protected mutation'
);

reset role;
select is(
  (select title from public.catalogs where id = test_fixtures.id('catalog_a')),
  'Audited Club A title',
  'the protected mutation rolls back when its audit insert fails'
);

select * from finish();
rollback;

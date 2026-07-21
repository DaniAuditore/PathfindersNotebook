begin;

\ir fixtures.sql

select plan(9);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select is(
  (select title from public.catalogs where id = test_fixtures.id('catalog_a')),
  'Fixture Regular A',
  'a Club A administrator can read its catalog through RLS'
);

select is_empty(
  'select 1 from public.catalogs where id = test_fixtures.id(''catalog_b'')',
  'a Club A administrator cannot read the Club B catalog'
);

select lives_ok(
  $$update public.catalogs set title = 'Fixture Regular A revised' where id = test_fixtures.id('catalog_a')$$,
  'a Club A administrator can update its own catalog through RLS'
);

select is_empty(
  $$update public.catalogs set title = 'cross-tenant write' where id = test_fixtures.id('catalog_b') returning id$$,
  'a Club A administrator cannot update the Club B catalog'
);

reset role;
select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;

select is(
  (select enrollment_id from public.requirement_progress where id = (
    select id from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_a') limit 1
  )),
  test_fixtures.id('enrollment_a'),
  'a Club A instructor can read Club A progress through RLS'
);

select is_empty(
  $$select 1 from public.requirement_progress where enrollment_id = test_fixtures.id('enrollment_b')$$,
  'a Club A instructor cannot read Club B progress'
);

select ok(
  not has_table_privilege('authenticated', 'public.enrollments', 'DELETE'),
  'authenticated has no enrollment delete privilege because no enrollment delete policy exists'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'authenticated cannot directly insert audit records'
);

reset role;
select * from finish();
rollback;

begin;

\ir fixtures.sql

select plan(50);

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

select throws_ok(
  $$update public.catalogs set title = 'Fixture Regular A revised' where id = test_fixtures.id('catalog_a')$$,
  '42501',
  'permission denied for table catalogs',
  'a Club A director cannot directly update its catalog'
);

select throws_ok(
  $$update public.catalogs set title = 'cross-tenant write' where id = test_fixtures.id('catalog_b')$$,
  '42501',
  'permission denied for table catalogs',
  'a Club A director cannot directly update a foreign catalog'
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

-- Every browser-write surface closed by 027 has no authenticated or anonymous
-- DML privilege.  Function commands, not RLS write policies, are the boundary.
select ok(not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT, UPDATE, DELETE'), 'authenticated has no direct DML on ' || table_name)
from unnest(array['catalogs','catalog_versions','catalog_sections','requirements','profiles','clubs','memberships','students','role_assignments','enrollments','requirement_progress','progress_attempts','progress_reviews','assessments','investitures','evidence','attempt_evidence','audit_log']) as table_name;
select ok(not has_table_privilege('anon', format('public.%I', table_name), 'INSERT, UPDATE, DELETE'), 'anon has no direct DML on ' || table_name)
from unnest(array['catalogs','catalog_versions','catalog_sections','requirements','profiles','clubs','memberships','students','role_assignments','enrollments','requirement_progress','progress_attempts','progress_reviews','assessments','investitures','evidence','attempt_evidence','audit_log']) as table_name;

select ok(
  not has_table_privilege('authenticated', 'public.enrollments', 'INSERT'),
  'authenticated has no direct enrollment insert privilege'
);

select ok(
  not has_table_privilege('authenticated', 'public.enrollments', 'UPDATE'),
  'authenticated has no direct enrollment update privilege'
);

select throws_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'),
    test_fixtures.id('catalog_version_a'), 2027, test_fixtures.id('admin_a')
  )$$,
  '42501',
  'permission denied for table enrollments',
  'an administrator raw insert without a returned row is denied'
);

select throws_ok(
  $$update public.enrollments set status = 'withdrawn' where id = test_fixtures.id('enrollment_a')$$,
  '42501',
  'permission denied for table enrollments',
  'an administrator raw update is denied'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'authenticated cannot directly insert audit records'
);

reset role;
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'enrollments' and policyname in (
    'admins and instructors create enrollments',
    'admins and instructors update enrollments'
  )),
  0,
  'no legacy permissive enrollment write policies remain'
);
select * from finish();
rollback;

begin;

\ir fixtures.sql

select plan(4);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select lives_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'),
    test_fixtures.id('catalog_version_a'), 2027, test_fixtures.id('admin_a')
  )$$,
  'an administrator can enroll a Club A student in a Club A published catalog'
);

select throws_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_b'),
    test_fixtures.id('catalog_version_b'), 2028, test_fixtures.id('admin_a')
  )$$,
  '23514',
  'enrollment catalog must belong to the enrollment club',
  'a Club A administrator cannot enroll with a Club B catalog'
);

reset role;
select is(
  (select count(*)::integer from public.enrollments where club_id = test_fixtures.id('club_a') and school_year = 2028),
  0,
  'the rejected cross-club enrollment leaves no persisted row'
);

select * from finish();
rollback;

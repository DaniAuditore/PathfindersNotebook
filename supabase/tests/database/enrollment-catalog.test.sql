begin;

\ir fixtures.sql

select plan(7);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before enrollment assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select throws_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'),
    test_fixtures.id('catalog_version_a'), 2027, test_fixtures.id('admin_a')
  )$$,
  '42501',
  'permission denied for table enrollments',
  'an administrator cannot directly create an enrollment'
);

select throws_ok(
  $$update public.enrollments set status = 'withdrawn' where id = test_fixtures.id('enrollment_a')$$,
  '42501',
  'permission denied for table enrollments',
  'an administrator cannot directly update an enrollment'
);

reset role;

select throws_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_b'),
    test_fixtures.id('catalog_version_b'), 2028, test_fixtures.id('admin_a')
  )$$,
  '23514',
  'enrollment catalog must belong to the enrollment club',
  'the tenancy trigger still blocks privileged cross-club enrollment construction'
);

select lives_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'),
    test_fixtures.id('catalog_version_a'), 2027, test_fixtures.id('admin_a')
  )$$,
  'a trusted privileged fixture path can construct a same-club enrollment'
);

select throws_ok(
  $$insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'),
    test_fixtures.id('catalog_version_a'), 2027, test_fixtures.id('admin_a')
  )$$,
  '23505', null,
  'the same student cannot receive a second same-year enrollment for the same catalog'
);

select is(
  (select count(*)::integer from public.enrollments where club_id = test_fixtures.id('club_a') and school_year = 2028),
  0,
  'the rejected cross-club enrollment leaves no persisted row'
);

select * from finish();
rollback;

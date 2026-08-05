begin;

\ir fixtures.sql

select plan(8);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic Club A/B fixtures'
);

select is(
  (select status from public.catalog_versions where id = test_fixtures.id('catalog_version_a')),
  'published',
  'the fixture includes a valid published catalog version'
);

select is(
  (select role from public.role_assignments where user_id = test_fixtures.id('admin_a') and club_id = test_fixtures.id('club_a')),
  'CLUB_DIRECTOR'::public.canonical_role,
  'the fixture uses canonical club director authority'
);
select is(
  (select role from public.role_assignments where user_id = test_fixtures.id('system_admin_a')),
  'SYSTEM_ADMIN'::public.canonical_role,
  'the fixture has a separate non-evidence system administrator'
);

select is(
  (select requires_evidence from public.requirements where id = test_fixtures.id('requirement_a')),
  true,
  'the fixture includes an evidence-required requirement prerequisite'
);

select is(
  (select timezone from public.clubs where id = test_fixtures.id('club_a')),
  'America/Argentina/Buenos_Aires',
  'the fixture has an explicit IANA club timezone'
);
select is(
  (select count(*)::integer from public.staff_unit_assignments where unit_id = test_fixtures.id('unit_a') and ended_at is null),
  2,
  'the fixture has active counselor and instructor unit staffing'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select is(
  auth.uid(),
  test_fixtures.id('admin_a'),
  'the authenticated helper sets the JWT subject before RLS assertions'
);

reset role;
select * from finish();
rollback;

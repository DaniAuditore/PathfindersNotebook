begin;

\ir fixtures.sql

select plan(4);

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
  (select requires_evidence from public.requirements where id = test_fixtures.id('requirement_a')),
  true,
  'the fixture includes an evidence-required requirement prerequisite'
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

begin;

\ir fixtures.sql

select plan(5);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before authenticated assertions'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select throws_ok(
  $$update public.catalog_versions set published_at = now() where id = test_fixtures.id('catalog_version_a')$$,
  'P0001',
  'published catalog versions are immutable; create a new version',
  'a published catalog version cannot be updated'
);

select throws_ok(
  $$insert into public.requirements (catalog_version_id, requirement_type, title, position)
    values (test_fixtures.id('catalog_version_a'), 'manual', 'Late requirement', 1)$$,
  'P0001',
  'requirements of published catalog versions are immutable; create a new version',
  'a requirement cannot be inserted after publication'
);

select throws_ok(
  $$update public.requirements set title = 'Changed requirement' where id = test_fixtures.id('requirement_a')$$,
  'P0001',
  'requirements of published catalog versions are immutable; create a new version',
  'a requirement cannot be updated after publication'
);

select throws_ok(
  $$delete from public.requirements where id = test_fixtures.id('requirement_a')$$,
  'P0001',
  'requirements of published catalog versions are immutable; create a new version',
  'a requirement cannot be deleted after publication'
);

reset role;
select * from finish();
rollback;

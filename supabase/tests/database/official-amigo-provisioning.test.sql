begin;

\ir fixtures.sql

select plan(9);
select lives_ok('select test_fixtures.install()', 'legacy STG fixtures install before AC5 boundary tests');

select test_fixtures.assume_authenticated(test_fixtures.id('instructor_a'));
set local role authenticated;
select throws_ok(
  $$select public.provision_official_amigo_catalog(test_fixtures.id('club_a'), '{}'::jsonb)$$,
  '42501', null, 'authenticated non-admin cannot provision'
);
reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('admin_b'));
set local role authenticated;
select throws_ok(
  $$select public.provision_official_amigo_catalog(test_fixtures.id('club_a'), '{}'::jsonb)$$,
  '42501', null, 'admin cannot provision another club'
);
reset role;

create temporary table audit_before as select count(*)::integer as total from public.audit_log;
select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;
select throws_ok(
  $$select public.provision_official_amigo_catalog(
    test_fixtures.id('club_a'),
    jsonb_build_object('schemaVersion', 1, 'sections', '[]'::jsonb, 'requirements', '[]'::jsonb)
  )$$,
  '23514', null, 'count-shaped bypasses cannot cross the structural contract'
);
select throws_ok(
  $$select public.provision_official_amigo_catalog(
    test_fixtures.id('club_a'),
    jsonb_build_object(
      'schemaVersion', 1,
      'source', jsonb_build_object('sourceCode', 'dsa.amigo.es', 'revisionKey', 'dsa-amigo-official-card-es-undated'),
      'sections', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid())) from generate_series(1, 9)),
      'requirements', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid())) from generate_series(1, 121))
    )
  )$$,
  '23514', null, 'aggregate-valid synthetic payloads fail the exact AC4 fingerprint'
);
select is((select count(*)::integer from public.catalogs where level_template_id is not null), 0, 'rejected payloads create no official catalog');
reset role;
select is((select count(*)::integer from public.audit_log), (select total from audit_before), 'rejected payloads leave no post-transaction audit');
set local role authenticated;
select throws_ok(
  $$select public.provision_official_amigo_catalog_unchecked_v1(test_fixtures.id('club_a'), '{}'::jsonb)$$,
  '42501', null, 'authenticated callers cannot invoke the renamed unchecked implementation'
);
select throws_ok(
  $$select * from public.official_payload_contracts$$,
  '42501', null, 'authenticated callers cannot read or alter the pinned canonical fingerprint'
);

select * from finish();
rollback;

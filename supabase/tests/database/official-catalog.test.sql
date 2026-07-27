begin;

\ir fixtures.sql

select plan(24);

select lives_ok(
  'select test_fixtures.install()',
  'legacy STG-shaped fixtures still install without additive metadata'
);

select is(
  (select count(*)::integer from public.requirements where source_code is null and section_id is null),
  2,
  'existing requirements require no backfill'
);

insert into public.official_sources (id, source_code, authority, locale, document_sha256, revision_key, is_undated, provenance)
values ('81000000-0000-0000-0000-000000000001', 'dsa.amigo.es', 'DSA', 'es', repeat('a', 64), 'undated-pdf', true, 'Visible PDF pages');
insert into public.class_families (id, family_code, title)
values ('82000000-0000-0000-0000-000000000001', 'amigo', 'Amigo');
insert into public.class_level_templates (id, family_id, source_id, level_code, class_type, title, position)
values ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'amigo.regular', 'regular', 'Amigo', 0);
insert into public.class_level_templates (id, family_id, source_id, level_code, class_type, title, position, related_level_template_id)
values ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'amigo.naturaleza', 'advanced', 'Amigo de la Naturaleza', 1, '83000000-0000-0000-0000-000000000001');

select lives_ok(
  $$insert into public.catalogs (id, club_id, class_type, title, level_template_id, source_catalog_code) values
    ('84000000-0000-0000-0000-000000000001', test_fixtures.id('club_a'), 'regular', 'Official Amigo A', '83000000-0000-0000-0000-000000000001', 'amigo.regular'),
    ('84000000-0000-0000-0000-000000000002', test_fixtures.id('club_b'), 'regular', 'Official Amigo B', '83000000-0000-0000-0000-000000000001', 'amigo.regular')$$,
  'two clubs can reference one reusable official level without sharing ownership'
);

select throws_ok(
  $$insert into public.catalogs (club_id, class_type, title, level_template_id, source_catalog_code)
    values (test_fixtures.id('club_a'), 'regular', 'Duplicate official Amigo A', '83000000-0000-0000-0000-000000000001', 'amigo.other')$$,
  '23505', null,
  'a club cannot duplicate the same official level'
);

select throws_ok(
  $$insert into public.catalogs (club_id, class_type, title, level_template_id, source_catalog_code)
    values (test_fixtures.id('club_a'), 'regular', 'Invalid advanced identity', '83000000-0000-0000-0000-000000000002', 'amigo.invalid')$$,
  '23514', 'official catalog identity must match its class level template',
  'catalog class type must match the reusable level template'
);

select throws_ok(
  $$insert into public.catalog_versions (catalog_id, version_number, status)
    values ('84000000-0000-0000-0000-000000000001', 2, 'draft')$$,
  '23514', 'official catalog versions require revision, source hash, and provenance',
  'official versions cannot omit stable provenance'
);

insert into public.catalog_versions (id, catalog_id, version_number, status, source_revision_key, source_document_sha256, provenance)
values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1, 'draft', 'undated-pdf', repeat('a', 64), 'Visible PDF pages'),
  ('85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000002', 1, 'draft', 'undated-pdf', repeat('a', 64), 'Visible PDF pages');
insert into public.catalog_sections (id, catalog_version_id, source_code, title, position) values
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', 'generales', 'Generales', 0),
  ('86000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002', 'generales', 'Generales', 0);

insert into public.requirements (id, catalog_version_id, section_id, source_code, requirement_type, title, position, weight, modalities, progress_mode, completion_semantics)
values ('87000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', 'general.1', 'compound', 'Root', 0, 1, array['reading'], 'derived', 'all_children');
insert into public.requirements (id, catalog_version_id, parent_requirement_id, section_id, source_code, child_role, requirement_type, title, position, weight, modalities, progress_mode, completion_semantics)
values ('87000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', 'general.1.a', 'checklist_item', 'checklist', 'Child', 0, 0, array['reading'], 'direct', 'direct');

select is((select weight from public.requirements where id = '87000000-0000-0000-0000-000000000001'), 1.00::numeric, 'official roots retain unit weight');
select is((select weight from public.requirements where id = '87000000-0000-0000-0000-000000000002'), 0.00::numeric, 'official children retain zero weight');

select throws_ok(
  $$insert into public.requirements (catalog_version_id, parent_requirement_id, section_id, source_code, child_role, requirement_type, title, position, weight, modalities, progress_mode, completion_semantics)
    values ('85000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', 'general.1.b', 'step', 'manual', 'Weighted child', 1, 1, array['written'], 'direct', 'direct')$$,
  '23514', 'official child requirements require a child role and zero weight',
  'official children cannot inflate progress weight'
);

select throws_ok(
  $$insert into public.requirements (catalog_version_id, parent_requirement_id, section_id, source_code, child_role, requirement_type, title, position, weight, modalities, progress_mode, completion_semantics)
    values ('85000000-0000-0000-0000-000000000002', '87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000002', 'general.cross', 'step', 'manual', 'Cross version', 1, 0, array['written'], 'direct', 'direct')$$,
  '23514', 'parent requirement must belong to the same catalog version',
  'parents cannot cross catalog versions or tenants'
);

select throws_ok(
  $$update public.requirements set parent_requirement_id = '87000000-0000-0000-0000-000000000002', child_role = 'step', weight = 0 where id = '87000000-0000-0000-0000-000000000001'$$,
  '23514', 'requirement hierarchy cannot contain a cycle',
  'requirement hierarchy rejects cycles'
);

select throws_ok(
  $$insert into public.catalog_sections (catalog_version_id, source_code, title, position)
    values ('85000000-0000-0000-0000-000000000001', 'generales', 'Duplicate', 1)$$,
  '23505', null,
  'stable section codes are unique within a version'
);

update public.catalog_versions set status = 'published', published_at = now()
where id = '85000000-0000-0000-0000-000000000001';

select throws_ok(
  $$update public.catalog_sections set title = 'Changed' where id = '86000000-0000-0000-0000-000000000001'$$,
  'P0001', 'sections of published catalog versions are immutable; create a new version',
  'published sections are immutable'
);

select throws_ok(
  $$update public.catalogs set source_catalog_code = 'amigo.changed' where id = '84000000-0000-0000-0000-000000000001'$$,
  '23514', 'official identity of a catalog with published versions is immutable',
  'published catalog official identity cannot be reassigned'
);

set local role service_role;

select throws_ok(
  $$update public.official_sources set provenance = 'Changed' where id = '81000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot update a source referenced by a published version'
);
select throws_ok(
  $$delete from public.official_sources where id = '81000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot delete a source referenced by a published version'
);
select throws_ok(
  $$update public.class_families set title = 'Changed' where id = '82000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot update a family referenced by a published version'
);
select throws_ok(
  $$delete from public.class_families where id = '82000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot delete a family referenced by a published version'
);
select throws_ok(
  $$update public.class_level_templates set title = 'Changed' where id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot update a level template referenced by a published version'
);
select throws_ok(
  $$delete from public.class_level_templates where id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', 'official metadata referenced by a published catalog version is immutable; create a new revision or template',
  'service role cannot delete a level template referenced by a published version'
);

select lives_ok(
  $$insert into public.official_sources (id, source_code, authority, locale, document_sha256, revision_key, provenance)
      values ('81000000-0000-0000-0000-000000000002', 'dsa.amigo.es.v2', 'DSA', 'es', repeat('b', 64), 'revision-2', 'New revision');
    insert into public.class_families (id, family_code, title)
      values ('82000000-0000-0000-0000-000000000002', 'companero', 'Compañero');
    insert into public.class_level_templates (id, family_id, source_id, level_code, class_type, title, position)
      values ('83000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'companero.regular', 'regular', 'Compañero', 0)$$,
  'service role can create new revisions, families, and level templates'
);

insert into public.class_families (id, family_code, title)
values ('82000000-0000-0000-0000-000000000003', 'explorador', 'Explorador');
insert into public.class_level_templates (id, family_id, source_id, level_code, class_type, title, position)
values ('83000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', 'explorador.regular', 'regular', 'Explorador', 0);
insert into public.class_level_templates (id, family_id, source_id, level_code, class_type, title, position, related_level_template_id)
values ('83000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', 'explorador.advanced', 'advanced', 'Explorador avanzado', 1, '83000000-0000-0000-0000-000000000004');

select throws_ok(
  $$update public.class_level_templates set family_id = '82000000-0000-0000-0000-000000000002' where id = '83000000-0000-0000-0000-000000000004'$$,
  '23514', 'related class levels must be distinct regular and advanced levels in the same family',
  'updating a related target cannot leave an incoming cross-family relation'
);
select throws_ok(
  $$update public.class_level_templates set class_type = 'advanced' where id = '83000000-0000-0000-0000-000000000004'$$,
  '23514', 'related class levels must be distinct regular and advanced levels in the same family',
  'updating a related target cannot leave incoming levels with the same class type'
);

reset role;

select test_fixtures.assume_authenticated(test_fixtures.id('admin_b'));
set local role authenticated;
select is(
  (select count(*)::integer from public.catalog_sections where catalog_version_id = '85000000-0000-0000-0000-000000000001'),
  0,
  'catalog section RLS hides another club tenant'
);
reset role;

select * from finish();
rollback;

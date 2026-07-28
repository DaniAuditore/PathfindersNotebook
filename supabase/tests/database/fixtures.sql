-- Include this file from each pgTAP suite after `begin;` and before `plan()`.
-- Fixture creation intentionally happens as the test runner (postgres). Individual
-- assertions must then call `test_fixtures.assume_authenticated(...)` followed by
-- `set local role authenticated`; no RLS assertion may execute as postgres.

create schema if not exists test_fixtures;

create or replace function test_fixtures.id(fixture_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  case fixture_name
    when 'club_a' then return '10000000-0000-0000-0000-000000000001';
    when 'club_b' then return '10000000-0000-0000-0000-000000000002';
    when 'organization_a' then return '10000000-0000-0000-0000-000000000003';
    when 'unit_a' then return '10000000-0000-0000-0000-000000000004';
    when 'admin_a' then return '20000000-0000-0000-0000-000000000001';
    when 'instructor_a' then return '20000000-0000-0000-0000-000000000002';
    when 'guardian_a' then return '20000000-0000-0000-0000-000000000003';
    when 'student_a_user' then return '20000000-0000-0000-0000-000000000004';
    when 'admin_b' then return '20000000-0000-0000-0000-000000000005';
    when 'student_b_user' then return '20000000-0000-0000-0000-000000000006';
    when 'system_admin_a' then return '20000000-0000-0000-0000-000000000007';
    when 'counselor_a' then return '20000000-0000-0000-0000-000000000008';
    when 'student_a' then return '30000000-0000-0000-0000-000000000001';
    when 'student_b' then return '30000000-0000-0000-0000-000000000002';
    when 'catalog_a' then return '40000000-0000-0000-0000-000000000001';
    when 'catalog_b' then return '40000000-0000-0000-0000-000000000002';
    when 'catalog_version_a' then return '50000000-0000-0000-0000-000000000001';
    when 'catalog_version_b' then return '50000000-0000-0000-0000-000000000002';
    when 'requirement_a' then return '60000000-0000-0000-0000-000000000001';
    when 'requirement_b' then return '60000000-0000-0000-0000-000000000002';
    when 'enrollment_a' then return '70000000-0000-0000-0000-000000000001';
    when 'enrollment_b' then return '70000000-0000-0000-0000-000000000002';
    else raise exception 'unknown test fixture: %', fixture_name;
  end case;
end;
$$;

-- Set the claims first while the privileged fixture setup context is still active.
-- PostgreSQL forbids SET ROLE from a security-definer function, so every test must
-- explicitly follow this helper with `set local role authenticated`.
create or replace function test_fixtures.assume_authenticated(actor_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function test_fixtures.install()
returns void
language plpgsql
security invoker
set search_path = public, test_fixtures, auth
as $$
begin
  -- Tests run in a transaction and roll it back. This reset makes each suite
  -- independent when pg_prove executes files in separate sessions.
  truncate table
    public.audit_log,
    public.attempt_evidence,
    public.evidence,
    public.evidence_upload_rate_limits,
    public.progress_reviews,
    public.progress_attempts,
    public.requirement_progress,
    public.assessments,
    public.investitures,
    public.enrollments,
    public.requirements,
    public.catalog_versions,
    public.catalogs,
    public.students,
    public.memberships,
    public.role_assignment_migration_ledger,
    public.role_assignments,
    public.units,
    public.organizations,
    public.profiles,
    public.clubs
  restart identity cascade;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (test_fixtures.id('admin_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('instructor_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-instructor-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('guardian_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-guardian-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('student_a_user'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-student-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('admin_b'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-admin-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('student_b_user'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-student-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('system_admin_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-system-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (test_fixtures.id('counselor_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixture-counselor-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do update set email = excluded.email, updated_at = excluded.updated_at;

  insert into public.profiles (user_id, display_name) values
    (test_fixtures.id('admin_a'), 'Fixture Admin A'),
    (test_fixtures.id('instructor_a'), 'Fixture Instructor A'),
    (test_fixtures.id('guardian_a'), 'Fixture Guardian A'),
    (test_fixtures.id('student_a_user'), 'Fixture Student A'),
    (test_fixtures.id('admin_b'), 'Fixture Admin B'),
    (test_fixtures.id('student_b_user'), 'Fixture Student B'),
    (test_fixtures.id('system_admin_a'), 'Fixture System Admin'),
    (test_fixtures.id('counselor_a'), 'Fixture Counselor A');

  insert into public.clubs (id, name) values
    (test_fixtures.id('club_a'), 'Fixture Club A'),
    (test_fixtures.id('club_b'), 'Fixture Club B');
  insert into public.organizations (id, name) values (test_fixtures.id('organization_a'), 'Fixture Organization A');
  insert into public.units (id, club_id, name) values (test_fixtures.id('unit_a'), test_fixtures.id('club_a'), 'Fixture Unit A');

  insert into public.memberships (club_id, user_id, role) values
    (test_fixtures.id('club_a'), test_fixtures.id('admin_a'), 'admin'),
    (test_fixtures.id('club_a'), test_fixtures.id('instructor_a'), 'instructor'),
    (test_fixtures.id('club_b'), test_fixtures.id('admin_b'), 'admin');

  insert into public.students (id, club_id, display_name, guardian_user_id, student_user_id) values
    (test_fixtures.id('student_a'), test_fixtures.id('club_a'), 'Fixture Student A', test_fixtures.id('guardian_a'), test_fixtures.id('student_a_user')),
    (test_fixtures.id('student_b'), test_fixtures.id('club_b'), 'Fixture Student B', null, test_fixtures.id('student_b_user'));
  insert into public.role_assignments (user_id, role, club_id) values
    (test_fixtures.id('admin_a'), 'CLUB_DIRECTOR', test_fixtures.id('club_a')),
    (test_fixtures.id('instructor_a'), 'INSTRUCTOR', test_fixtures.id('club_a')),
    (test_fixtures.id('admin_b'), 'CLUB_DIRECTOR', test_fixtures.id('club_b'));
  insert into public.role_assignments (user_id, role, student_id) values
    (test_fixtures.id('guardian_a'), 'GUARDIAN', test_fixtures.id('student_a')),
    (test_fixtures.id('student_a_user'), 'PATHFINDER', test_fixtures.id('student_a')),
    (test_fixtures.id('student_b_user'), 'PATHFINDER', test_fixtures.id('student_b'));
  insert into public.role_assignments (user_id, role, organization_id) values (test_fixtures.id('system_admin_a'), 'SYSTEM_ADMIN', test_fixtures.id('organization_a'));
  insert into public.role_assignments (user_id, role, unit_id) values (test_fixtures.id('counselor_a'), 'COUNSELOR', test_fixtures.id('unit_a'));

  insert into public.catalogs (id, club_id, class_type, title) values
    (test_fixtures.id('catalog_a'), test_fixtures.id('club_a'), 'regular', 'Fixture Regular A'),
    (test_fixtures.id('catalog_b'), test_fixtures.id('club_b'), 'regular', 'Fixture Regular B');

  insert into public.catalog_versions (id, catalog_id, version_number, status, published_at) values
    (test_fixtures.id('catalog_version_a'), test_fixtures.id('catalog_a'), 1, 'draft', null),
    (test_fixtures.id('catalog_version_b'), test_fixtures.id('catalog_b'), 1, 'draft', null);

  insert into public.requirements (id, catalog_version_id, requirement_type, title, position, requires_evidence, evidence_types) values
    (test_fixtures.id('requirement_a'), test_fixtures.id('catalog_version_a'), 'file', 'Fixture evidence requirement A', 0, true, array['application/pdf']),
    (test_fixtures.id('requirement_b'), test_fixtures.id('catalog_version_b'), 'manual', 'Fixture requirement B', 0, false, '{}');

  -- Publication is valid once; subsequent fixture tests exercise immutable writes.
  update public.catalog_versions
  set status = 'published', published_at = now()
  where id in (test_fixtures.id('catalog_version_a'), test_fixtures.id('catalog_version_b'));

  insert into public.enrollments (id, club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by) values
    (test_fixtures.id('enrollment_a'), test_fixtures.id('club_a'), test_fixtures.id('student_a'), test_fixtures.id('catalog_a'), test_fixtures.id('catalog_version_a'), 2026, test_fixtures.id('admin_a')),
    (test_fixtures.id('enrollment_b'), test_fixtures.id('club_b'), test_fixtures.id('student_b'), test_fixtures.id('catalog_b'), test_fixtures.id('catalog_version_b'), 2026, test_fixtures.id('admin_b'));
end;
$$;

grant usage on schema test_fixtures to authenticated;
grant execute on function test_fixtures.id(text) to authenticated;
grant execute on function test_fixtures.assume_authenticated(uuid) to authenticated;

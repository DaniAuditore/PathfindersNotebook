begin;

\ir fixtures.sql

select plan(17);

select lives_ok(
  'select test_fixtures.install()',
  'privileged setup installs deterministic fixtures before privileged-UI ACL assertions'
);

select ok(
  not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT, UPDATE, DELETE'),
  'authenticated has no direct DML on residual privileged-UI table ' || table_name
)
from unnest(array['organizations', 'units', 'evidence_upload_rate_limits']) as table_name;

select ok(
  not has_table_privilege('anon', format('public.%I', table_name), 'INSERT, UPDATE, DELETE'),
  'anon has no direct DML on residual privileged-UI table ' || table_name
)
from unnest(array['organizations', 'units', 'evidence_upload_rate_limits']) as table_name;

select ok(
  not has_table_privilege('public', format('public.%I', table_name), 'INSERT, UPDATE, DELETE'),
  'PUBLIC has no direct DML on residual privileged-UI table ' || table_name
)
from unnest(array['organizations', 'units', 'evidence_upload_rate_limits']) as table_name;

select ok(
  not exists (
    select 1
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    where membership.roleid = 'pathfinders_scoped_command_owner'::regrole
      and member_role.rolname in ('anon', 'authenticated', 'service_role')
  ),
  'no application database role has membership that could permit SET ROLE to the command owner'
);

select ok(
  not exists (
    select 1 from pg_auth_members membership
    where membership.roleid = 'pathfinders_scoped_command_owner'::regrole
      and membership.member <> 'postgres'::regrole
  ),
  'the owner has no SET ROLE member beyond the controlled postgres migration principal'
);

select ok(
  not has_schema_privilege('pathfinders_scoped_command_owner', 'auth', 'USAGE')
  and not has_table_privilege('pathfinders_scoped_command_owner', 'auth.users', 'SELECT, INSERT, UPDATE, DELETE'),
  'the command owner has no Auth schema or auth.users table privilege'
);

select ok(
  has_table_privilege('pathfinders_scoped_command_owner', 'public.evidence_upload_rate_limits', 'SELECT, INSERT, UPDATE')
  and not has_table_privilege('authenticated', 'public.evidence_upload_rate_limits', 'INSERT, UPDATE, DELETE'),
  'only the command owner retains the rate-limit state privileges required by prepare_evidence_upload'
);

select test_fixtures.assume_authenticated(test_fixtures.id('admin_a'));
set local role authenticated;

select throws_ok(
  $$insert into public.organizations (id, name) values (gen_random_uuid(), 'browser organization')$$,
  '42501', 'permission denied for table organizations',
  'an authenticated user cannot directly create an organization without an approved command'
);

select throws_ok(
  $$insert into public.units (id, club_id, name) values (gen_random_uuid(), test_fixtures.id('club_a'), 'browser unit')$$,
  '42501', 'permission denied for table units',
  'an authenticated user cannot directly create a unit without an approved command'
);

select throws_ok(
  $$insert into public.evidence_upload_rate_limits (user_id, window_started_at, upload_count) values (test_fixtures.id('admin_a'), now(), 1)$$,
  '42501', 'permission denied for table evidence_upload_rate_limits',
  'an authenticated user cannot directly mutate evidence rate-limit state'
);

reset role;
select * from finish();
rollback;

-- Move the 024/025 command boundaries away from the login-capable migration
-- owner. This is forward-only: existing role assignments and domain/audit rows
-- are never remapped or removed.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pathfinders_scoped_command_owner') then
    create role pathfinders_scoped_command_owner nologin noinherit nosuperuser nocreatedb nocreaterole bypassrls;
  end if;
end;
$$;

comment on role pathfinders_scoped_command_owner is
  'Non-login owner for scoped SECURITY DEFINER commands. BYPASSRLS is limited by explicit object grants; each command must authorize with auth.uid() and canonical scope predicates.';

-- PostgreSQL requires the migration executor to be able to SET ROLE to the new
-- owner before ALTER FUNCTION ... OWNER TO can run. postgres is already the
-- controlled migration principal; this does not grant browser principals it.
grant pathfinders_scoped_command_owner to postgres;

-- CREATE is required only while PostgreSQL transfers function ownership; revoke
-- it again after the transfer so the command owner cannot define new objects.
grant usage, create on schema public to pathfinders_scoped_command_owner;
grant usage on schema auth to pathfinders_scoped_command_owner;
grant execute on function auth.uid(), auth.jwt() to pathfinders_scoped_command_owner;
revoke all privileges on all tables in schema public from pathfinders_scoped_command_owner;

-- Grant only the rows/tables touched by the command bodies. Audit triggers keep
-- their existing privileged writer; the download command is the sole command
-- granted direct audit insertion.
grant select, update on public.profiles, public.clubs to pathfinders_scoped_command_owner;
grant select, insert, update on public.students, public.role_assignments to pathfinders_scoped_command_owner;
grant select on public.organizations, public.units, public.requirements, public.catalog_sections to pathfinders_scoped_command_owner;
grant select, insert on public.catalogs, public.catalog_versions to pathfinders_scoped_command_owner;
grant select, insert, update on public.enrollments, public.requirement_progress, public.progress_attempts, public.assessments, public.evidence to pathfinders_scoped_command_owner;
grant insert on public.progress_reviews, public.investitures, public.audit_log to pathfinders_scoped_command_owner;

grant execute on function public.has_canonical_role_at_club(uuid, public.canonical_role[]),
  public.has_canonical_role_in_unit(uuid, public.canonical_role[]),
  public.has_student_link(uuid, public.canonical_role[]),
  public.is_club_member(uuid, public.club_role[]),
  public.can_review_progress(uuid),
  public.can_access_evidence(uuid),
  public.can_submit_evidence(uuid),
  public.consume_evidence_upload_rate_limit(),
  public.enrollment_ready_for_assessment(uuid)
to pathfinders_scoped_command_owner;

alter function public.update_own_profile(text) owner to pathfinders_scoped_command_owner;
alter function public.update_club(uuid, text) owner to pathfinders_scoped_command_owner;
alter function public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid) owner to pathfinders_scoped_command_owner;
alter function public.revoke_role(uuid) owner to pathfinders_scoped_command_owner;
alter function public.publish_catalog_draft(uuid, public.catalog_class_type, text) owner to pathfinders_scoped_command_owner;

revoke create on schema public from pathfinders_scoped_command_owner;

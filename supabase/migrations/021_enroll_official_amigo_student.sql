-- The browser-facing enrollment action must not depend on PostgREST's direct
-- table-write/returning RLS contract. Keep authorization, canonical identity,
-- idempotency, and progress initialization in one authenticated transaction.
create function public.enroll_official_amigo_student(
  target_student_id uuid,
  target_school_year smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_student public.students;
  target_catalog public.catalogs;
  target_version public.catalog_versions;
  existing_enrollment_id uuid;
  created_enrollment_id uuid;
  root_count integer;
  child_count integer;
  requirement_count integer;
  progress_count integer;
begin
  if auth.uid() is null or target_school_year not between 2000 and 2100 then
    raise exception 'an authenticated administrator and valid school year are required'
      using errcode = '42501';
  end if;

  select * into target_student
  from public.students
  where id = target_student_id;
  if not found or not public.is_club_member(target_student.club_id, array['admin']::public.club_role[]) then
    raise exception 'an authenticated administrator may enroll only a student in their club'
      using errcode = '42501';
  end if;

  select * into target_catalog
  from public.catalogs
  where club_id = target_student.club_id
    and source_catalog_code = 'amigo.regular'
    and class_type = 'regular';
  if not found then
    raise exception 'official regular Amigo is not provisioned for this club'
      using errcode = '23514';
  end if;

  select * into target_version
  from public.catalog_versions
  where catalog_id = target_catalog.id
    and status = 'published'
    and source_revision_key = 'dsa-amigo-official-card-es-undated';
  if not found then
    raise exception 'official regular Amigo does not have the canonical published version'
      using errcode = '23514';
  end if;

  select
    count(*) filter (where parent_requirement_id is null)::integer,
    count(*) filter (where parent_requirement_id is not null)::integer,
    count(*)::integer
  into root_count, child_count, requirement_count
  from public.requirements
  where catalog_version_id = target_version.id;
  if root_count <> 25 or child_count <> 96 or requirement_count <> 121 then
    raise exception 'official regular Amigo does not satisfy the canonical enrollment contract'
      using errcode = '23514';
  end if;

  select id into existing_enrollment_id
  from public.enrollments
  where student_id = target_student.id
    and catalog_id = target_catalog.id
    and school_year = target_school_year;
  if found then
    return jsonb_build_object('enrollmentId', existing_enrollment_id, 'existing', true);
  end if;

  insert into public.enrollments (
    club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by
  ) values (
    target_student.club_id, target_student.id, target_catalog.id, target_version.id,
    target_school_year, auth.uid()
  ) returning id into created_enrollment_id;

  select count(*)::integer into progress_count
  from public.requirement_progress
  where enrollment_id = created_enrollment_id;
  if progress_count <> 121 then
    raise exception 'official Amigo progress initialization did not complete'
      using errcode = '23514';
  end if;

  return jsonb_build_object('enrollmentId', created_enrollment_id, 'existing', false);
end;
$$;

revoke all on function public.enroll_official_amigo_student(uuid, smallint) from public, anon, authenticated;
grant execute on function public.enroll_official_amigo_student(uuid, smallint) to authenticated;

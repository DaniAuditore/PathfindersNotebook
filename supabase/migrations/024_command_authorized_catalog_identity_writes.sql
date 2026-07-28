-- All definitions in this migration are SECURITY DEFINER command boundaries.
-- Their owner must be the migration owner/non-login command role in deployment;
-- callers receive EXECUTE only and never table DML privileges.
create or replace function public.update_own_profile(display_name_input text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or char_length(trim(coalesce(display_name_input, ''))) not between 1 and 120 then
    raise exception 'a valid authenticated profile update is required' using errcode = '42501';
  end if;
  update public.profiles set display_name = trim(display_name_input) where user_id = auth.uid();
  if not found then raise exception 'profile does not exist' using errcode = '23514'; end if;
  return auth.uid();
end;
$$;

create or replace function public.update_club(target_club_id uuid, name_input text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_canonical_role_at_club(target_club_id, array['CLUB_DIRECTOR']::public.canonical_role[]) then
    raise exception 'only the scoped club director may update a club' using errcode = '42501';
  end if;
  update public.clubs set name = trim(name_input) where id = target_club_id and char_length(trim(coalesce(name_input, ''))) between 1 and 160;
  if not found then raise exception 'club name is invalid or club does not exist' using errcode = '23514'; end if;
  return target_club_id;
end;
$$;

create or replace function public.create_or_update_student(target_student_id uuid, target_club_id uuid, display_name_input text, birth_year_input smallint default null, guardian_user_id_input uuid default null, student_user_id_input uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result_id uuid;
begin
  if not public.has_canonical_role_at_club(target_club_id, array['CLUB_DIRECTOR','INSTRUCTOR']::public.canonical_role[]) then
    raise exception 'only a scoped director or instructor may manage a learner' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(display_name_input, ''))) not between 1 and 120 then raise exception 'learner name is invalid' using errcode = '23514'; end if;
  if target_student_id is null then
    insert into public.students (club_id, display_name, birth_year, guardian_user_id, student_user_id)
    values (target_club_id, trim(display_name_input), birth_year_input, guardian_user_id_input, student_user_id_input) returning id into result_id;
  else
    update public.students set display_name = trim(display_name_input), birth_year = birth_year_input, guardian_user_id = guardian_user_id_input, student_user_id = student_user_id_input
    where id = target_student_id and club_id = target_club_id returning id into result_id;
    if result_id is null then raise exception 'learner is outside the scoped club' using errcode = '42501'; end if;
  end if;
  return result_id;
end;
$$;

create or replace function public.assign_role(target_user_id uuid, role_input public.canonical_role, target_club_id uuid default null, target_unit_id uuid default null, target_student_id uuid default null, target_assessment_id uuid default null, target_organization_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare assignment_id uuid; scope_club_id uuid;
begin
  -- SYSTEM_ADMIN can only be bootstrapped by the database operator, never by an
  -- authenticated browser principal. This prevents a club director from elevation.
  if role_input = 'SYSTEM_ADMIN' then raise exception 'system administrator assignment requires an offline platform procedure' using errcode = '42501'; end if;
  select coalesce(target_club_id, u.club_id, s.club_id, e.club_id) into scope_club_id
  from (select 1) x left join public.units u on u.id = target_unit_id
  left join public.students s on s.id = target_student_id
  left join public.assessments a on a.id = target_assessment_id
  left join public.enrollments e on e.id = a.enrollment_id;
  if scope_club_id is null or not public.has_canonical_role_at_club(scope_club_id, array['CLUB_DIRECTOR']::public.canonical_role[]) then
    raise exception 'only the scoped club director may assign roles' using errcode = '42501';
  end if;
  insert into public.role_assignments (user_id, role, organization_id, club_id, unit_id, student_id, assessment_id)
  values (target_user_id, role_input, target_organization_id, target_club_id, target_unit_id, target_student_id, target_assessment_id)
  on conflict do nothing returning id into assignment_id;
  if assignment_id is null then
    select id into assignment_id from public.role_assignments where user_id = target_user_id and role = role_input
      and organization_id is not distinct from target_organization_id and club_id is not distinct from target_club_id and unit_id is not distinct from target_unit_id
      and student_id is not distinct from target_student_id and assessment_id is not distinct from target_assessment_id and revoked_at is null;
  end if;
  return assignment_id;
end;
$$;

create or replace function public.revoke_role(target_assignment_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare assignment public.role_assignments; scope_club_id uuid;
begin
  select * into assignment from public.role_assignments where id = target_assignment_id for update;
  if not found then raise exception 'role assignment does not exist' using errcode = '23514'; end if;
  select coalesce(assignment.club_id, u.club_id, s.club_id, e.club_id) into scope_club_id from (select 1) x left join public.units u on u.id = assignment.unit_id left join public.students s on s.id = assignment.student_id left join public.assessments a on a.id = assignment.assessment_id left join public.enrollments e on e.id = a.enrollment_id;
  if scope_club_id is null or not public.has_canonical_role_at_club(scope_club_id, array['CLUB_DIRECTOR']::public.canonical_role[]) then raise exception 'only the scoped club director may revoke roles' using errcode = '42501'; end if;
  update public.role_assignments set revoked_at = now() where id = target_assignment_id;
  return target_assignment_id;
end;
$$;

create or replace function public.publish_catalog_draft(target_club_id uuid, class_type_input public.catalog_class_type, title_input text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare catalog_id uuid; version_id uuid;
begin
  if not public.has_canonical_role_at_club(target_club_id, array['CLUB_DIRECTOR']::public.canonical_role[]) then raise exception 'only the scoped club director may publish a catalog' using errcode = '42501'; end if;
  if char_length(trim(coalesce(title_input, ''))) not between 1 and 160 then raise exception 'catalog title is invalid' using errcode = '23514'; end if;
  insert into public.catalogs (club_id, class_type, title) values (target_club_id, class_type_input, trim(title_input)) returning id into catalog_id;
  insert into public.catalog_versions (catalog_id, version_number, status, published_at) values (catalog_id, 1, 'published', now()) returning id into version_id;
  return jsonb_build_object('catalogId', catalog_id, 'versionId', version_id, 'versionNumber', 1);
end;
$$;

revoke all on function public.update_own_profile(text), public.update_club(uuid, text), public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid), public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid), public.revoke_role(uuid), public.publish_catalog_draft(uuid, public.catalog_class_type, text) from public, anon;
grant execute on function public.update_own_profile(text), public.update_club(uuid, text), public.create_or_update_student(uuid, uuid, text, smallint, uuid, uuid), public.assign_role(uuid, public.canonical_role, uuid, uuid, uuid, uuid, uuid), public.revoke_role(uuid), public.publish_catalog_draft(uuid, public.catalog_class_type, text) to authenticated;

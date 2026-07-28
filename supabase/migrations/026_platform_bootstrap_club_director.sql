-- A newly created club needs an initial canonical director before any browser
-- actor can use the CLUB_DIRECTOR-gated commands. This is a narrowly scoped
-- platform bootstrap boundary, not a replacement for browser authorization or
-- direct table DML: only service_role may invoke it and it can grant only the
-- club-scoped director role.
create function public.bootstrap_club_director(target_user_id uuid, target_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'club director bootstrap requires the platform service' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where user_id = target_user_id)
    or not exists (select 1 from public.clubs where id = target_club_id) then
    raise exception 'club director bootstrap target does not exist' using errcode = '23514';
  end if;

  insert into public.role_assignments (user_id, role, club_id)
  values (target_user_id, 'CLUB_DIRECTOR', target_club_id)
  on conflict do nothing
  returning id into assignment_id;

  if assignment_id is null then
    select id into assignment_id
    from public.role_assignments
    where user_id = target_user_id
      and role = 'CLUB_DIRECTOR'
      and club_id = target_club_id
      and revoked_at is null;
  end if;

  return assignment_id;
end;
$$;

revoke all on function public.bootstrap_club_director(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_club_director(uuid, uuid) to service_role;

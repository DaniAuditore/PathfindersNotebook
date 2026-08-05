-- SECURITY DEFINER commands must read the authenticated actor from the
-- hardened public helper. Calling auth.uid() here makes the function execute
-- with the caller's auth-schema privileges and denies valid first logins.
create or replace function public.credential_gate_status()
returns text language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  actor_id uuid := public.request_actor_id();
begin
  if exists (
    select 1
    from public.member_credentials mc
    join public.club_members m on m.id = mc.member_id
    where mc.auth_user_id = actor_id
      and m.lifecycle = 'ACTIVE'
      and (
        mc.state = 'ACTIVE'
        or (mc.state = 'INITIAL_CHANGE_REQUIRED' and mc.temporary_credential_expires_at > now())
      )
  ) then
    if exists (
      select 1 from public.member_credentials
      where auth_user_id = actor_id and state = 'INITIAL_CHANGE_REQUIRED'
    ) then
      return 'CHANGE_PASSWORD';
    end if;
    return 'ALLOW';
  end if;

  if exists (select 1 from public.club_members where user_id = actor_id) then
    return 'DENY';
  end if;
  return 'ALLOW';
end;
$$;

alter function public.credential_gate_status() owner to pathfinders_scoped_command_owner;
revoke all on function public.credential_gate_status() from public, anon;
grant execute on function public.credential_gate_status() to authenticated;

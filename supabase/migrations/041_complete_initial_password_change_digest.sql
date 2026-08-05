-- pgcrypto is installed in the extensions schema, which is intentionally not
-- on SECURITY DEFINER command search paths. Qualify digest so a successful
-- Auth password update can complete the database-authoritative credential gate.
-- An Auth binding persists after its initial change (and while expired), so the
-- original INITIAL_CHANGE_REQUIRED-only constraint must cover those states.
alter table public.member_credentials drop constraint member_credentials_check1;
alter table public.member_credentials add constraint member_credentials_auth_binding_state_check
  check ((state in ('INITIAL_CHANGE_REQUIRED', 'ACTIVE', 'EXPIRED')) = (auth_user_id is not null));

create or replace function public.complete_initial_password_change(change_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare actor_id uuid := public.request_actor_id(); credential public.member_credentials; target_club_id uuid;
begin
  select mc.* into credential from public.member_credentials mc
  where mc.auth_user_id = actor_id for update;
  if not found or credential.state <> 'INITIAL_CHANGE_REQUIRED'
     or credential.temporary_credential_expires_at <= now()
     or credential.initial_password_change_token_hash is null
     or credential.initial_password_change_token_hash <> extensions.digest(change_token, 'sha256') then
    raise exception 'initial credential cannot be completed' using errcode = '42501';
  end if;
  update public.member_credentials
  set state = 'ACTIVE', temporary_credential_expires_at = null, initial_password_change_token_hash = null
  where id = credential.id;
  select club_id into target_club_id from public.club_members where id = credential.member_id;
  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_club_id, actor_id, 'member.initial_password_changed', 'club_member', credential.member_id,
          jsonb_build_object('credentialId', credential.id));
end;
$$;

alter function public.complete_initial_password_change(text) owner to pathfinders_scoped_command_owner;
grant usage on schema extensions to pathfinders_scoped_command_owner;
revoke all on function public.complete_initial_password_change(text) from public, anon;
grant execute on function public.complete_initial_password_change(text) to authenticated;

-- Evidence mutations already receive immutable protected-mutation audit rows from
-- the evidence trigger. Keep delivery auditing inside its authorization command so
-- authenticated callers never need direct audit_log DML.
create or replace function public.authorized_evidence_download(target_evidence_id uuid)
returns table (club_id uuid, object_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_evidence public.evidence;
begin
  select ev.* into target_evidence
  from public.evidence ev
  where ev.id = target_evidence_id
    and ev.scan_status = 'clean'
    and ev.deleted_at is null
    and public.can_access_evidence(ev.id);

  if not found then
    return;
  end if;

  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_evidence.club_id,
    auth.uid(),
    'evidence.download_authorized',
    'evidence',
    target_evidence.id,
    jsonb_build_object('delivery', 'signed_url')
  );

  return query select target_evidence.club_id, target_evidence.object_path;
end;
$$;

revoke all on function public.authorized_evidence_download(uuid) from public, anon;
grant execute on function public.authorized_evidence_download(uuid) to authenticated;

-- `organizations` and `units` have no approved browser write workflow or
-- caller. `evidence_upload_rate_limits` is command-private state consumed by
-- prepare_evidence_upload. Close all three residual browser DML surfaces
-- without inventing organization or unit management semantics.
revoke insert, update, delete on table
  public.organizations,
  public.units,
  public.evidence_upload_rate_limits
from public, authenticated, anon;

-- Remove any legacy or future permissive write policy on these tables while
-- preserving their reviewed SELECT behavior. The rate-limit table deliberately
-- has no browser policy: the owner-bound evidence command remains its only
-- application write path.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array['organizations', 'units', 'evidence_upload_rate_limits'])
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end;
$$;

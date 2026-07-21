-- Evidence metadata is read through existing enrollment-scoped RLS policies.
-- Granting SELECT makes those policies reachable without granting any write,
-- delete, audit-log, or Storage bypass privilege.
grant select on table public.evidence to authenticated;

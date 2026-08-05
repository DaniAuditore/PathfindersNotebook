-- Only the server-only Auth adapter resolves internal usernames and expires
-- temporary credentials. Browser roles retain no credential-table privilege.
grant select, update on public.member_credentials to service_role;

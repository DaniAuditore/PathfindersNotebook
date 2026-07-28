# Security role alignment — operational runbook

## Scope and guardrails

This runbook covers the forward-only canonical-role and direct-DML closure
migrations `023`–`029`. Use a disposable staging project and approved operator
credentials. Never place secrets, JWTs, signed URLs, learner data, or raw audit
payloads in this document or a ticket.

Do **not** roll back role assignments, evidence, audits, enrollments, or other
domain data. A failed rollout is remediated with a new forward migration or by
temporarily disabling the affected application caller.

## Preflight and deployment

1. Confirm linked history is exactly the expected ordered chain, then review the
   `db push --linked --dry-run` plan. It must contain only unapplied forward
   migrations; do not use `--include-all`.
2. Record aggregate-only reconciliation: legacy admin/viewer totals, active
   canonical role totals, and ledger outcomes. Resolve each legacy admin as a
   same-club `CLUB_DIRECTOR`; viewers remain retired. Never infer or grant
   `SYSTEM_ADMIN` from a legacy role.
3. Apply through the approved deployment process, then confirm migration history.
   `029` moves the scoped SECURITY DEFINER commands to the non-login
   `pathfinders_scoped_command_owner` role; it does not alter business data.

## Post-deployment verification

Run read-only catalog checks and retain only boolean/count results:

- all protected tables deny browser-role `INSERT`, `UPDATE`, and `DELETE`, and
  have no write RLS policy;
- the seven canonical enum values are exact and `can_access_evidence` has no
  `SYSTEM_ADMIN` branch;
- command functions are SECURITY DEFINER, pin `search_path=public, pg_temp`,
  deny anon execution, and have the expected authenticated/service-only grant;
- `024` catalog/identity command owners are `pathfinders_scoped_command_owner`, whose attributes
  are `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`;
- an existing official Amigo catalog passes
  `validate_official_amigo_catalog_version`. This is a read-only validation
  command: it performs no domain mutation and creates no audit row.

For behavioral evidence, an operator must use an existing disposable staging
director session and already-provisioned official catalog. An idempotent retry
of `provision_official_amigo_catalog` is permitted only after confirming its
catalog/version already exists; it returns the existing identifiers and should
not create a domain or audit row. Do not emulate the session by setting JWT
claims through an operator SQL connection. A positive evidence-download call
is intentionally not a smoke check because it creates `evidence.download_authorized`.

## Incident response and rollback boundary

1. Stop or feature-disable the affected server action/caller first. Keep direct
   browser table DML closed.
2. Identify the one command and privilege defect from redacted catalog/audit
   evidence. If service continuity requires it, an authorized DBA may restore
   only that command's prior `EXECUTE` grant or its narrowly required command
   owner table privilege. Record actor, time, object, and expiry.
3. Reproduce with disposable fixtures, ship a new forward remediation migration,
   then remove the temporary privilege and re-run the post-deployment checks.
4. Never restore broad authenticated table DML, permissive write RLS, anonymous
   RPC execution, or a login-capable command owner. Never delete or reverse
   historical role/audit/domain rows as a rollback technique.

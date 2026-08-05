# Staging validation checklist

This package validates the release warnings from the local-contract report. It
is for a disposable staging Supabase project and staging application only. Do
not use production data, production credentials, real minor data, or permanent
evidence files.

## Required non-secret configuration

Configure these values in the staging application's environment (locally in
`.env.local`, and in Vercel's Preview/custom staging environment if Vercel
hosts the staging application):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging-publishable-key>
```

They are publishable client configuration, not privileged credentials. Never
set `SUPABASE_SERVICE_ROLE_KEY`, a database password, a Supabase access token,
or a Vercel token in `.env.local`, `NEXT_PUBLIC_*`, browser storage, test
fixtures, screenshots, or this repository. Keep privileged values only in the
authenticated CI/deployment secret store when an operator must use them.

The staging redirect URLs must allow the actual staging origin and the local
development origins already declared in `supabase/config.toml`. Use only
disposable fixture accounts for the role matrix below.

## Credential-free local migration gate

The local gate is the pre-merge database/API quality gate. It does not link to,
read from, or mutate staging. Its pinned prerequisites are:

- Node `v24.14.1`, exactly as recorded in `.nvmrc`;
- repository dependencies from `npm ci`, including Supabase CLI `2.109.1` from
  `package-lock.json` (never a global CLI or floating `npx` download); and
- a running Docker Engine/Desktop. Docker Engine `29.2.1` is the tested
  baseline.

From a clean checkout, the canonical command is:

```bash
npm ci
npm run test:migrations
```

`npm run test:migrations` starts local Supabase, resets without a seed from zero
through the complete tracked migration chain (currently `001`–`041`), runs
authenticated pgTAP plus local Auth and Storage API tests, and stops with
`--no-backup`. The gate calls `supabase db reset --local --no-seed`, so the
endpoint is discovered from `supabase/migrations` rather than hard-coded. It
needs no Supabase login, linked project, hosted credentials, manual fixture
IDs, or real data. Run `npm test` afterward for complementary static/domain
coverage; it does not replace executable migration validation.

### Local status, logs, and cleanup

Use the pinned CLI through Node so troubleshooting cannot silently select a
different global version:

```bash
node node_modules/supabase/dist/supabase.js status
node node_modules/supabase/dist/supabase.js stop --project-id pathfindersnotebook --no-backup
docker ps -a --filter "label=com.supabase.cli.project=pathfindersnotebook"
docker logs --tail 100 <matching-container-name-or-id>
```

`status` can print local development keys. Inspect it locally, but never paste
its unredacted output into tickets, CI artifacts, screenshots, or this document.
Supabase CLI `2.109.1` has no local `logs` subcommand, so inspect only the
project-labelled containers with `docker logs`. The gate itself redacts known
local keys and captures the last 100 lines on failure.

The gate attempts cleanup even after failure. If it was interrupted, first run
the project-specific `stop` command above. If the CLI cannot spawn, list
containers with the project label, then remove only the displayed matching
containers with `docker rm -f <id>`. Inspect Docker Desktop volumes and networks
for the same exact `pathfindersnotebook` project label/name and remove only
those leftovers; never use a machine-wide prune or `supabase stop --all` on a
shared development host.

On Windows, `EUNKNOWN: unknown error, uv_spawn` means the pinned CLI process did
not start; it is not evidence that migrations passed. Confirm `node --version`
is `v24.14.1`, `docker version` reaches the engine, restart Docker Desktop, run
`npm ci`, perform the project-specific cleanup above, and retry. If Windows
still returns `uv_spawn`, run the clean-checkout gate in a Docker-capable WSL2
or Linux environment and preserve the failure as an environment risk. The
required protected Ubuntu PR check must still pass; a workaround never permits
staging rollout by itself.

### Updating pinned tooling

Tool updates are deliberate repository changes, never an ad-hoc global install:

1. Choose and test an exact Node release and exact Supabase CLI release against
   this repository and Docker baseline.
2. Change `.nvmrc` for Node. Update the CLI and lockfile with
   `npm install --save-dev --save-exact supabase@<exact-version>` under that Node
   version; do not hand-edit `package-lock.json`.
3. From a clean dependency tree run `npm ci`, verify `node --version` and
   `node node_modules/supabase/dist/supabase.js --version`, then run
   `npm run test:migrations`, `npm test`, `npm run lint`, and
   `npm run typecheck` without a production build.
4. Open a PR and require the Linux `migration-gate` check. Update the documented
   tested versions only after local and protected-PR evidence passes.

## Required CI check and ruleset evidence

The workflow file declares both the job and status check name exactly as
`migration-gate`. Repository administrators must configure the target branch's
active branch-protection rule or repository ruleset to require that exact check
before merge. Workflow YAML proves the check exists; it does **not** prove the
repository enforces it.

MG8/MG10 evidence must record, without tokens or environment dumps:

- repository and protected target branch, active ruleset/protection name and
  stable rule identifier or settings URL;
- enforcement state, bypass actors/teams, and the required-status-check entry
  `migration-gate` (including the GitHub Actions source app when displayed);
- a protected PR URL and successful `migration-gate` run URL/attempt; and
- proof that merge is blocked when that check is absent/failing and allowed only
  after it succeeds.

MG8 is enforced by active repository ruleset `19568157` on
`refs/heads/ftr_base`: it requires the exact `migration-gate` check, has no
bypass actors, and does not alter `main`. Protected-PR execution evidence is
still pending, so MG10 remains incomplete.

## Forward-only migration and release order

Migrations are append-only and must be applied in this exact order:

1. `001_identity_clubs.sql`
2. `002_catalog_versions.sql`
3. `003_enrollment_progress_review.sql`
4. `004_private_evidence.sql`
5. `005_atomic_protected_mutation_audit.sql` — transaction-coupled audit
   triggers for protected tables.
6. `006_evidence_submission_rls.sql` — narrow authenticated upload-quota helper
   and learner-only `attempt_evidence` insert policy.
7. `007_enrollment_catalog_club_tenancy.sql` — rejects enrollment against a
   catalog owned by another club.
8. `008_fix_published_catalog_immutability_trigger.sql` — fixes shared trigger
   row-shape handling and blocks requirement insert/update/delete after publish.
9. `009_grant_authenticated_catalog_progress_privileges.sql` — grants only the
   table operations already constrained by catalog/progress RLS.
10. `010_secure_evidence_workflow_functions.sql` — restores narrow definer
    evidence functions with explicit actor, ownership, and state checks.
11. `011_grant_authenticated_evidence_read_privilege.sql` — exposes evidence
    metadata reads only through existing enrollment-scoped RLS.
12. `012_grant_service_role_provisioning_and_scan_privileges.sql` — adds
    operation-specific disposable provisioning and scanner privileges.
13. `013_complete_service_role_catalog_provisioning_read.sql` — adds the exact
    catalog-version status read needed by publication validation.
14. `014_complete_service_role_catalog_tenancy_read.sql` — adds the exact
    catalog identity/club read needed by the tenancy trigger.
15. `015_enforce_progress_rpc_invariants.sql` — normalizes text/review commands
    and rejects blank required values.
16. `016_official_catalog_templates.sql` — adds additive official-source,
    family, level, section, hierarchy, provenance, and immutability contracts.
17. `017_published_official_metadata_immutability.sql` — closes official
    metadata, related-level, threshold, and source-binding integrity gaps.
18. `018_provision_official_amigo_catalog.sql` — adds authenticated,
    transactional, idempotent official-Amigo provisioning.
19. `019_enforce_official_amigo_canonical_contract.sql` — pins the canonical
    payload fingerprint, validates persisted structure, and keeps audit work
    transactional.
20. `020_guard_text_submission_modes.sql` — rejects direct text submission for
     derived and practical requirements at the authenticated RPC boundary.
21. `021_enroll_official_amigo_student.sql` — adds the transactional,
    idempotent official-Amigo enrollment command.
22. `022_lock_down_direct_enrollment_writes.sql` — removes direct enrollment
    writes and pins controlled enrollment/progress commands.
23. `023_canonical_role_assignments.sql` — introduces time-bounded canonical
    role assignments and scoped authorization helpers.
24. `024_command_authorized_catalog_identity_writes.sql` — adds scoped
    profile, club, student, role, and catalog command boundaries.
25. `025_command_authorized_progress_assessment_writes.sql` — pins protected
    progress, assessment, evidence, and enrollment commands.
26. `026_platform_bootstrap_club_director.sql` — adds the service-role-only
    initial club-director bootstrap command.
27. `027_close_direct_domain_dml.sql` — revokes browser domain-table DML and
    removes permissive write policies after command boundaries exist.
28. `028_atomic_evidence_command_audit.sql` — keeps authorized evidence
    download auditing inside the command transaction.
29. `029_least_privilege_command_owner.sql` — introduces the non-login,
    object-limited command owner.
30. `030_remediate_scoped_command_owner.sql` — captures the request actor and
    completes scoped command-owner remediation.
31. `031_close_residual_privileged_ui_dml.sql` — closes remaining browser DML
    for organizations, units, and evidence-upload rate limits.
32. `032_grant_rls_reader_select_privileges.sql` — restores authenticated
    reader `SELECT` privileges without restoring table DML.
33. `033_member_unit_v2.sql` — adds the v2 club-member, unit, timezone, and
    scoped-reader foundation.
34. `034_member_credential_commands.sql` — adds scoped membership and
    credential commands without storing temporary passwords.
35. `035_v2_backfill_cutover.sql` — reconciles provable legacy data before v2
    readers become authoritative.
36. `036_retire_legacy_authority.sql` — withdraws legacy guardian/evaluator
    authority after reconciliation.
37. `037_member_condition_transition_audit.sql` — records each club-local
    Pathfinder-to-Leader transition once through command-owned evaluation.
38. `038_v2_club_unit_reader_scope.sql` — grants v2-scoped club and unit reads
    under RLS without restoring direct writes.
39. `039_server_credential_resolver_access.sql` — grants credential resolution
    only to the server-side service role.
40. `040_credential_gate_request_actor.sql` — reads the credential-gate actor
    through the hardened request-actor helper.
41. `041_complete_initial_password_change_digest.sql` — qualifies the extension
    digest and preserves Auth bindings across active credential states.

The tracked local chain is `001`–`041`. The last recorded linked-staging
baseline is `001`–`039`; when an authorized operator confirms it, the linked
dry-run must list exactly `040_credential_gate_request_actor.sql` followed by
`041_complete_initial_password_change_digest.sql`. For any other confirmed
linked history, use only its ordered pending suffix and stop on gaps or extras.
Never edit an applied migration to make a correction; append a forward-only
remediation.

The canonical release sequence is:

1. From a clean checkout, pass `npm run test:migrations` and the complementary
   checks. The reset must apply the whole current local chain, not a selected
   migration range.
2. Require and record a successful protected-PR `migration-gate` check; capture
   active branch-protection/ruleset evidence separately from the workflow file.
3. An authorized operator confirms the linked staging history and runs the
   linked dry-run. It must list exactly the pending forward-only suffix—never a
   manually chosen historical range.
4. Apply that suffix only after the dry-run matches the linked history, then
   rerun `migration list --linked` and confirm it equals the tracked chain
   (currently `001`–`041`).
5. Run and record the hosted RLS/RPC, browser, scanner, private Storage, and
   signed-URL checks below. Any failure blocks release and requires a new
   forward-only remediation.

> **Authenticated Supabase environment required — do not run as part of local
> verification.** After MG10, an authorized staging operator may run the
> following from a clean checkout after confirming the project is disposable:

```bash
node node_modules/supabase/dist/supabase.js link --project-ref <staging-project-ref>
node node_modules/supabase/dist/supabase.js migration list --linked
node node_modules/supabase/dist/supabase.js db push --linked --dry-run
node node_modules/supabase/dist/supabase.js db push --linked
node node_modules/supabase/dist/supabase.js migration list --linked
```

Before the push, record the linked history and verify the dry-run lists exactly
the ordered migrations absent from it, with no gaps or extras. Stop if it does
not. Afterward, linked history must equal the full tracked range (currently
`001`–`041`). Do not use `--include-all` to bypass history and do not run the
empty `supabase/seed.sql` with real data.

### Current operational UI and security boundary

The current operational UI uses server-rendered, RLS-scoped reads and
server-action calls to authenticated RPCs; browser clients do not receive domain
table `INSERT`, `UPDATE`, or `DELETE` privileges. Migrations `027` and `031`
close those browser DML surfaces, while `032` grants only the reader `SELECT`
privileges needed by existing RLS policies. The linked-staging command-owner
audit covers the 18 protected commands: they are owned by the non-login
`pathfinders_scoped_command_owner`, are not executable by `anon`, and are not
assumable by application roles. This does not grant `SYSTEM_ADMIN` implicit
evidence access.

The UI deliberately does not provide file-evidence upload/download, role
assignment management, account linking, regional/unit/counselor workflows,
notifications, exports, recovery, or evaluator-assignment views. The staging
checks for the already-existing backend evidence and authorization boundaries do
not imply that those deferred product workflows are available in the UI.

## Staging fixtures and role matrix

Create fixtures through approved staging administration tooling, not by
disabling RLS. Record opaque fixture IDs in a secure test-run note, not in git.

| Fixture | Minimum purpose |
|---|---|
| Club A and Club B | Prove tenant isolation. |
| Linked guardian and linked student in Club A | Prove permitted evidence submission. |
| Different Club A learner and Club B learner | Prove foreign-progress and cross-club denial. |
| Club A instructor and administrator | Prove review/admin paths without learner write access. |
| File-evidence requirement and progress for the linked learner | Exercise upload, scan, submission, review, and signed download. |

Use harmless fixture content such as a small PDF with no personal data. The
allowed MIME types are PDF, JPEG, PNG, and WebP; the maximum is 10 MiB.

## RLS and RPC checklist

Perform each case with a fresh authenticated browser/API session for the named
fixture user. Capture timestamp, actor role, opaque resource IDs, expected
result, observed result, and the returned status/error. Never capture tokens or
signed URLs in the evidence record.

- [ ] A linked guardian can call `prepare_evidence_upload` only for their
  linked learner's file-evidence progress with an allowed MIME type and size.
- [ ] The linked student can perform the same action for their own progress.
- [ ] An unrelated Club A learner cannot prepare evidence for another learner's
  progress.
- [ ] A Club B user cannot read or submit against Club A student, enrollment,
  progress, evidence, or attempt IDs.
- [ ] An instructor and administrator cannot create learner-owned evidence or
  `attempt_evidence` links merely by knowing their IDs.
- [ ] Direct insert/update/delete attempts against
  `evidence_upload_rate_limits` fail for authenticated users; the only allowed
  mutation route is the RPC's self-scoped quota helper.
- [ ] A submission link fails unless the evidence is owned by the caller,
  belongs to the same progress, is `clean`, is not deleted, and the attempt is
  pending.
- [ ] Verify upload quota behavior: attempts 1–20 in a rolling active hour are
  accepted when all other checks pass; attempt 21 is rejected. Repeat after the
  configured window has elapsed using disposable fixtures.

Do not relax RLS, add a `FOR ALL` policy, impersonate a user with a service
role, or manually alter a rate-limit row to make these checks pass.

## Private Storage and signed-download checklist

- [ ] Confirm the `evidence` bucket is private, keeps the 10 MiB limit, and
  permits only PDF/JPEG/PNG/WebP.
- [ ] Upload only after `prepare_evidence_upload` returns an opaque object path;
  an arbitrary path or expired pending-upload record must fail.
- [ ] Confirm `pending_scan`, `quarantined`, and `deleted` evidence cannot be
  delivered or attached to a submission. Mark only the harmless fixture object
  `clean` through the approved staging scanner/admin process before the positive
  delivery check.
- [ ] As an authorized viewer, request `/api/files/<evidence-id>` and confirm it
  redirects to a signed URL only after `authorized_evidence_download` permits
  access.
- [ ] Open the signed URL before expiry, then retry the **same captured URL**
  after more than five minutes. The latter must fail. Do not persist the URL in
  logs, tickets, screenshots, or source control.
- [ ] Repeat the route request as a foreign Club A user and Club B user; both
  must receive the generic denial response and no object content.

## Audit-trigger checklist

For one protected staging mutation (for example a requirement-progress state
change), record the fixture resource ID and query the staging audit viewer or
approved operator interface:

- [ ] Exactly one trigger-created `protected_mutation.*` audit row is present
  in the same transaction context with actor and time.
- [ ] A manual completion retains `prior_status` and `manual_rationale` in the
  audit metadata.
- [ ] A mutation whose audit insert is made to fail in an isolated disposable
  test transaction rolls back; do not perform this fault injection in a shared
  or production environment.
- [ ] Membership, catalog, enrollment, progress, assessment, investiture, and
  evidence fixtures each produce protected-mutation audit rows when exercised.

## Browser workflow smoke checks

Use the application's `/login` route and a disposable staging account to
establish the Supabase Auth session before opening protected routes. The checks
below validate actual browser/session behavior, while the RPC matrix above
validates the server-side workflows.

- [ ] An anonymous browser is rejected from `/dashboard` and protected student
  routes.
- [ ] A signed-in Club A fixture user can open `/dashboard` and their permitted
  `/students/<id>` route.
- [ ] The same user receives not-found/denial behavior for a Club B student ID;
  the page must not reveal Club B data.
- [ ] The authorized evidence-download route redirects only for the allowed
  session and only for clean, undeleted evidence.
- [ ] Repeat the denied-route checks in a separate browser profile to avoid
  cross-account cookies masking an isolation failure.

## Official Amigo staging acceptance (AC8 only)

> **Authorized staging operation required — do not execute during local AC7
> verification.** Complete this only after the full current staging migration
> history (currently `001`–`041`) and the preceding release gates pass.

- [ ] An authorized Club A administrator provisions the canonical regular
  Amigo snapshot once; retrying returns the same published catalog/version and
  creates neither duplicate sections nor requirements.
- [ ] A Club B administrator provisions the same snapshot and receives a
  distinct club-owned published catalog/version with the same official source
  keys. Record only opaque IDs in the secure test-run note.
- [ ] An enrolled disposable learner sees the nine ordered sections, the
  25-root denominator, nested child context, and root-only percentage changes.
- [ ] A compound/derived Amigo root and a practical requirement reject direct
  text submission in the browser and RPC; the pre-existing `STG Amigo Text
  Workflow` still submits, is reviewed, and reports progress.
- [ ] Record the authorized operator, timestamp, redacted browser results, and
  migration history. Do not provision advanced Amigo data, real people, or
  production-like evidence.

## Vercel staging boundary

> **Authenticated Vercel environment required — do not execute from this
> validation package.** An authorized operator may link the staging project,
> configure the two non-secret values above for Preview/custom staging, and
> create a preview deployment through the team's normal approval flow. Commands
> such as `vercel login`, `vercel link`, `vercel pull`, and `vercel deploy .
> --target preview` authenticate and can change remote state; they are
> intentionally not run here. Never use `vercel --prod` for this checklist.

## Completion record and release gate

Attach a redacted checklist result showing every positive and negative role
case, migration history, signed-URL expiry timing, and audit observations. A
failed or unexecuted live check is a release blocker, not a reason to weaken
RLS, Storage policies, audit triggers, or signed-URL expiry.

Local checks remain credential-free and may be run independently:

```bash
npm test
npm run lint
npm run typecheck
npm run test:migrations
git diff --check
```

The credential-free local/CI gate is the pre-merge quality gate; the authenticated
hosted checklist is the post-MG10 staging release gate. Neither substitutes for
the other, and both must pass before release.

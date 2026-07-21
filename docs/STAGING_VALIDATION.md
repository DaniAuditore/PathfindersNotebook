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

## Migration gate

Migrations are append-only and must be applied in this exact order:

1. `001_identity_clubs.sql`
2. `002_catalog_versions.sql`
3. `003_enrollment_progress_review.sql`
4. `004_private_evidence.sql`
5. `005_atomic_protected_mutation_audit.sql` — database-transaction audit
   triggers for protected tables.
6. `006_evidence_submission_rls.sql` — narrow authenticated upload-quota
   helper and learner-only `attempt_evidence` insert policy.

> **Authenticated Supabase environment required — do not run as part of local
> verification.** An authorized staging operator may run the following from a
> clean checkout after confirming the project reference is disposable:

```bash
supabase link --project-ref <staging-project-ref>
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

Before the push, the dry-run output must show only the unapplied ordered local
migrations. After it, the linked migration list must show `001` through `006`
as applied. Do not use `--include-all` to bypass migration history, and do not
run the empty `supabase/seed.sql` with real data.

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

The current application has no sign-in screen; establish the disposable
Supabase Auth session through the approved staging authentication flow before
opening protected routes. The checks below validate actual browser/session
behavior, while the RPC matrix above validates the server-side workflows.

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
git diff --check
```

These commands do not substitute for the authenticated staging evidence above.

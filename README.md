# Pathfinder's Notebook

Club progress management for Conquistadores, built as a Next.js TypeScript
modular monolith with Supabase adapters.

## Local development

1. Use the exact Node version in `.nvmrc` (`v24.14.1`) and run `npm ci`. The
   lockfile installs the repository-local Supabase CLI `2.109.1`; do not replace
   it with a global or floating `npx` version.
2. Copy `.env.example` to `.env.local` and provide only the publishable Supabase
   project values. Do not place service-role credentials in browser variables.
3. Run `npm run dev`.

## Executable migration gate

Prerequisites are Node `v24.14.1`, the dependencies installed by `npm ci`, and
Docker Engine/Desktop running with enough resources for the local Supabase
stack. Docker Engine `29.2.1` is the tested baseline. No Supabase login, linked
project, remote credential, seed, or real fixture ID is required.

The canonical credential-free command is:

```bash
npm run test:migrations
```

It starts a local stack, resets from zero through every tracked migration
(currently `001`–`041`), runs authenticated pgTAP and local Auth/Storage API
checks, and stops the stack without retaining its database. The gate discovers
the migration chain at reset time; do not replace the range above with a
hard-coded endpoint. `npm test` remains complementary fast coverage; it does
not replace this gate. See
[the staging validation checklist](docs/STAGING_VALIDATION.md) for status/log
troubleshooting, Windows `uv_spawn`, pinned-tool updates, CI enforcement, and
the separate hosted release gate.

## Supabase deployment and safeguarding operations

1. The tracked migration chain is forward-only and currently spans
   `001`–`041`. The last recorded linked-staging baseline is `001`–`039`; if
   an authorized operator confirms that baseline, its linked dry-run must list
   exactly `040_credential_gate_request_actor.sql` then
   `041_complete_initial_password_change_digest.sql`. Otherwise, derive the
   pending suffix from the current linked history and stop on any mismatch.
   Before any future staging push, pass the clean-checkout local gate
   and the required protected-PR CI status `migration-gate`; workflow YAML
   alone is not branch-protection/ruleset evidence.
2. An authorized operator must first compare linked history, then run a linked
   dry-run and apply only the exact pending suffix in filename order. After the
   push, linked history must match the full tracked chain. Record the hosted
   RLS/RPC, browser, scanner, private Storage, and signed-URL smoke checks.
   Official Amigo provisioning and human browser acceptance are separate
   authorized staging gates; local commands do not perform them. Hosted
   validation supplements the local/CI gate; neither substitutes for the other.
   Follow
   [the staging validation checklist](docs/STAGING_VALIDATION.md) for the exact
   order and evidence requirements. Never edit an applied migration.
3. Keep Supabase access tokens, database passwords, and service-role keys only
   in approved server-side secret stores; none belongs in `.env.local`, a
   `NEXT_PUBLIC_*` variable, documentation, screenshots, or fixtures.
4. `supabase/seed.sql` is intentionally empty. Add only non-production fixture
   data for local development; do not seed real children, guardian contact data,
   or uploaded evidence.
5. Confirm the `evidence` bucket remains private, permitted MIME types and the
   10 MiB limit are retained, and downloads are issued only by the authorized
   five-minute signed URL handler. Never replace it with public URLs.
6. The default evidence retention is 24 months after class closure. Before
   deletion, an administrator must check retention expiry and legal holds; the
   deletion workflow preserves non-sensitive audit metadata.
7. Before inviting minors or guardians, obtain and record the club's required
   safeguarding/guardian consent, restrict membership to authorized adults,
   review assigned roles, and establish the local incident/escalation contact.
   This repository does not determine the applicable local safeguarding law.

## Quality commands

- `npm run test:migrations` — canonical executable migration gate
- `npm test` — complementary fast contracts
- `npm run lint`
- `npm run typecheck`

The codebase separates each business module into domain, application,
infrastructure, and presentation layers. Domain/application code is deliberately
independent from Next.js and Supabase. Local Supabase configuration and ordered
SQL migrations are stored under `supabase/`.

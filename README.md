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

It starts a local stack, resets from zero through the current migration `020`,
runs authenticated pgTAP and local Auth/Storage API checks, and stops the stack
without retaining its database. `npm test` remains complementary fast coverage;
it does not replace this gate. See
[the staging validation checklist](docs/STAGING_VALIDATION.md) for status/log
troubleshooting, Windows `uv_spawn`, pinned-tool updates, CI enforcement, and
the separate hosted release gate.

## Supabase deployment and safeguarding operations

1. Staging currently has only migrations `001`–`007`. Migrations `008`–`020`
   are forward-only and MUST NOT be applied to staging until MG10 records a
   successful clean-checkout local gate and protected-PR CI run. The required
   CI status name is exactly `migration-gate`; workflow YAML alone is not
   branch-protection/ruleset evidence.
2. After MG10, an authorized operator must apply pending migrations `008`
   through `020` in filename order to disposable staging, then record the
   hosted RLS/RPC, browser, scanner, private Storage, and signed-URL smoke
   checks. Official Amigo provisioning and human browser acceptance are a
   separate authorized staging gate; local commands do not perform them. Hosted
   validation supplements the local/CI gate; neither substitutes
   for the other. Follow
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

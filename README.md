# Pathfinder's Notebook

Club progress management for Conquistadores, built as a Next.js TypeScript
modular monolith with Supabase adapters.

## Local development

1. Copy `.env.example` to `.env.local` and provide the publishable Supabase
   project values. Do not place service-role credentials in browser variables.
2. Run `npm install`.
3. Run `npm run dev`.

## Supabase deployment and safeguarding operations

1. Install the Supabase CLI in the deployment environment, authenticate there,
   and link the intended project. Keep its access token and any service-role key
   in server-side CI/deployment secrets only; neither belongs in `.env.local` or
   a `NEXT_PUBLIC_*` variable.
2. Apply the ordered migrations in `supabase/migrations/` (`001` through `006`,
   including the mandatory audit trigger in `005` and evidence-write RLS policy
   in `006`) with the Supabase migration command for the target project. Apply
   them to a disposable/staging project first and verify RLS as every
   application role. See [the staging validation checklist](docs/STAGING_VALIDATION.md)
   for the required order, non-secret configuration, and release evidence.
3. `supabase/seed.sql` is intentionally empty. Add only non-production fixture
   data for local development; do not seed real children, guardian contact data,
   or uploaded evidence.
4. Confirm the `evidence` bucket remains private, permitted MIME types and the
   10 MiB limit are retained, and downloads are issued only by the authorized
   five-minute signed URL handler. Never replace it with public URLs.
5. The default evidence retention is 24 months after class closure. Before
   deletion, an administrator must check retention expiry and legal holds; the
   deletion workflow preserves non-sensitive audit metadata.
6. Before inviting minors or guardians, obtain and record the club's required
   safeguarding/guardian consent, restrict membership to authorized adults,
   review assigned roles, and establish the local incident/escalation contact.
   This repository does not determine the applicable local safeguarding law.

## Quality commands

- `npm run lint`
- `npm run typecheck`
- `npm test`

The codebase separates each business module into domain, application,
infrastructure, and presentation layers. Domain/application code is deliberately
independent from Next.js and Supabase. Local Supabase configuration and ordered
SQL migrations are stored under `supabase/`.

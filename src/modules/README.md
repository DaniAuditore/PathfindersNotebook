# Module boundaries

Each business module is split into `domain`, `application`, `infrastructure`, and
`presentation` folders.

- `domain` contains pure entities, value objects, and policies.
- `application` contains use cases and ports.
- `infrastructure` implements ports (for example, Supabase adapters).
- `presentation` adapts UI and server-action input to application use cases.

Dependencies flow inward. Domain and application must not import Next.js,
Supabase, or other delivery/infrastructure concerns. Cross-module collaboration
must use an application facade rather than another module's persistence model.

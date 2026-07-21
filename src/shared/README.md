# Shared boundaries

`shared` contains cross-cutting technical utilities only: authentication,
validation, observability, and database/Supabase client setup. It must not own
business rules that belong to a module domain or application layer.

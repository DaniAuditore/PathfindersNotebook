import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const localActors = {
  director: { email: "e2e-director@local.test", password: "local-e2e-fixture-password" },
  instructor: { email: "e2e-instructor@local.test", password: "local-e2e-fixture-password" },
} as const;

const clubId = "91000000-0000-0000-0000-000000000001";
const studentId = "92000000-0000-0000-0000-000000000001";
const catalogId = "93000000-0000-0000-0000-000000000001";
const catalogVersionId = "94000000-0000-0000-0000-000000000001";
const enrollmentId = "95000000-0000-0000-0000-000000000001";
let ready: Promise<void> | undefined;

function localEnvironment() {
  const cli = join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
  const output = execFileSync(process.execPath, [cli, "status", "-o", "env"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const values = new Map(output.split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [[line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
  const apiUrl = values.get("API_URL");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  if (!apiUrl || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(apiUrl)) throw new Error("Authenticated E2E fixtures require local Supabase only.");
  return { apiUrl, serviceRoleKey };
}

async function userId(client: SupabaseClient, email: string, password: string) {
  const { data: listed, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (listError) throw listError;
  const existing = listed.users.find((user) => user.email === email);
  if (existing) {
    const { error } = await client.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Local fixture user was not created.");
  return data.user.id;
}

async function install() {
  const { apiUrl, serviceRoleKey } = localEnvironment();
  const service = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [directorId, instructorId] = await Promise.all([
    userId(service, localActors.director.email, localActors.director.password),
    userId(service, localActors.instructor.email, localActors.instructor.password),
  ]);
  installDatabaseRows(directorId, instructorId);
}

function installDatabaseRows(directorId: string, instructorId: string) {
  if (![directorId, instructorId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new Error("Local Auth returned an invalid fixture ID.");
  const auditRows = Array.from({ length: 26 }, (_, index) => `
    ('${clubId}', '${directorId}', 'acción-local-${index + 1}', 'inscripción', '${enrollmentId}', '{"email":"never-render@example.test","token":"not-rendered"}', '2026-01-01T00:00:${String(index).padStart(2, "0")}Z')`).join(",");
  // The local test database intentionally closes service_role table DML. Fixture
  // rows therefore use only the local Postgres container, never an HTTP role or
  // deployed connection. Application mutations still use authenticated RPCs.
  const sql = `
    begin;
    insert into public.profiles (user_id, display_name) values ('${directorId}', 'Directora local E2E'), ('${instructorId}', 'Instructor local E2E') on conflict (user_id) do update set display_name = excluded.display_name;
    insert into public.clubs (id, name) values ('${clubId}', 'Club local E2E') on conflict (id) do update set name = excluded.name;
    insert into public.memberships (club_id, user_id, role) values ('${clubId}', '${directorId}', 'admin'), ('${clubId}', '${instructorId}', 'instructor') on conflict (club_id, user_id) do update set role = excluded.role;
    delete from public.role_assignments where user_id in ('${directorId}', '${instructorId}');
    insert into public.role_assignments (user_id, role, club_id) values ('${directorId}', 'CLUB_DIRECTOR', '${clubId}'), ('${instructorId}', 'INSTRUCTOR', '${clubId}');
    insert into public.students (id, club_id, display_name) values ('${studentId}', '${clubId}', 'Alumno local E2E') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.catalogs (id, club_id, class_type, title) values ('${catalogId}', '${clubId}', 'regular', 'Catálogo local E2E') on conflict (id) do update set title = excluded.title;
    insert into public.catalog_versions (id, catalog_id, version_number, status, published_at) values ('${catalogVersionId}', '${catalogId}', 1, 'published', '2026-01-01T00:00:00Z') on conflict (id) do nothing;
    insert into public.enrollments (id, club_id, student_id, catalog_id, catalog_version_id, school_year, enrolled_by) values ('${enrollmentId}', '${clubId}', '${studentId}', '${catalogId}', '${catalogVersionId}', 2026, '${directorId}') on conflict (id) do nothing;
    insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata, created_at) select v.club_id::uuid, v.actor_id::uuid, v.action, v.entity_type, v.entity_id::uuid, v.metadata::jsonb, v.created_at::timestamptz from (values ${auditRows}) as v(club_id, actor_id, action, entity_type, entity_id, metadata, created_at) where not exists (select 1 from public.audit_log where action = v.action and club_id = v.club_id::uuid);
    commit;`;
  const containers = execFileSync("docker", ["ps", "-q", "--filter", "label=com.supabase.cli.project=pathfindersnotebook"], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
  for (const container of containers) {
    try {
      execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "ignore"] });
      return;
    } catch {
      // Only the local database container has psql; ignore the API/Auth peers.
    }
  }
  throw new Error("The local Supabase Postgres container was not available for E2E fixtures.");
}

export function installLocalAuthFixtures() {
  ready ??= install();
  return ready;
}

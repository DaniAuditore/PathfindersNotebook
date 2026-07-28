import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf8");

describe("Supabase migration security contracts", () => {
  it("preserves immutable published catalog versions and audit records", () => {
    const catalog = migration("002_catalog_versions.sql");
    const remediation = migration("008_fix_published_catalog_immutability_trigger.sql");
    const identity = migration("001_identity_clubs.sql");
    expect(catalog).toContain("published catalog versions are immutable; create a new version");
    expect(catalog).toContain("requirements of published catalog versions are immutable; create a new version");
    expect(remediation).toContain("if (to_jsonb(old) ->> 'status') = 'published' then");
    expect(remediation).toContain("before insert or update or delete on public.requirements");
    expect(identity).toContain("audit_log_immutable before update or delete");
    expect(identity).toContain('create policy "authorized actors read audit log"');
  });

  it("handles catalog-version and requirement trigger row shapes without unavailable fields", () => {
    const remediation = migration("008_fix_published_catalog_immutability_trigger.sql");

    expect(remediation).toContain("mutation_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end");
    expect(remediation).toContain("affected_version_id := nullif(mutation_row ->> 'catalog_version_id', '')::uuid");
    expect(remediation).not.toMatch(/\b(?:new|old)\.catalog_version_id\b/i);
    expect(remediation).not.toContain("security definer");
  });

  it("declares RLS barriers for cross-club data and private storage", () => {
    const identity = migration("001_identity_clubs.sql");
    const enrollment = migration("003_enrollment_progress_review.sql");
    const evidence = migration("004_private_evidence.sql");
    expect(identity).toContain("alter table public.students enable row level security");
    expect(enrollment).toContain("alter table public.enrollments enable row level security");
    expect(enrollment).toContain("public.can_access_enrollment(id)");
    expect(evidence).toContain("values ('evidence', 'evidence', false");
    expect(evidence).toContain('create policy "scoped users read private evidence"');
    expect(evidence).toContain("evidence.scan_status = 'clean'");
  });

  it("covers every application role in the declared RLS contracts", () => {
    const identity = migration("001_identity_clubs.sql");
    const enrollment = migration("003_enrollment_progress_review.sql");

    expect(identity).toContain("array['admin', 'instructor', 'viewer']::public.club_role[]");
    expect(identity).toContain("guardian_user_id = auth.uid()");
    expect(identity).toContain("student_user_id = auth.uid()");
    expect(enrollment).toContain("array['admin', 'instructor']::public.club_role[]");
    expect(enrollment).toContain("array['admin']::public.club_role[]");
  });

  it("requires an authorized, clean-evidence delivery path", () => {
    const evidence = migration("004_private_evidence.sql");
    expect(evidence).toContain("create function public.authorized_evidence_download");
    expect(evidence).toContain("public.can_access_enrollment(p.enrollment_id)");
    expect(evidence).toContain("evidence.deleted_at is null");
    expect(evidence).not.toContain("public = true");
  });

  it("preserves an enrolled catalog version when a later version is published", () => {
    const enrollment = migration("003_enrollment_progress_review.sql");
    const catalog = migration("002_catalog_versions.sql");

    expect(enrollment).toContain("enrollments must pin a published version of their catalog");
    expect(enrollment).toContain("enrollment version is immutable; use an audited migration");
    expect(catalog).toContain("published catalog versions are immutable; create a new version");
  });

  it("allows enrollment only when its catalog belongs to the same club", () => {
    const tenancy = migration("007_enrollment_catalog_club_tenancy.sql");

    expect(tenancy).toContain("create function public.enforce_enrollment_catalog_club()");
    expect(tenancy).toContain("catalog.id = new.catalog_id");
    expect(tenancy).toContain("catalog.club_id = new.club_id");
    expect(tenancy).toContain("before insert or update of club_id, catalog_id on public.enrollments");
  });

  it("rejects cross-club catalog enrollment without bypassing RLS", () => {
    const tenancy = migration("007_enrollment_catalog_club_tenancy.sql");

    expect(tenancy).toContain("enrollment catalog must belong to the enrollment club");
    expect(tenancy).toContain("using errcode = '23514'");
    expect(tenancy).not.toContain("security definer");
  });

  it("rejects a text-only submission when a requirement requires file evidence", () => {
    const evidence = migration("004_private_evidence.sql");

    expect(evidence).toContain("target_requirement.requires_evidence and coalesce(array_length(evidence_ids_input, 1), 0) = 0");
    expect(evidence).toContain("this requirement requires clean evidence");
  });

  it("enforces UX submission and rejection invariants in the forward-only RPC boundary", () => {
    const remediation = migration("015_enforce_progress_rpc_invariants.sql");

    expect(remediation).toContain("regexp_replace(submission_text_input, '^[[:space:]]+|[[:space:]]+$', '', 'g')");
    expect(remediation).toContain("regexp_replace(reason_input, '^[[:space:]]+|[[:space:]]+$', '', 'g')");
    expect(remediation).toContain("not target_requirement.requires_evidence and normalized_submission_text is null");
    expect(remediation).toContain("raise exception 'submission text is required'");
    expect(remediation).toContain("decision_input = 'rejected' and normalized_reason is null");
    expect(remediation).toContain("raise exception 'a rejection reason is required'");
  });

  it("blocks derived and practical requirements at the authenticated submission RPC while preserving evidence delivery", () => {
    const guard = migration("020_guard_text_submission_modes.sql");

    expect(guard).toContain("target_requirement.progress_mode = 'derived'");
    expect(guard).toContain("target_requirement.completion_semantics in ('all_children', 'at_least_one', 'at_least_n')");
    expect(guard).toContain("array['practical_in_person']::text[]");
    expect(guard).toContain("this requirement cannot be submitted as text");
    expect(guard).toContain("this requirement requires clean evidence");
    expect(guard).toContain("insert into public.attempt_evidence");
  });

  it("relies on transactional database audits instead of post-commit action audits", () => {
    const actions = readFileSync(resolve(process.cwd(), "src", "modules", "review", "presentation", "actions.ts"), "utf8");
    const facade = readFileSync(resolve(process.cwd(), "src", "modules", "review", "infrastructure", "supabase-review-facade.ts"), "utf8");

    expect(actions).not.toContain("writeActionLog");
    expect(facade.indexOf('.from("requirement_progress")')).toBeLessThan(facade.indexOf('supabase.rpc("submit_progress_attempt"'));
  });

  it("issues private evidence delivery only through the configured five-minute window", () => {
    const route = readFileSync(resolve(process.cwd(), "src", "app", "api", "files", "[evidenceId]", "route.ts"), "utf8");
    const evidenceDomain = readFileSync(resolve(process.cwd(), "src", "modules", "evidence", "domain", "evidence.ts"), "utf8");
    const evidenceMigration = migration("004_private_evidence.sql");

    expect(evidenceDomain).toContain("EVIDENCE_DOWNLOAD_TTL_SECONDS = 5 * 60");
    expect(evidenceMigration).toContain("create function public.authorized_evidence_download");
    expect(evidenceMigration).toContain("evidence.scan_status = 'clean'");
    expect(route).toContain("createSignedUrl(evidence.objectPath, EVIDENCE_DOWNLOAD_TTL_SECONDS)");
    expect(route).not.toContain("writeActionLog");
  });

  it("keeps evidence audits inside authorized database commands after direct audit DML closure", () => {
    const evidenceActions = readFileSync(resolve(process.cwd(), "src", "modules", "evidence", "presentation", "actions.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src", "app", "api", "files", "[evidenceId]", "route.ts"), "utf8");
    const evidenceAudit = migration("028_atomic_evidence_command_audit.sql");

    expect(evidenceActions).not.toContain("writeActionLog");
    expect(route).not.toContain("writeActionLog");
    expect(evidenceAudit).toContain("insert into public.audit_log");
    expect(evidenceAudit).toContain("evidence.download_authorized");
    expect(evidenceAudit).toContain("security definer");
    expect(evidenceAudit).toContain("from public, anon");
    expect(evidenceAudit).toContain("to authenticated");
  });

  it("writes protected-mutation audits atomically and retains manual-completion context", () => {
    const audit = migration("005_atomic_protected_mutation_audit.sql");

    expect(audit).toContain("returns trigger");
    expect(audit).toContain("security definer");
    expect(audit).toContain("insert into public.audit_log");
    expect(audit).toContain("requirement_progress_audit_protected_mutation");
    expect(audit).toContain("'prior_status'");
    expect(audit).toContain("'manual_rationale'");
    for (const table of ["memberships", "students", "catalogs", "catalog_versions", "requirements", "enrollments", "requirement_progress", "progress_attempts", "progress_reviews", "assessments", "investitures", "evidence"]) {
      expect(audit).toContain(`${table}_audit_protected_mutation after insert or update or delete on public.${table}`);
    }
  });

  it("keeps PL/pgSQL record targets out of multi-item INTO lists", () => {
    for (const name of ["003_enrollment_progress_review.sql", "004_private_evidence.sql"]) {
      const sql = migration(name);

      expect(sql).not.toMatch(/select\s+(?:[a-z_]\w*|[a-z_]\w*\.\*)\s*,[^;]*\binto\s+target_(?:progress|requirement)\s*,/i);
    }
  });

  it("permits only an enrolled submitter to write evidence upload and submission records", () => {
    const evidence = migration("004_private_evidence.sql");
    const remediation = migration("006_evidence_submission_rls.sql");
    const evidenceAction = readFileSync(resolve(process.cwd(), "src", "modules", "evidence", "presentation", "actions.ts"), "utf8");
    const submissionAction = readFileSync(resolve(process.cwd(), "src", "modules", "review", "presentation", "actions.ts"), "utf8");

    expect(remediation).toContain("create function public.consume_evidence_upload_rate_limit()");
    expect(remediation).toContain("security definer");
    expect(remediation).toContain("if auth.uid() is null then");
    expect(remediation).toContain("next_count := public.consume_evidence_upload_rate_limit()");
    expect(remediation).toContain('create policy "linked users attach own clean evidence to own attempts"');
    expect(remediation).toContain("attempt.submitted_by = auth.uid()");
    expect(remediation).toContain("evidence.uploaded_by = auth.uid()");
    expect(remediation).toContain("evidence.progress_id = attempt.progress_id");
    expect(remediation).toContain("public.can_submit_evidence(attempt.progress_id)");
    expect(remediation).toContain("evidence.scan_status = 'clean'");
    expect(remediation).not.toContain("for all");
    expect(evidence).toContain("public.can_submit_evidence(target_progress_id)");
    expect(evidenceAction).toContain("uploadSchema.parse(input)");
    expect(submissionAction).toContain("submissionSchema.parse(input)");
  });

  it("adds only canonical, scoped role authority and keeps viewers retired", () => {
    const canonical = migration("023_canonical_role_assignments.sql");
    expect(canonical).toContain("create type public.canonical_role as enum");
    for (const role of ["SYSTEM_ADMIN", "CLUB_DIRECTOR", "INSTRUCTOR", "COUNSELOR", "PATHFINDER", "GUARDIAN", "EVALUATOR"]) expect(canonical).toContain(`'${role}'`);
    expect(canonical).toContain("case when m.role = 'viewer' then 'retired'");
    expect(canonical).toContain("case m.role when 'admin' then 'CLUB_DIRECTOR'");
    expect(canonical).toContain("create or replace function public.can_access_evidence");
    expect(canonical).not.toContain("SYSTEM_ADMIN'::public.canonical_role end");
  });

  it("moves browser write callers to RPC commands before the revoke migration", () => {
    const catalog = readFileSync(resolve(process.cwd(), "src", "modules", "catalog", "infrastructure", "supabase-catalog-facade.ts"), "utf8");
    const enrollment = readFileSync(resolve(process.cwd(), "src", "modules", "enrollment", "infrastructure", "supabase-enrollment-facade.ts"), "utf8");
    const commands = migration("025_command_authorized_progress_assessment_writes.sql");
    expect(catalog).toContain('supabase.rpc("publish_catalog_draft"');
    expect(catalog).not.toContain('.from("catalogs")\n      .insert');
    expect(enrollment).toContain('supabase.rpc("enroll_student"');
    expect(enrollment).not.toContain('.from("enrollments")');
    expect(commands).toContain("security definer set search_path = public, pg_temp");
    expect(commands).toContain("public.can_access_evidence(ev.id)");
  });

  it("discovers operational clubs from active canonical director assignments without legacy-admin fallback", () => {
    const provisioningReader = readFileSync(resolve(process.cwd(), "src", "modules", "catalog", "infrastructure", "supabase-official-provisioning-reader.ts"), "utf8");
    const enrollmentReader = readFileSync(resolve(process.cwd(), "src", "modules", "enrollment", "infrastructure", "supabase-official-amigo-enrollment.ts"), "utf8");

    for (const reader of [provisioningReader, enrollmentReader]) {
      expect(reader).toContain('.from("role_assignments")');
      expect(reader).toContain('.eq("role", "CLUB_DIRECTOR")');
      expect(reader).toContain('.is("revoked_at", null)');
      expect(reader).not.toContain('.from("memberships")');
      expect(reader).not.toContain('.eq("role", "admin")');
    }
  });

  it("closes every direct domain DML path and anonymous canonical/operational execution", () => {
    const closure = migration("027_close_direct_domain_dml.sql");

    for (const table of ["catalogs", "catalog_versions", "catalog_sections", "requirements", "profiles", "clubs", "memberships", "students", "role_assignments", "enrollments", "requirement_progress", "progress_attempts", "progress_reviews", "assessments", "investitures", "evidence", "attempt_evidence", "audit_log"]) {
      expect(closure).toContain(`public.${table}`);
    }
    expect(closure).toContain("from authenticated, anon");
    expect(closure).toContain("and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')");
    for (const signature of ["has_canonical_role_at_club", "has_canonical_role_in_unit", "has_student_link", "can_review_progress", "can_access_evidence", "provision_official_amigo_catalog", "migrate_enrollment_version"]) {
      expect(closure).toContain(signature);
    }
    expect(closure).toContain("No operational/canonical RPC intentionally");
    expect(closure).toContain("set search_path = public, pg_temp");
  });

  it("moves scoped command ownership to a non-login, object-limited role", () => {
    const owner = migration("029_least_privilege_command_owner.sql");
    const remediation = migration("030_remediate_scoped_command_owner.sql");

    expect(owner).toContain("create role pathfinders_scoped_command_owner nologin noinherit nosuperuser nocreatedb nocreaterole bypassrls");
    expect(owner).toContain("revoke all privileges on all tables in schema public from pathfinders_scoped_command_owner");
    expect(owner).toContain("grant insert on public.progress_reviews, public.investitures, public.audit_log to pathfinders_scoped_command_owner");
    for (const command of ["update_own_profile", "assign_role", "publish_catalog_draft"]) {
      expect(owner).toContain(`alter function public.${command}`);
      expect(owner).toContain("owner to pathfinders_scoped_command_owner");
    }

    expect(remediation).toContain("pathfinders_scoped_command_owner must be NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and BYPASSRLS");
    expect(remediation).toContain("create or replace function public.request_actor_id()");
    expect(remediation).toContain("current_setting('request.jwt.claim.sub', true)");
    expect(remediation).toContain("exception when sqlstate '22P02'");
    expect(remediation).not.toContain("grant usage on schema auth to pathfinders_scoped_command_owner");
    expect(remediation).not.toContain("grant execute on function auth.uid(), auth.jwt() to pathfinders_scoped_command_owner");
    expect(remediation).toContain("grant select, insert on public.attempt_evidence to pathfinders_scoped_command_owner");
    expect(remediation).toContain("postgres to retain its administrative SET ROLE membership");
    expect(remediation).toContain("no application-capable role may be a member of this role");
    for (const command of ["update_own_profile", "update_club", "create_or_update_student", "assign_role", "revoke_role", "publish_catalog_draft", "submit_progress_attempt", "review_progress_attempt", "reverse_progress_acceptance", "manually_complete_progress", "record_investiture", "prepare_evidence_upload", "finalize_evidence_deletion", "prepare_evidence_deletion", "set_evidence_legal_hold", "enroll_student", "record_assessment", "authorized_evidence_download"]) {
      expect(remediation).toContain(`alter function public.${command}`);
    }
    expect(remediation).toContain("from public, anon");
    expect(remediation).toContain("to authenticated");
    expect(remediation).toContain("set search_path = public, pg_temp");
    expect(remediation).toContain("Capture the request actor at every command boundary");
    expect(remediation).toContain("public.actor_can_submit_progress(request_actor_id,");
    expect(remediation).not.toContain("grant usage on schema auth to pathfinders_scoped_command_owner");
  });

  it("closes residual privileged-UI table DML without inventing organization or unit commands", () => {
    const closure = migration("031_close_residual_privileged_ui_dml.sql");
    const evidenceFacade = readFileSync(resolve(process.cwd(), "src", "modules", "evidence", "infrastructure", "supabase-evidence-facade.ts"), "utf8");

    for (const table of ["organizations", "units", "evidence_upload_rate_limits"]) {
      expect(closure).toContain(`public.${table}`);
    }
    expect(closure).toContain("from public, authenticated, anon");
    expect(closure).toContain("and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')");
    expect(closure).toContain("prepare_evidence_upload");
    expect(closure).not.toContain("create function public.create_organization");
    expect(closure).not.toContain("create function public.create_unit");
    expect(evidenceFacade).toContain('supabase.rpc("prepare_evidence_upload"');
  });
});

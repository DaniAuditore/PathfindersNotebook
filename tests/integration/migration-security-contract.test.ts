import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf8");

describe("Supabase migration security contracts", () => {
  it("preserves immutable published catalog versions and audit records", () => {
    const catalog = migration("002_catalog_versions.sql");
    const identity = migration("001_identity_clubs.sql");
    expect(catalog).toContain("published catalog versions are immutable; create a new version");
    expect(catalog).toContain("requirements of published catalog versions are immutable; create a new version");
    expect(identity).toContain("audit_log_immutable before update or delete");
    expect(identity).toContain('create policy "authorized actors read audit log"');
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

  it("rejects a text-only submission when a requirement requires file evidence", () => {
    const evidence = migration("004_private_evidence.sql");

    expect(evidence).toContain("target_requirement.requires_evidence and coalesce(array_length(evidence_ids_input, 1), 0) = 0");
    expect(evidence).toContain("this requirement requires clean evidence");
  });

  it("issues private evidence delivery only through the configured five-minute window", () => {
    const route = readFileSync(resolve(process.cwd(), "src", "app", "api", "files", "[evidenceId]", "route.ts"), "utf8");
    const evidenceDomain = readFileSync(resolve(process.cwd(), "src", "modules", "evidence", "domain", "evidence.ts"), "utf8");
    const evidenceMigration = migration("004_private_evidence.sql");

    expect(evidenceDomain).toContain("EVIDENCE_DOWNLOAD_TTL_SECONDS = 5 * 60");
    expect(evidenceMigration).toContain("create function public.authorized_evidence_download");
    expect(evidenceMigration).toContain("evidence.scan_status = 'clean'");
    expect(route).toContain("createSignedUrl(evidence.objectPath, EVIDENCE_DOWNLOAD_TTL_SECONDS)");
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
});

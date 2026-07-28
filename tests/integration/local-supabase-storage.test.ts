import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import amigoRegularSnapshot from "@/modules/catalog/infrastructure/official/amigo-regular.es.json";

const LOCAL_TESTS_ENABLED = process.env.LOCAL_SUPABASE_TESTS === "1";
const describeLocalSupabase = LOCAL_TESTS_ENABLED ? describe : describe.skip;
const EVIDENCE_BYTES = new TextEncoder().encode("%PDF-1.4\nMG5 local evidence fixture\n");
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const LOCAL_TEST_TIMEOUT_MS = 60_000;
const CLOSED_DIRECT_DML_TABLES = [
  "catalogs", "catalog_versions", "catalog_sections", "requirements", "profiles", "clubs",
  "memberships", "students", "role_assignments", "enrollments", "requirement_progress",
  "progress_attempts", "progress_reviews", "assessments", "investitures", "evidence",
  "attempt_evidence", "audit_log",
  "organizations", "units", "evidence_upload_rate_limits",
] as const;

interface LocalSupabaseEnvironment {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface AuthFixture {
  id: string;
  email: string;
  password: string;
}

interface PreparedEvidence {
  evidenceId: string;
  objectPath: string;
}

interface EvidenceFixtures {
  clubId: string;
  studentRecordId: string;
  driftClubId: string;
  partialClubId: string;
  admin: AuthFixture;
  guardian: AuthFixture;
  student: AuthFixture;
  foreign: AuthFixture;
  clean: PreparedEvidence;
  pending: PreparedEvidence;
  quarantined: PreparedEvidence;
  invalidMime: PreparedEvidence;
  oversized: PreparedEvidence;
}

const localClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
} as const;

function readLocalSupabaseEnvironment(): LocalSupabaseEnvironment {
  const localSupabaseCli = join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
  const commandEnvironment = { ...process.env };
  delete commandEnvironment.SUPABASE_ACCESS_TOKEN;
  delete commandEnvironment.SUPABASE_DB_PASSWORD;

  let output: string;
  try {
    output = execFileSync(process.execPath, [localSupabaseCli, "status", "-o", "env"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: commandEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "The local Supabase stack is unavailable. Start it and reset migrations before running the MG5 API suite.",
    );
  }

  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    values.set(key, value);
  }

  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw new Error(`Local Supabase status did not provide ${name}.`);
    return value;
  };

  return {
    apiUrl: required("API_URL"),
    anonKey: required("ANON_KEY"),
    serviceRoleKey: required("SERVICE_ROLE_KEY"),
  };
}

function failOnApiError(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function signInFixture(
  environment: LocalSupabaseEnvironment,
  fixture: AuthFixture,
): Promise<SupabaseClient> {
  const client = createClient(environment.apiUrl, environment.anonKey, localClientOptions);
  const { data, error } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });

  failOnApiError(`Unable to sign in ${fixture.email}`, error);
  if (!data.session) throw new Error(`Local Auth did not issue a session for ${fixture.email}.`);
  return client;
}

async function prepareEvidence(client: SupabaseClient, progressId: string): Promise<PreparedEvidence> {
  const { data, error } = await client.rpc("prepare_evidence_upload", {
    target_progress_id: progressId,
    mime_type_input: "application/pdf",
    byte_size_input: EVIDENCE_BYTES.byteLength,
  });

  failOnApiError("Unable to prepare evidence metadata", error);
  const prepared = data?.[0];
  if (!prepared) throw new Error("Evidence preparation returned no metadata.");
  return {
    evidenceId: prepared.evidence_id,
    objectPath: prepared.evidence_object_path,
  };
}

async function expectDownloadDenied(client: SupabaseClient, objectPath: string) {
  const { data, error } = await client.storage.from("evidence").download(objectPath);
  expect(data).toBeNull();
  expect(error).not.toBeNull();
}

describeLocalSupabase("local Supabase Auth and private evidence Storage", () => {
  let environment: LocalSupabaseEnvironment;
  let serviceClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let guardianClient: SupabaseClient;
  let studentClient: SupabaseClient;
  let foreignClient: SupabaseClient;
  let anonymousClient: SupabaseClient;
  let fixtures: EvidenceFixtures;
  const uploadedObjectPaths = new Set<string>();

  beforeAll(async () => {
    environment = readLocalSupabaseEnvironment();
    serviceClient = createClient(environment.apiUrl, environment.serviceRoleKey, localClientOptions);
    anonymousClient = createClient(environment.apiUrl, environment.anonKey, localClientOptions);

    const runId = randomUUID();
    const password = `Local-MG5-${runId}!`;
    const createdUsers: Record<string, AuthFixture> = {};

    for (const label of ["admin", "guardian", "student", "foreign"] as const) {
      const email = `mg5-${runId}-${label}@example.test`;
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      failOnApiError(`Unable to create ${label} Auth fixture`, error);
      if (!data.user) throw new Error(`Local Auth returned no ${label} fixture user.`);
      createdUsers[label] = { id: data.user.id, email, password };
    }

    const admin = createdUsers.admin;
    const guardian = createdUsers.guardian;
    const student = createdUsers.student;
    const foreign = createdUsers.foreign;

    const { error: profileError } = await serviceClient.from("profiles").insert([
      { user_id: admin.id, display_name: "MG5 Admin" },
      { user_id: guardian.id, display_name: "MG5 Guardian" },
      { user_id: student.id, display_name: "MG5 Student" },
      { user_id: foreign.id, display_name: "MG5 Foreign User" },
    ]);
    failOnApiError("Unable to create profile fixtures", profileError);

    const clubId = randomUUID();
    const driftClubId = randomUUID();
    const partialClubId = randomUUID();
    const { error: clubError } = await serviceClient
      .from("clubs")
      .insert([
        { id: clubId, name: `MG5 Club ${runId}` },
        { id: driftClubId, name: `AC5 Drift Club ${runId}` },
        { id: partialClubId, name: `AC5 Partial Club ${runId}` },
      ]);
    failOnApiError("Unable to create club fixture", clubError);

    const { error: membershipError } = await serviceClient
      .from("memberships")
      .insert([
        { club_id: clubId, user_id: admin.id, role: "admin" },
        { club_id: driftClubId, user_id: admin.id, role: "admin" },
        { club_id: partialClubId, user_id: admin.id, role: "admin" },
      ]);
    failOnApiError("Unable to create membership fixture", membershipError);

    const studentRecordId = randomUUID();
    const { error: studentRecordError } = await serviceClient
      .from("students")
      .insert({
        id: studentRecordId,
        club_id: clubId,
        display_name: "MG5 Linked Student",
        guardian_user_id: guardian.id,
        student_user_id: student.id,
      });
    failOnApiError("Unable to create student fixture", studentRecordError);

    // 023 intentionally stopped treating a legacy membership as write authority.
    // Use the service-only bootstrap RPC for the initial director grants instead
    // of restoring direct role_assignments DML to any API role.
    const directorBootstraps = await Promise.all([
      serviceClient.rpc("bootstrap_club_director", { target_user_id: admin.id, target_club_id: clubId }),
      serviceClient.rpc("bootstrap_club_director", { target_user_id: admin.id, target_club_id: driftClubId }),
      serviceClient.rpc("bootstrap_club_director", { target_user_id: admin.id, target_club_id: partialClubId }),
      serviceClient.rpc("bootstrap_club_director", { target_user_id: foreign.id, target_club_id: driftClubId }),
    ]);
    for (const bootstrap of directorBootstraps) {
      failOnApiError("Unable to bootstrap a canonical club director fixture", bootstrap.error);
      expect(bootstrap.data).toEqual(expect.any(String));
    }

    const catalogId = randomUUID();
    const { error: catalogError } = await serviceClient
      .from("catalogs")
      .insert({ id: catalogId, club_id: clubId, class_type: "regular", title: `MG5 Catalog ${runId}` });
    failOnApiError("Unable to create catalog fixture", catalogError);

    const catalogVersionId = randomUUID();
    const { error: catalogVersionError } = await serviceClient
      .from("catalog_versions")
      .insert({ id: catalogVersionId, catalog_id: catalogId, version_number: 1 });
    failOnApiError("Unable to create catalog-version fixture", catalogVersionError);

    const { error: requirementError } = await serviceClient.from("requirements").insert({
      id: randomUUID(),
      catalog_version_id: catalogVersionId,
      requirement_type: "file",
      title: "MG5 private evidence requirement",
      position: 0,
      requires_evidence: true,
      evidence_types: ["application/pdf"],
    });
    failOnApiError("Unable to create requirement fixture", requirementError);

    const { error: publishError } = await serviceClient
      .from("catalog_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", catalogVersionId);
    failOnApiError("Unable to publish catalog fixture", publishError);

    const enrollmentId = randomUUID();
    const { error: enrollmentError } = await serviceClient
      .from("enrollments")
      .insert({
        id: enrollmentId,
        club_id: clubId,
        student_id: studentRecordId,
        catalog_id: catalogId,
        catalog_version_id: catalogVersionId,
        school_year: 2026,
        enrolled_by: admin.id,
      });
    failOnApiError("Unable to create enrollment fixture", enrollmentError);

    guardianClient = await signInFixture(environment, guardian);
    studentClient = await signInFixture(environment, student);
    foreignClient = await signInFixture(environment, foreign);

    const { data: progress, error: progressError } = await guardianClient
      .from("requirement_progress")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .single();
    failOnApiError("Unable to load generated progress fixture", progressError);
    if (!progress) throw new Error("Enrollment did not generate requirement progress.");

    fixtures = {
      clubId,
      studentRecordId,
      driftClubId,
      partialClubId,
      admin,
      guardian,
      student,
      foreign,
      clean: await prepareEvidence(guardianClient, progress.id),
      pending: await prepareEvidence(guardianClient, progress.id),
      quarantined: await prepareEvidence(studentClient, progress.id),
      invalidMime: await prepareEvidence(guardianClient, progress.id),
      oversized: await prepareEvidence(guardianClient, progress.id),
    };
    adminClient = await signInFixture(environment, admin);
  }, LOCAL_TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (!serviceClient || uploadedObjectPaths.size === 0) return;
    await serviceClient.storage.from("evidence").remove([...uploadedObjectPaths]);
  });

  it("uses real Auth-issued sessions for every authorization actor", async () => {
    for (const [client, fixture] of [
      [guardianClient, fixtures.guardian],
      [studentClient, fixtures.student],
      [foreignClient, fixtures.foreign],
    ] as const) {
      const { data, error } = await client.auth.getUser();
      expect(error).toBeNull();
      expect(data.user?.id).toBe(fixture.id);
    }
  });

  it("keeps canonical director bootstrap exclusive to the platform service", async () => {
    const denied = await adminClient.rpc("bootstrap_club_director", {
      target_user_id: fixtures.admin.id,
      target_club_id: fixtures.clubId,
    });
    expect(denied.data).toBeNull();
    expect(denied.error?.code).toBe("42501");
  });

  it("denies real Auth and anonymous raw DML across every closed domain and privileged-UI table", async () => {
    for (const client of [adminClient, anonymousClient]) {
      for (const table of CLOSED_DIRECT_DML_TABLES) {
        const result = await client.from(table).delete().eq("id", randomUUID());
        expect(result.data).toBeNull();
        expect(result.error, `${table} must reject raw delete`).not.toBeNull();
      }
    }
  }, LOCAL_TEST_TIMEOUT_MS);

  it("serializes concurrent official-catalog provisioning into one complete publication", async () => {
    const calls = await Promise.all([
      adminClient.rpc("provision_official_amigo_catalog", {
        target_club_id: fixtures.clubId,
        snapshot: amigoRegularSnapshot,
      }),
      adminClient.rpc("provision_official_amigo_catalog", {
        target_club_id: fixtures.clubId,
        snapshot: amigoRegularSnapshot,
      }),
    ]);

    for (const call of calls) expect(call.error).toBeNull();
    expect(calls[0].data.versionId).toBe(calls[1].data.versionId);
    expect(calls[0].data).toEqual(calls[1].data);
    expect(calls[0].data).not.toHaveProperty("alreadyPublished");

    const versionId = calls[0].data.versionId as string;
    const [sections, roots, children, rows] = await Promise.all([
      adminClient.from("catalog_sections").select("id", { count: "exact", head: true }).eq("catalog_version_id", versionId),
      adminClient.from("requirements").select("id", { count: "exact", head: true }).eq("catalog_version_id", versionId).is("parent_requirement_id", null),
      adminClient.from("requirements").select("id", { count: "exact", head: true }).eq("catalog_version_id", versionId).not("parent_requirement_id", "is", null),
      adminClient.from("requirements").select("id", { count: "exact", head: true }).eq("catalog_version_id", versionId),
    ]);
    for (const result of [sections, roots, children, rows]) expect(result.error).toBeNull();
    expect([sections.count, roots.count, children.count, rows.count]).toEqual([9, 25, 96, 121]);

    const [persistedSections, persistedRequirements, persistedSource] = await Promise.all([
      adminClient.from("catalog_sections")
        .select("template_entity_id, source_code, official_code, slug, title, position, visual_page_references")
        .eq("catalog_version_id", versionId)
        .order("position"),
      adminClient.from("requirements")
        .select("id, template_entity_id, parent_requirement_id, section_id, source_code, child_role, requirement_type, title, position, optional, weight, modalities, progress_mode, completion_semantics, completion_threshold, visual_page_references")
        .eq("catalog_version_id", versionId),
      adminClient.from("official_sources")
        .select("document_title, authority, locale, document_sha256, revision_key, is_undated, provenance, transcription_notes, visual_page_references, source_payload_sha256")
        .eq("source_code", amigoRegularSnapshot.source.sourceCode)
        .single(),
    ]);
    for (const result of [persistedSections, persistedRequirements, persistedSource]) {
      expect(result.error).toBeNull();
    }
    expect(persistedSections.data).toHaveLength(amigoRegularSnapshot.sections.length);
    for (const [index, expected] of amigoRegularSnapshot.sections.entries()) {
      expect(persistedSections.data?.[index]).toMatchObject({
        template_entity_id: expected.id,
        source_code: expected.sourceCode,
        official_code: expected.officialCode,
        slug: expected.slug,
        title: expected.title,
        position: expected.position,
        visual_page_references: expected.visualPageReferences,
      });
    }

    const actualRequirements = new Map(persistedRequirements.data?.map((row) => [row.source_code, row]));
    const actualSourceByRowId = new Map(persistedRequirements.data?.map((row) => [row.id, row.source_code]));
    for (const expected of amigoRegularSnapshot.requirements) {
      const actual = actualRequirements.get(expected.sourceCode);
      expect(actual).toMatchObject({
        template_entity_id: expected.id,
        source_code: expected.sourceCode,
        child_role: "childRole" in expected ? expected.childRole : null,
        requirement_type: expected.requirementType,
        title: expected.title,
        position: expected.position,
        optional: expected.optional,
        weight: expected.weight,
        modalities: expected.modalities,
        progress_mode: expected.completion.kind === "direct" ? "direct" : "derived",
        completion_semantics: expected.completion.kind,
        completion_threshold: "threshold" in expected.completion ? expected.completion.threshold : null,
        visual_page_references: expected.visualPageReferences,
      });
      expect(actualSourceByRowId.get(actual?.parent_requirement_id ?? "")).toBe(
        "parentSourceCode" in expected ? expected.parentSourceCode : undefined,
      );
    }
    expect(persistedSource.data).toMatchObject({
      document_title: amigoRegularSnapshot.source.documentTitle,
      authority: amigoRegularSnapshot.source.authority,
      locale: amigoRegularSnapshot.source.locale,
      document_sha256: amigoRegularSnapshot.source.documentSha256,
      revision_key: amigoRegularSnapshot.source.revisionKey,
      is_undated: amigoRegularSnapshot.source.isUndated,
      provenance: amigoRegularSnapshot.source.provenance,
      transcription_notes: amigoRegularSnapshot.source.transcriptionNotes,
      visual_page_references: amigoRegularSnapshot.source.visualPageReferences,
      source_payload_sha256: "dd4f85b0f20415cfcbcb95be97819ab4cdbfc9a54484689423c4982e065ba904",
    });
    const retry = await adminClient.rpc("provision_official_amigo_catalog", {
      target_club_id: fixtures.clubId,
      snapshot: amigoRegularSnapshot,
    });
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(calls[0].data);
  }, LOCAL_TEST_TIMEOUT_MS);

  it("denies raw enrollment writes and uses the authenticated enrollment RPC", async () => {
    const { data: catalog, error: catalogError } = await adminClient
      .from("catalogs")
      .select("id")
      .eq("club_id", fixtures.clubId)
      .eq("source_catalog_code", "amigo.regular")
      .single();
    failOnApiError("Unable to load the provisioned official catalog", catalogError);
    if (!catalog) throw new Error("Provisioned official catalog was not returned.");

    const { data: version, error: versionError } = await adminClient
      .from("catalog_versions")
      .select("id")
      .eq("catalog_id", catalog.id)
      .eq("source_revision_key", amigoRegularSnapshot.source.revisionKey)
      .eq("status", "published")
      .single();
    failOnApiError("Unable to load the provisioned official version", versionError);
    if (!version) throw new Error("Provisioned official version was not returned.");

    const directInsert = await adminClient
      .from("enrollments")
      .insert({
        club_id: fixtures.clubId,
        student_id: fixtures.studentRecordId,
        catalog_id: catalog.id,
        catalog_version_id: version.id,
        school_year: 2026,
        enrolled_by: fixtures.admin.id,
      });
    expect(directInsert.data).toBeNull();
    expect(directInsert.error).not.toBeNull();

    const { data: enrollment, error: enrollmentError } = await adminClient.rpc("enroll_official_amigo_student", {
      target_student_id: fixtures.studentRecordId,
      target_school_year: 2026,
    });
    failOnApiError("Authenticated official enrollment RPC failed", enrollmentError);
    expect(enrollment).toMatchObject({ existing: false });
    if (!enrollment || typeof enrollment.enrollmentId !== "string") {
      throw new Error("Authenticated official enrollment RPC returned no enrollment ID.");
    }

    const directUpdate = await adminClient
      .from("enrollments")
      .update({ status: "withdrawn" })
      .eq("id", enrollment.enrollmentId);
    expect(directUpdate.data).toBeNull();
    expect(directUpdate.error).not.toBeNull();

    const { count, error: progressError } = await adminClient
      .from("requirement_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollment.enrollmentId);
    failOnApiError("Unable to count official enrollment progress", progressError);
    expect(count).toBe(121);
    const retry = await adminClient.rpc("enroll_official_amigo_student", {
      target_student_id: fixtures.studentRecordId,
      target_school_year: 2026,
    });
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ enrollmentId: enrollment.enrollmentId, existing: true });

    for (const client of [foreignClient, anonymousClient]) {
      const denied = await client.rpc("enroll_official_amigo_student", {
        target_student_id: fixtures.studentRecordId,
        target_school_year: 2027,
      });
      expect(denied.data).toBeNull();
      expect(denied.error?.code).toBe("42501");
    }
  }, LOCAL_TEST_TIMEOUT_MS);

  it("rejects canonical drift plus cross-club and unauthorized RPC actors without state or audit", async () => {
    const drifted = structuredClone(amigoRegularSnapshot);
    drifted.requirements[0].title = "Different title";
    const driftCall = await adminClient.rpc("provision_official_amigo_catalog", {
      target_club_id: fixtures.driftClubId,
      snapshot: drifted,
    });
    expect(driftCall.data).toBeNull();
    expect(driftCall.error?.code).toBe("23514");

    // foreignClient is a CLUB_DIRECTOR, but only for driftClubId. A canonical
    // director assignment must not confer provisioning authority in another club.
    const crossClubDenied = await foreignClient.rpc("provision_official_amigo_catalog", {
      target_club_id: fixtures.clubId,
      snapshot: amigoRegularSnapshot,
    });
    expect(crossClubDenied.data).toBeNull();
    expect(crossClubDenied.error?.code).toBe("42501");

    const anonymousDenied = await anonymousClient.rpc("provision_official_amigo_catalog", {
      target_club_id: fixtures.clubId,
      snapshot: amigoRegularSnapshot,
    });
    expect(anonymousDenied.data).toBeNull();
    expect(anonymousDenied.error?.code).toBe("42501");

    const catalogs = await adminClient.from("catalogs").select("id", { count: "exact", head: true })
      .eq("club_id", fixtures.driftClubId).not("level_template_id", "is", null);
    expect(catalogs.count).toBe(0);
  }, LOCAL_TEST_TIMEOUT_MS);

  it("rejects a pre-existing partial official catalog instead of repairing it", async () => {
    const { error: partialError } = await serviceClient.from("catalogs").insert({
      club_id: fixtures.partialClubId,
      class_type: "regular",
      title: amigoRegularSnapshot.level.title,
      level_template_id: amigoRegularSnapshot.level.id,
      source_catalog_code: amigoRegularSnapshot.level.levelCode,
    });
    failOnApiError("Unable to create AC5 partial-state fixture", partialError);

    const result = await adminClient.rpc("provision_official_amigo_catalog", {
      target_club_id: fixtures.partialClubId,
      snapshot: amigoRegularSnapshot,
    });
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("23514");
    expect(result.error?.message).toContain("partial state");
  }, LOCAL_TEST_TIMEOUT_MS);

  it("allows linked actors to upload only their own prepared pending paths", async () => {
    const foreignUpload = await foreignClient.storage
      .from("evidence")
      .upload(fixtures.clean.objectPath, EVIDENCE_BYTES, { contentType: "application/pdf" });
    expect(foreignUpload.data).toBeNull();
    expect(foreignUpload.error).not.toBeNull();

    for (const [client, prepared] of [
      [guardianClient, fixtures.clean],
      [guardianClient, fixtures.pending],
      [studentClient, fixtures.quarantined],
    ] as const) {
      const { data, error } = await client.storage
        .from("evidence")
        .upload(prepared.objectPath, EVIDENCE_BYTES, { contentType: "application/pdf" });
      expect(error).toBeNull();
      expect(data?.path).toBe(prepared.objectPath);
      uploadedObjectPaths.add(prepared.objectPath);
    }

    const arbitraryPath = `${fixtures.clubId}/${randomUUID()}`;
    const arbitraryUpload = await guardianClient.storage
      .from("evidence")
      .upload(arbitraryPath, EVIDENCE_BYTES, { contentType: "application/pdf" });
    expect(arbitraryUpload.data).toBeNull();
    expect(arbitraryUpload.error).not.toBeNull();
  }, LOCAL_TEST_TIMEOUT_MS);

  it("enforces the private bucket MIME and byte-size limits", async () => {
    const invalidMimeUpload = await guardianClient.storage
      .from("evidence")
      .upload(fixtures.invalidMime.objectPath, new TextEncoder().encode("not evidence"), {
        contentType: "text/plain",
      });
    expect(invalidMimeUpload.data).toBeNull();
    expect(invalidMimeUpload.error).not.toBeNull();

    const oversizedUpload = await guardianClient.storage
      .from("evidence")
      .upload(fixtures.oversized.objectPath, new Uint8Array(MAX_EVIDENCE_BYTES + 1), {
        contentType: "application/pdf",
      });
    expect(oversizedUpload.data).toBeNull();
    expect(oversizedUpload.error).not.toBeNull();
  }, LOCAL_TEST_TIMEOUT_MS);

  it("keeps scan state privileged and exposes only clean evidence to authorized users", async () => {
    const unauthorizedScanUpdate = await guardianClient
      .from("evidence")
      .update({ scan_status: "clean" })
      .eq("id", fixtures.clean.evidenceId);
    expect(unauthorizedScanUpdate.error).not.toBeNull();

    await expectDownloadDenied(guardianClient, fixtures.pending.objectPath);

    const { error: cleanError } = await serviceClient
      .from("evidence")
      .update({ scan_status: "clean" })
      .eq("id", fixtures.clean.evidenceId);
    failOnApiError("Unable to mark the clean scan fixture", cleanError);

    const { error: quarantineError } = await serviceClient
      .from("evidence")
      .update({ scan_status: "quarantined" })
      .eq("id", fixtures.quarantined.evidenceId);
    failOnApiError("Unable to mark the quarantined scan fixture", quarantineError);

    for (const client of [guardianClient, studentClient]) {
      const { data, error } = await client.storage.from("evidence").download(fixtures.clean.objectPath);
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(new Uint8Array(await data!.arrayBuffer())).toEqual(EVIDENCE_BYTES);
    }

    await expectDownloadDenied(studentClient, fixtures.quarantined.objectPath);
    await expectDownloadDenied(foreignClient, fixtures.clean.objectPath);
    await expectDownloadDenied(anonymousClient, fixtures.clean.objectPath);
    await expectDownloadDenied(guardianClient, `${fixtures.clubId}/${randomUUID()}`);
  }, LOCAL_TEST_TIMEOUT_MS);
});

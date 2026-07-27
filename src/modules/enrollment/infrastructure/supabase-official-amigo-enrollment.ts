import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

// Must match `level.levelCode` persisted by provision_official_amigo_catalog.
const officialCatalogCode = "amigo.regular";
const officialRevisionKey = "dsa-amigo-official-card-es-undated";

export interface EligibleOfficialAmigoStudent {
  id: string;
  displayName: string;
}

export interface OfficialAmigoEnrollmentClub {
  id: string;
  name: string;
  students: readonly EligibleOfficialAmigoStudent[];
}

export type OfficialAmigoEnrollmentResult = { enrollmentId: string; studentId: string; existing: boolean };

export class OfficialAmigoEnrollmentFailure extends Error {
  constructor(
    readonly diagnosticCode: string,
    readonly diagnosticContext: Readonly<Record<string, string>> = {},
  ) {
    super("Unable to enroll the student in official Amigo.");
  }
}

type CatalogRow = { id: string };
type VersionRow = { id: string };

/**
 * Reads and writes the narrow operational enrollment flow. Catalog and version
 * identity are constants resolved on the server; form values never choose them.
 */
export class SupabaseOfficialAmigoEnrollment {
  async listEligibleAdminStudents(actorId: string, schoolYear: number): Promise<readonly OfficialAmigoEnrollmentClub[]> {
    const supabase = await createSupabaseServerClient();
    const { data: memberships, error: membershipError } = await supabase
      .from("memberships")
      .select("club_id")
      .eq("user_id", actorId)
      .eq("role", "admin");
    if (membershipError || !memberships) throw new Error("Unable to load administrator clubs.");

    const clubIds = memberships.map((membership) => membership.club_id);
    if (clubIds.length === 0) return [];

    const { data: clubs, error: clubError } = await supabase.from("clubs").select("id, name").in("id", clubIds).order("name");
    if (clubError || !clubs) throw new Error("Unable to load administrator clubs.");

    const groups = await Promise.all(clubs.map(async (club) => {
      const catalog = await this.findPublishedCatalog(club.id);
      if (!catalog) return { id: club.id, name: club.name, students: [] };

      const { data: students, error: studentError } = await supabase.from("students").select("id, club_id, display_name").eq("club_id", club.id).order("display_name");
      if (studentError || !students) throw new Error("Unable to load club students.");
      if (students.length === 0) return { id: club.id, name: club.name, students: [] };

      const { data: enrollments, error: enrollmentError } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("catalog_id", catalog.catalogId)
        .eq("school_year", schoolYear)
        .eq("status", "active")
        .in("student_id", students.map((student) => student.id));
      if (enrollmentError || !enrollments) throw new Error("Unable to load official Amigo enrollments.");
      const enrolledStudentIds = new Set(enrollments.map((enrollment) => enrollment.student_id));

      return {
        id: club.id,
        name: club.name,
        students: students.filter((student) => !enrolledStudentIds.has(student.id)).map((student) => ({ id: student.id, displayName: student.display_name })),
      };
    }));

    return groups.filter((group) => group.students.length > 0);
  }

  async enrollStudent(studentId: string, schoolYear: number): Promise<OfficialAmigoEnrollmentResult> {
    const supabase = await createSupabaseServerClient();
    const { data: student, error: studentError } = await supabase.from("students").select("id, club_id, display_name").eq("id", studentId).maybeSingle();
    if (studentError || !student) throw new Error("Eligible student not found.");

    const catalog = await this.findPublishedCatalog(student.club_id);
    if (!catalog) throw new Error("Official regular Amigo is not provisioned for this club.");
    await this.assertCanonicalShape(catalog.versionId);

    const { data, error } = await supabase.rpc("enroll_official_amigo_student", {
      target_student_id: student.id,
      target_school_year: schoolYear,
    });
    if (error || !isEnrollmentRpcResult(data)) {
      throw new OfficialAmigoEnrollmentFailure("official_amigo_enrollment_rpc_failed", {
        databaseCode: safeDatabaseCode(error?.code),
      });
    }
    return { enrollmentId: data.enrollmentId, studentId: student.id, existing: data.existing };
  }

  private async findPublishedCatalog(clubId: string): Promise<{ catalogId: string; versionId: string } | null> {
    const supabase = await createSupabaseServerClient();
    const { data: catalog, error: catalogError } = await supabase.from("catalogs")
      .select("id").eq("club_id", clubId).eq("source_catalog_code", officialCatalogCode).eq("class_type", "regular").maybeSingle();
    if (catalogError) throw new Error("Unable to load the official Amigo catalog.");
    if (!catalog) return null;

    const { data: version, error: versionError } = await supabase.from("catalog_versions")
      .select("id").eq("catalog_id", catalog.id).eq("status", "published").eq("source_revision_key", officialRevisionKey).maybeSingle();
    if (versionError) throw new Error("Unable to load the official Amigo version.");
    if (!version) return null;
    return { catalogId: (catalog as CatalogRow).id, versionId: (version as VersionRow).id };
  }

  private async assertCanonicalShape(versionId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data: requirements, error } = await supabase.from("requirements").select("id, parent_requirement_id").eq("catalog_version_id", versionId);
    if (error || !requirements) throw new Error("Unable to validate the official Amigo catalog.");
    const roots = requirements.filter((requirement) => requirement.parent_requirement_id === null).length;
    if (roots !== 25 || requirements.length - roots !== 96 || requirements.length !== 121) {
      throw new Error("Official regular Amigo does not satisfy the canonical enrollment contract.");
    }
  }
}

function isEnrollmentRpcResult(value: unknown): value is { enrollmentId: string; existing: boolean } {
  return typeof value === "object" && value !== null
    && typeof (value as { enrollmentId?: unknown }).enrollmentId === "string"
    && typeof (value as { existing?: unknown }).existing === "boolean";
}

function safeDatabaseCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z0-9]{5}$/i.test(value) ? value : "unknown";
}

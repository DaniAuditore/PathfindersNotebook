import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { SessionActor } from "@/shared/auth/session";
import type { NavigationItem } from "@/shared/ui/navigation";
export async function navigationCapabilities(actor: SessionActor): Promise<NavigationItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members } = await supabase.from("club_members").select("id").eq("user_id", actor.id).eq("lifecycle", "ACTIVE");
  const memberIds = (members ?? []).map((member) => member.id);
  const [{ data: directorAssignments }, { data: staffAssignments }, { data: systemAssignments }] = memberIds.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
      supabase.from("club_director_assignments").select("id").in("member_id", memberIds).is("active_until", null),
      supabase.from("staff_unit_assignments").select("id").in("member_id", memberIds).is("ended_at", null),
      supabase.from("role_assignments").select("id").eq("user_id", actor.id).eq("role", "SYSTEM_ADMIN").is("revoked_at", null),
    ]);
  const isDirector = (directorAssignments ?? []).length > 0;
  const managesClub = isDirector || (staffAssignments ?? []).length > 0;
  const isSystemAdmin = (systemAssignments ?? []).length > 0;
  return [
    { href: "/dashboard", label: "Inicio", visible: true },
    { href: "/profile", label: "Mi perfil", visible: true },
    { href: "/operaciones-no-disponibles", label: "Ayuda", visible: true },
    { href: "/classes", label: "Clases", visible: managesClub },
    { href: "/enrollments", label: "Inscripciones", visible: isDirector },
    { href: "/reviews", label: "Revisiones", visible: managesClub },
    { href: "/students", label: "Alumnos", visible: managesClub },
    { href: "/club", label: "Club", visible: isDirector },
    { href: "/members", label: "Miembros y unidades", visible: isDirector || isSystemAdmin },
    { href: "/audit", label: "Auditoría", visible: managesClub },
    { href: "/assessments", label: "Evaluaciones", visible: managesClub },
  ];
}

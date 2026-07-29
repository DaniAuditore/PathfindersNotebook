import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { CanonicalRole, SessionActor } from "@/shared/auth/session";
import type { NavigationItem } from "@/shared/ui/navigation";
export async function navigationCapabilities(actor: SessionActor): Promise<NavigationItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("role_assignments").select("role").eq("user_id", actor.id).is("revoked_at", null);
  const roles = new Set<CanonicalRole>((data ?? []).map((assignment) => assignment.role as CanonicalRole));
  const managesClub = roles.has("CLUB_DIRECTOR") || roles.has("INSTRUCTOR");
  return [
    { href: "/dashboard", label: "Inicio", visible: true },
    { href: "/profile", label: "Mi perfil", visible: true },
    { href: "/operaciones-no-disponibles", label: "Ayuda", visible: true },
    { href: "/classes", label: "Clases", visible: managesClub },
    { href: "/enrollments", label: "Inscripciones", visible: roles.has("CLUB_DIRECTOR") },
    { href: "/reviews", label: "Revisiones", visible: managesClub },
    { href: "/students", label: "Alumnos", visible: managesClub },
    { href: "/club", label: "Club", visible: roles.has("CLUB_DIRECTOR") },
    { href: "/audit", label: "Auditoría", visible: managesClub },
    { href: "/assessments", label: "Evaluaciones", visible: managesClub },
  ];
}

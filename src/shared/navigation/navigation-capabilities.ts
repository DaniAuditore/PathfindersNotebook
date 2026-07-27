import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { SessionActor } from "@/shared/auth/session";
import type { NavigationItem } from "@/shared/ui/navigation";
export async function navigationCapabilities(actor: SessionActor): Promise<NavigationItem[]> { const supabase = await createSupabaseServerClient(); const { data } = await supabase.from("memberships").select("role").eq("user_id", actor.id); const roles = new Set((data ?? []).map((membership) => membership.role)); const managesClub = roles.has("admin") || roles.has("instructor"); return [{ href: "/dashboard", label: "Inicio", visible: true }, { href: "/classes", label: "Clases", visible: managesClub }, { href: "/enrollments", label: "Inscripciones", visible: roles.has("admin") }, { href: "/reviews", label: "Revisiones", visible: managesClub }]; }

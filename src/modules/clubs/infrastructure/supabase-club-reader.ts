import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ManagedClubReadModel } from "../application/club-read-model";

export class SupabaseClubReader {
  async directedClubs(actorId: string): Promise<ManagedClubReadModel[]> {
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase.from("role_assignments").select("club_id").eq("user_id", actorId).eq("role", "CLUB_DIRECTOR").is("revoked_at", null);
    if (assignmentError) throw new Error("No fue posible cargar los clubes dirigidos.");
    const clubIds = (assignments ?? []).flatMap((assignment) => assignment.club_id ? [assignment.club_id] : []);
    if (clubIds.length === 0) return [];
    const { data, error } = await supabase.from("clubs").select("id, name").in("id", clubIds).order("name");
    if (error) throw new Error("No fue posible cargar los clubes.");
    return data ?? [];
  }
}

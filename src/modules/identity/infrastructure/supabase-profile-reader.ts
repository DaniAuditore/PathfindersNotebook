import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ManagedStudentReadModel, OwnProfileReadModel } from "../application/profile-read-model";

export class SupabaseProfileReader {
  async ownProfile(actorId: string): Promise<OwnProfileReadModel | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles").select("display_name").eq("user_id", actorId).maybeSingle();
    if (error) throw new Error("No fue posible cargar el perfil.");
    return data ? { displayName: data.display_name } : null;
  }

  async managedStudents(actorId: string): Promise<ManagedStudentReadModel[]> {
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase.from("role_assignments").select("club_id").eq("user_id", actorId).is("revoked_at", null).in("role", ["CLUB_DIRECTOR", "INSTRUCTOR"]);
    if (assignmentError) throw new Error("No fue posible cargar el alcance de alumnos.");
    const clubIds = (assignments ?? []).flatMap((assignment) => assignment.club_id ? [assignment.club_id] : []);
    if (clubIds.length === 0) return [];
    const { data, error } = await supabase.from("students").select("id, club_id, display_name, birth_year").in("club_id", clubIds).order("display_name");
    if (error) throw new Error("No fue posible cargar los alumnos.");
    return (data ?? []).map((student) => ({ id: student.id, clubId: student.club_id, displayName: student.display_name, birthYear: student.birth_year }));
  }

  async managedClubIds(actorId: string): Promise<string[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("role_assignments").select("club_id").eq("user_id", actorId).is("revoked_at", null).in("role", ["CLUB_DIRECTOR", "INSTRUCTOR"]);
    if (error) throw new Error("No fue posible cargar el alcance de clubes.");
    return (data ?? []).flatMap((assignment) => assignment.club_id ? [assignment.club_id] : []);
  }

  async managedClubs(actorId: string): Promise<{ id: string; name: string }[]> {
    const clubIds = await this.managedClubIds(actorId);
    if (clubIds.length === 0) return [];
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("clubs").select("id, name").in("id", clubIds).order("name");
    if (error) throw new Error("No fue posible cargar los clubes.");
    return data ?? [];
  }
}

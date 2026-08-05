import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type Assignment = { id: string; member_id: string; role: "INSTRUCTOR" | "COUNSELOR"; unit_id: string };
type Member = { id: string; club_id: string; full_name: string; lifecycle: "ACTIVE" | "PENDING_REMEDIATION" | "WITHDRAWN" };
export class SupabaseMemberOperationsReader {
  async forActor(actorId: string) {
    const supabase = await createSupabaseServerClient();
    const { data: memberships } = await supabase.from("club_members").select("id,club_id,full_name,lifecycle").eq("user_id", actorId).eq("lifecycle", "ACTIVE");
    const ids = (memberships ?? []).map(row => row.id); const { data: directorRows } = ids.length ? await supabase.from("club_director_assignments").select("club_id").in("member_id", ids).is("active_until", null) : { data: [] as { club_id: string }[] };
    const directedIds = (directorRows ?? []).map(row => row.club_id); const [{ data: clubs }, { data: members }, { data: units }, { data: assignments }, { data: rotations }] = await Promise.all([
      directedIds.length ? supabase.from("clubs").select("id,name").in("id", directedIds).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      directedIds.length ? supabase.from("club_members").select("id,club_id,full_name,lifecycle").in("club_id", directedIds).order("full_name") : Promise.resolve({ data: [] as Member[] }),
      directedIds.length ? supabase.from("units").select("id,club_id,name").in("club_id", directedIds).order("name") : Promise.resolve({ data: [] as { id: string; club_id: string; name: string }[] }),
      directedIds.length ? supabase.from("staff_unit_assignments").select("id,member_id,role,unit_id").is("ended_at", null) : Promise.resolve({ data: [] as Assignment[] }),
      supabase.rpc("list_club_rotation_metadata"),
    ]);
    const unitById = new Map((units ?? []).map(unit => [unit.id, unit.name]));
    const operationalMembers = (members ?? []).filter(member => member.lifecycle !== "PENDING_REMEDIATION");
    const conditions = new Map(await Promise.all(operationalMembers.map(async (member) => {
      const { data, error } = await supabase.rpc("member_condition_at", { target_member_id: member.id });
      if (error || (data !== "LEADER" && data !== "PATHFINDER")) throw new Error("Unable to read the database-authoritative member condition.");
      return [member.id, data] as const;
    })));
    const directed = (clubs ?? []).map(club => { const clubMembers = (members ?? []).filter(member => member.club_id === club.id); return { ...club, units: (units ?? []).filter(unit => unit.club_id === club.id), pending: clubMembers.filter(member => member.lifecycle === "PENDING_REMEDIATION").map(member => ({ id: member.id, fullName: member.full_name })), members: clubMembers.filter(member => member.lifecycle !== "PENDING_REMEDIATION").map(member => ({ id: member.id, fullName: member.full_name, lifecycle: member.lifecycle, condition: conditions.get(member.id)!, unitName: undefined as string | undefined, assignments: (assignments ?? []).filter(a => a.member_id === member.id).map(a => ({ id: a.id, role: a.role, unitName: unitById.get(a.unit_id) ?? "Unidad" })) })) }; });
    const rotationGroups = new Map<string, { clubId: string; clubName: string; directorName: string; successors: { id: string; fullName: string }[] }>();
    for (const row of (rotations.data ?? []) as { club_id: string; club_name: string; director_name: string; successor_member_id: string | null; successor_name: string | null }[]) { const group = rotationGroups.get(row.club_id) ?? { clubId: row.club_id, clubName: row.club_name, directorName: row.director_name, successors: [] }; if (row.successor_member_id && row.successor_name) group.successors.push({ id: row.successor_member_id, fullName: row.successor_name }); rotationGroups.set(row.club_id, group); }
    return { directed, rotations: [...rotationGroups.values()].filter(group => group.successors.length) };
  }
}

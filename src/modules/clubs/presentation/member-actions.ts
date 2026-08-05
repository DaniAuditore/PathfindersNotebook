"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createInternalAuthUser, generateTemporaryPassword } from "@/modules/identity/infrastructure/supabase-auth-admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const id = z.uuid();
const memberSchema = z.object({ clubId: id, fullName: z.string().trim().min(1).max(120), dateOfBirth: z.string().date(), unitId: id, username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/), staffRole: z.enum(["INSTRUCTOR", "COUNSELOR"]).nullable() });
const destination = "/members";
function to(destinationSuffix: string) { redirect(`${destination}${destinationSuffix}`); }
function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function refresh() { revalidatePath("/members"); revalidatePath("/dashboard"); revalidatePath("/"); }

export type ProvisionMemberState =
  | { status: "idle" }
  | { status: "success"; username: string; temporaryPassword: string }
  | { status: "error" };

export async function provisionMemberFormAction(_previousState: ProvisionMemberState, form: FormData): Promise<ProvisionMemberState> {
  try {
    const command = memberSchema.parse({ clubId: value(form, "clubId"), fullName: value(form, "fullName"), dateOfBirth: value(form, "dateOfBirth"), unitId: value(form, "unitId"), username: value(form, "username"), staffRole: value(form, "staffRole") || null });
    const supabase = await createSupabaseServerClient(); const correlationId = randomUUID();
    const { data, error } = await supabase.rpc("begin_member_provisioning", { target_club_id: command.clubId, full_name_input: command.fullName, date_of_birth_input: command.dateOfBirth, target_unit_id: command.unitId, username_input: command.username, staff_role_input: command.staffRole, correlation_id: correlationId });
    if (error || !data) throw new Error("begin");
    const temporaryPassword = generateTemporaryPassword(); const authUserId = await createInternalAuthUser(correlationId, temporaryPassword);
    const { error: finalizeError } = await supabase.rpc("finalize_member_provisioning", { correlation_id: correlationId, auth_user_id_input: authUserId });
    if (finalizeError) throw new Error("finalize");
    refresh();
    // Server Action POST responses are no-store. The password is returned only
    // in this response state: never in a URL, cookie, database, or redirect.
    return { status: "success", username: command.username, temporaryPassword };
  } catch { return { status: "error" }; }
}
export async function memberOperationFormAction(form: FormData) {
  let error: unknown = null;
  try {
    const operation = value(form, "operation"); const supabase = await createSupabaseServerClient();
    if (operation === "unit") ({ error } = await supabase.rpc("create_unit", { target_club_id: id.parse(value(form, "clubId")), name_input: value(form, "name") }));
    else if (operation === "transfer") ({ error } = await supabase.rpc("transfer_member_unit", { target_member_id: id.parse(value(form, "memberId")), target_unit_id: id.parse(value(form, "unitId")) }));
    else if (operation === "assign") ({ error } = await supabase.rpc("assign_staff_unit", { target_member_id: id.parse(value(form, "memberId")), target_unit_id: id.parse(value(form, "unitId")), role_input: z.enum(["INSTRUCTOR", "COUNSELOR"]).parse(value(form, "role")) }));
    else if (operation === "revoke") ({ error } = await supabase.rpc("revoke_staff_unit", { target_assignment_id: id.parse(value(form, "assignmentId")) }));
    else if (operation === "withdraw") ({ error } = await supabase.rpc("withdraw_member", { target_member_id: id.parse(value(form, "memberId")) }));
    else if (operation === "remediate") ({ error } = await supabase.rpc("remediate_member", { target_member_id: id.parse(value(form, "memberId")), full_name_input: value(form, "fullName"), date_of_birth_input: z.string().date().parse(value(form, "dateOfBirth")), target_unit_id: id.parse(value(form, "unitId")) }));
    else if (operation === "rotate") ({ error } = await supabase.rpc("rotate_club_director", { target_club_id: id.parse(value(form, "clubId")), successor_member_id: id.parse(value(form, "memberId")), reason_input: z.string().trim().min(3).max(500).parse(value(form, "reason")) }));
    else throw new Error("operation");
    if (error) throw error;
    refresh();
  } catch {
    to("?error=operation");
  }
  // redirect() signals navigation by throwing; it must remain outside the
  // command error boundary or a committed operation is reported as failed.
  to("?message=operation");
}

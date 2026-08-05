import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type CredentialGate = "ALLOW" | "CHANGE_PASSWORD" | "DENY";

type CredentialRecord = {
  auth_user_id: string | null;
  provisioning_correlation_id: string;
  state: "INITIAL_CHANGE_REQUIRED" | "ACTIVE" | "EXPIRED" | "FAILED" | "PROVISIONING";
  temporary_credential_expires_at: string | null;
};

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_AUTH_ADMIN_KEY;
  if (!url || !secret) throw new Error("Missing server-only Supabase Auth configuration.");
  return { url, secret };
}

function adminClient() {
  const { url, secret } = configuration();
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

function normalizedUsername(username: string) {
  return username.trim().toLowerCase();
}

export function syntheticMemberAlias(correlationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlationId)) {
    throw new Error("Invalid provisioning correlation.");
  }
  return `m.${correlationId.toLowerCase()}@members.invalid`;
}

export function generateTemporaryPassword() {
  return randomBytes(24).toString("base64url");
}

export function initialPasswordChangeTokenHash(token: string) {
  // PostgREST serializes JSON, not Node Buffers. Send PostgreSQL's bytea hex
  // literal form so the stored digest matches extensions.digest in the command.
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

export async function createInternalAuthUser(correlationId: string, temporaryPassword: string) {
  const client = adminClient();
  const alias = syntheticMemberAlias(correlationId);
  const { data, error } = await client.auth.admin.createUser({
    email: alias, password: temporaryPassword, email_confirm: true,
  });
  if (data.user) return data.user.id;
  // A repeated correlation must converge on the same Auth account. The password
  // is intentionally not updated or returned on this path.
  for (let page = 1; page <= 100; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 1_000 });
    if (listed.error) break;
    const existing = listed.data.users.find((user) => user.email === alias);
    if (existing) return existing.id;
    if (listed.data.users.length < 1_000) break;
  }
  if (error) throw error;
  throw new Error("Could not create the internal Auth account.");
}

export async function resolveInternalUsername(username: string): Promise<{ authUserId: string; alias: string } | null> {
  const client = adminClient();
  const { data, error } = await client.from("member_credentials")
    .select("auth_user_id,state,temporary_credential_expires_at,provisioning_correlation_id")
    .eq("username", normalizedUsername(username)).maybeSingle<CredentialRecord>();
  if (error || !data?.auth_user_id) return null;
  const expired = data.state === "INITIAL_CHANGE_REQUIRED" && (!data.temporary_credential_expires_at || new Date(data.temporary_credential_expires_at) <= new Date());
  if (expired || data.state === "EXPIRED" || data.state === "FAILED" || data.state === "PROVISIONING") {
    if (expired) {
      await client.from("member_credentials").update({ state: "EXPIRED", temporary_credential_expires_at: null }).eq("auth_user_id", data.auth_user_id);
      await client.auth.admin.updateUserById(data.auth_user_id, { ban_duration: "876000h" });
    }
    return null;
  }
  return { authUserId: data.auth_user_id, alias: syntheticMemberAlias(data.provisioning_correlation_id) };
}

export async function issueInitialPasswordChangeToken(authUserId: string) {
  const token = `${randomUUID()}${randomBytes(24).toString("base64url")}`;
  const hash = initialPasswordChangeTokenHash(token);
  const { error } = await adminClient().from("member_credentials")
    .update({ initial_password_change_token_hash: hash }).eq("auth_user_id", authUserId).eq("state", "INITIAL_CHANGE_REQUIRED");
  if (error) throw error;
  return token;
}

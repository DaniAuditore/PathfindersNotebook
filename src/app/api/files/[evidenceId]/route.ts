import { NextResponse } from "next/server";

import { EVIDENCE_DOWNLOAD_TTL_SECONDS } from "@/modules/evidence/domain/evidence";
import { SupabaseEvidenceFacade } from "@/modules/evidence/infrastructure/supabase-evidence-facade";
import { requireSession } from "@/shared/auth/session";
import { writeActionLog } from "@/shared/observability/action-log";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function GET(_request: Request, context: RouteContext<"/api/files/[evidenceId]">) {
  try {
    const { evidenceId } = await context.params;
    const actor = await requireSession();
    const evidence = await new SupabaseEvidenceFacade().getDownload(evidenceId);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(evidence.objectPath, EVIDENCE_DOWNLOAD_TTL_SECONDS);
    if (error || !data?.signedUrl) return NextResponse.json({ error: "Evidence delivery is unavailable." }, { status: 404 });
    await writeActionLog({ clubId: evidence.clubId, actorId: actor.id, action: "evidence.download_delivered", entityType: "evidence", entityId: evidenceId, metadata: { ttlSeconds: EVIDENCE_DOWNLOAD_TTL_SECONDS } });
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: "Evidence delivery is unavailable." }, { status: 403 });
  }
}

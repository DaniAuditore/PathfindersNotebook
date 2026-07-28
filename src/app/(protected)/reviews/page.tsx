import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { reviewProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { ActionResult } from "@/shared/ui/action-result";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [queue, notice] = await Promise.all([new SupabaseProgressReader().reviewQueue(actor.id), searchParams]);
  return (
    <><PageHeader title="Cola de revisiones" description="Decide sobre las entregas pendientes de tus clubes." />
      {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible guardar la revisión. Inténtalo de nuevo." /> : null}
      {queue.length === 0 ? <EmptyState title="No hay entregas pendientes"><p>Las entregas enviadas por alumnos aparecerán acá.</p></EmptyState> : <div className="stack">{queue.map((item) => (
        <Card key={item.attemptId}>
          <h2>{item.studentName}: {item.requirementTitle}</h2>
          {item.childContext ? <p>{item.childContext}</p> : null}
          <p><strong>Recibida:</strong> <time dateTime={item.submittedAt}>{new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.submittedAt))}</time> · <strong>En cola:</strong> {item.queueAgeDays === 0 ? "menos de un día" : `${item.queueAgeDays} ${item.queueAgeDays === 1 ? "día" : "días"}`}</p>
          <p>{item.submissionText || "No se envió texto."}</p>
          <div className="review-decisions">
            <form action={reviewProgressFormAction}>
              <input type="hidden" name="progressId" value={item.progressId} />
              <input type="hidden" name="attemptId" value={item.attemptId} />
              <fieldset className="review-decision review-decision--approve">
                <legend>Aprobar entrega</legend>
                <p className="help">Confirme que la entrega cumple el requisito antes de aprobarla.</p>
                <SubmitButton name="decision" value="accepted" pendingLabel="Aprobando…">Aprobar entrega</SubmitButton>
              </fieldset>
            </form>
            <form action={reviewProgressFormAction}>
              <input type="hidden" name="progressId" value={item.progressId} />
              <input type="hidden" name="attemptId" value={item.attemptId} />
              <fieldset className="review-decision review-decision--changes">
                <legend>Solicitar cambios</legend>
                <p className="form-field"><label htmlFor={`reason-${item.attemptId}`}>Motivo de los cambios solicitados</label><textarea id={`reason-${item.attemptId}`} name="reason" required maxLength={2000} /></p>
                <p className="help">Indique el motivo para que el alumno pueda corregir la entrega.</p>
                <SubmitButton className="button--request-changes" name="decision" value="rejected" pendingLabel="Enviando…">Solicitar cambios</SubmitButton>
              </fieldset>
            </form>
          </div>
        </Card>
      ))}</div>}
    </>
  );
}

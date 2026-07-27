import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { reviewProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [queue, notice] = await Promise.all([new SupabaseProgressReader().reviewQueue(actor.id), searchParams]);
  return (
    <><PageHeader title="Cola de revisiones" description="Decidí sobre las entregas pendientes de tus clubes." />
      {notice.message ? <Notice kind="success" focusOnRender message={notice.message} /> : null}{notice.error ? <Notice kind="error" focusOnRender message="No pudimos guardar la revisión. Intentá de nuevo." /> : null}
      {queue.length === 0 ? <EmptyState title="No hay entregas pendientes"><p>Las entregas enviadas por alumnos aparecerán acá.</p></EmptyState> : <div className="stack">{queue.map((item) => (
        <Card key={item.attemptId}>
          <h2>{item.studentName}: {item.requirementTitle}</h2>
          {item.childContext ? <p>{item.childContext}</p> : null}
          <p>{item.submissionText || "No se envió texto."}</p>
          <form action={reviewProgressFormAction}>
            <input type="hidden" name="progressId" value={item.progressId} />
            <input type="hidden" name="attemptId" value={item.attemptId} />
            <SubmitButton name="decision" value="accepted" pendingLabel="Aprobando…">Aprobar entrega</SubmitButton>
          </form>
          <form action={reviewProgressFormAction}>
            <input type="hidden" name="progressId" value={item.progressId} />
            <input type="hidden" name="attemptId" value={item.attemptId} />
            <p className="form-field"><label htmlFor={`reason-${item.attemptId}`}>Motivo de los cambios solicitados</label><textarea id={`reason-${item.attemptId}`} name="reason" required maxLength={2000} /></p>
            <SubmitButton name="decision" value="rejected" pendingLabel="Enviando…">Solicitar cambios</SubmitButton>
          </form>
        </Card>
      ))}</div>}
    </>
  );
}

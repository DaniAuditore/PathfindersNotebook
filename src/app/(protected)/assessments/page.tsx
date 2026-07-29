import { notFound } from "next/navigation";

import { SupabaseAssessmentReader } from "@/modules/assessment/infrastructure/supabase-assessment-reader";
import { recordAssessmentFormAction, recordInvestitureFormAction } from "@/modules/assessment/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { ActionResult } from "@/shared/ui/action-result";
import { DataSummary } from "@/shared/ui/data-summary";
import { DestructiveConfirmation } from "@/shared/ui/destructive-confirmation";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

function dateLabel(value: string | null): string {
  return value ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin registro";
}

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [items, notice] = await Promise.all([new SupabaseAssessmentReader().workspace(actor.id), searchParams]);
  if (!items) notFound();
  return <><PageHeader title="Evaluaciones e investiduras" description="Registra decisiones dentro de tu club. La validación final siempre la realiza el comando autorizado." />
    {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible completar la acción. Inténtalo de nuevo." /> : null}
    {items.length === 0 ? <EmptyState title="No hay inscripciones para evaluar" /> : <div className="stack">{items.map((item) => <section className="card assessment-item" key={item.enrollmentId}><h2>{item.studentName}</h2><p>{item.catalogTitle} · {item.schoolYear}</p>
      <DataSummary items={[{ label: "Progreso aprobado", value: `${item.approvedPercentage}%` }, { label: "Listo para evaluación", value: item.ready ? "Sí" : "No" }, { label: "Evaluación", value: item.assessmentDecision === "passed" ? "Aprobada" : item.assessmentDecision === "failed" ? "No aprobada" : "Pendiente" }, { label: "Última evaluación", value: dateLabel(item.assessedAt) }, { label: "Investidura", value: dateLabel(item.investedAt) }]} />
      {item.investedAt ? <StatusBadge status="accepted">Investidura registrada</StatusBadge> : <><details className="assessment-action"><summary>Registrar evaluación</summary><form className="form-stack" action={recordAssessmentFormAction}><input type="hidden" name="clubId" value={item.clubId} /><input type="hidden" name="enrollmentId" value={item.enrollmentId} /><fieldset><legend>Decisión</legend><label><input type="radio" name="decision" value="passed" required /> Aprobar evaluación</label><label><input type="radio" name="decision" value="failed" required /> No aprobar evaluación</label></fieldset><p className="form-field"><label htmlFor={`assessment-comments-${item.enrollmentId}`}>Comentarios (opcional)</label><textarea id={`assessment-comments-${item.enrollmentId}`} name="comments" maxLength={4000} /></p><p className="help">Confirma la decisión antes de guardarla. El servidor rechazará una aprobación si el progreso no está completo.</p><SubmitButton pendingLabel="Registrando…">Confirmar evaluación</SubmitButton></form></details>
        {item.canRecordInvestiture ? <DestructiveConfirmation summary="Registrar investidura"><form className="form-stack" action={recordInvestitureFormAction}><input type="hidden" name="clubId" value={item.clubId} /><input type="hidden" name="enrollmentId" value={item.enrollmentId} /><p className="form-field"><label htmlFor={`investiture-rationale-${item.enrollmentId}`}>Motivo de la investidura</label><textarea id={`investiture-rationale-${item.enrollmentId}`} name="rationale" required maxLength={2000} /></p><p className="help">Esta acción completa la inscripción. Solo la dirección del club puede confirmarla y el servidor verifica el progreso y la evaluación aprobada.</p><SubmitButton pendingLabel="Registrando…">Confirmar investidura</SubmitButton></form></DestructiveConfirmation> : null}</>}
    </section>)}</div>}
    <EmptyState title="Evaluación asignada no disponible"><p>Las evaluaciones asignadas a un evaluador requieren un contrato de lectura aprobado y no se muestran en este espacio.</p></EmptyState>
  </>;
}

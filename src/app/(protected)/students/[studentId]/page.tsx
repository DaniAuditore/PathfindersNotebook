import { notFound } from "next/navigation";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { submitProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { ProgressSummary } from "@/shared/ui/progress-summary";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

const statusLabel = { draft: "Borrador", submitted: "Enviado", accepted: "Aprobado", rejected: "Cambios solicitados" } as const;

function RequirementTree({ requirement, studentId }: { requirement: import("@/modules/progress/application/progress-read-model").RequirementProgressItem; studentId: string }) {
  const isDerived = requirement.completionSemantics && requirement.completionSemantics !== "direct";
  const modalities = requirement.modalities ?? [];
  const children = requirement.children ?? [];
  const canSubmitText = requirement.canSubmitText ?? ((requirement.status === "draft" || requirement.status === "rejected") && !requirement.requiresEvidence);
  const modality = modalities.join(", ") || "entrega de texto";
  return <li className="requirement">
    <details>
      <summary>{requirement.title} <StatusBadge status={requirement.status}>{statusLabel[requirement.status]}</StatusBadge></summary>
      <article>
      <h4>{requirement.title}</h4>
      <p>{isDerived ? `Se completa a partir de sus elementos: ${requirement.complete ? "completo" : "incompleto"}` : <>Estado: <StatusBadge status={requirement.status}>{statusLabel[requirement.status]}</StatusBadge></>}</p>
      <p><strong>Tipo:</strong> {isDerived ? "Requisito compuesto" : modality}</p>
      {requirement.instructions ? <p>{requirement.instructions}</p> : null}
      {requirement.reviewReason ? <p><strong>Motivo de revisión:</strong> {requirement.reviewReason}</p> : null}
      {requirement.history.length > 0 ? <details><summary>Historial de entregas ({requirement.history.length})</summary><ol>{requirement.history.map((attempt) => <li key={attempt.attemptId}>Intento {attempt.attemptNumber}: {attempt.submissionText || "Sin texto"} — {attempt.decision ? statusLabel[attempt.decision] : "Esperando revisión"}{attempt.decisionReason ? ` (${attempt.decisionReason})` : ""}</li>)}</ol></details> : null}
      {canSubmitText ? <form action={submitProgressFormAction}><input type="hidden" name="progressId" value={requirement.progressId} /><input type="hidden" name="studentId" value={studentId} /><p className="form-field"><label htmlFor={`submission-${requirement.progressId}`}>Texto de la entrega</label><textarea id={`submission-${requirement.progressId}`} name="submissionText" required maxLength={10000} /></p><SubmitButton pendingLabel="Enviando…">{requirement.status === "rejected" ? "Reenviar para revisión" : "Enviar para revisión"}</SubmitButton></form> : null}
      {!canSubmitText && requirement.requiresEvidence ? <p>Este requisito necesita evidencia y no se puede enviar como texto.</p> : null}
      {!canSubmitText && modalities.includes("practical_in_person") ? <p>Este requisito práctico requiere la gestión presencial de un instructor.</p> : null}
      {children.length > 0 ? <ol aria-label={`${requirement.title} items`}>{children.map((child) => <RequirementTree key={child.requirementId} requirement={child} studentId={studentId} />)}</ol> : null}
      </article>
    </details>
  </li>;
}

export default async function StudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  await requireSession();
  const { studentId } = await params;
  const notice = await searchParams;
  const learner = await new SupabaseProgressReader().learner(studentId);
  if (!learner) notFound();

  return (
    <><PageHeader title={learner.displayName} description="Progreso de aprendizaje" />
      {notice.message ? <Notice kind="success" message={notice.message} /> : null}{notice.error ? <Notice kind="error" message="No pudimos completar esa acción. Intentá de nuevo." /> : null}
      {learner.enrollments.length === 0 ? <EmptyState title="Sin inscripción activa" /> : learner.enrollments.map((enrollment) => (
        <section key={enrollment.enrollmentId}>
          <h2>{enrollment.catalogTitle} — {enrollment.schoolYear}</h2>
          <ProgressSummary percentage={enrollment.approvedPercentage} nextAction="Abrí una sección para consultar el próximo requisito pendiente." />
          {(enrollment.sections ?? [{ sectionId: "legacy-requirements", title: "Requisitos", approvedPercentage: enrollment.approvedPercentage, requirements: enrollment.requirements }]).map((section) => <details key={section.sectionId} className="card"><summary id={`section-${section.sectionId}`}>{section.title} — {section.approvedPercentage}% aprobado</summary><section aria-labelledby={`section-${section.sectionId}`}><h3>{section.title}</h3>{section.requirements.length === 0 ? <p>No hay requisitos disponibles en esta sección.</p> : <ol>{section.requirements.map((requirement) => <RequirementTree key={requirement.requirementId} requirement={requirement} studentId={learner.studentId} />)}</ol>}</section></details>)}
        </section>
      ))}
    </>
  );
}

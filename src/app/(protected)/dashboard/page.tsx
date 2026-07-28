import Link from "next/link";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { DataSummary } from "@/shared/ui/data-summary";
import { EmptyState } from "@/shared/ui/empty-state";
import { ActionResult } from "@/shared/ui/action-result";
import { PageHeader } from "@/shared/ui/page-header";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireSession();
  const [dashboard, notice] = await Promise.all([new SupabaseProgressReader().dashboard(actor.id), searchParams]);
  return (
    <><PageHeader title="Panel de progreso" description="Consulta el avance de los alumnos vinculados a tu cuenta." />
      {notice.error ? <ActionResult kind="error" message="No fue posible completar la acción. Inténtalo de nuevo." /> : null}
      {dashboard.cohort ? <section aria-labelledby="cohort-heading"><h2 id="cohort-heading">Resumen del grupo</h2><DataSummary items={[{ label: "Inscripciones activas", value: dashboard.cohort.enrolled }, { label: "Entregas pendientes", value: dashboard.cohort.submitted }, { label: "Aprobados", value: dashboard.cohort.accepted }, { label: "Cambios solicitados", value: dashboard.cohort.rejected }, { label: "Pendiente más antigua", value: dashboard.cohort.oldestPendingAt ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(dashboard.cohort.oldestPendingAt)) : "No hay entregas pendientes" }]} /></section> : null}
      {dashboard.canReview ? <Card><h2>Revisiones pendientes</h2><p>Hay entregas pendientes de una decisión.</p><Link className="button" href="/reviews">Abrir cola de revisiones</Link></Card> : null}
      <section aria-labelledby="learners-heading"><h2 id="learners-heading">Alumnos vinculados</h2>{dashboard.learners.length === 0 ? <EmptyState title="No hay alumnos activos vinculados"><p>El progreso aparecerá aquí cuando haya un alumno vinculado.</p></EmptyState> : <div className="grid">{dashboard.learners.map((learner) => <Card key={learner.studentId}><h3><Link href={`/students/${learner.studentId}`}>{learner.displayName}</Link></h3>{learner.enrollments.length === 0 ? <p>Sin inscripción activa.</p> : <ul>{learner.enrollments.map((enrollment) => <li key={enrollment.enrollmentId}>{enrollment.catalogTitle} ({enrollment.schoolYear}): {enrollment.approvedPercentage}% aprobado</li>)}</ul>}</Card>)}</div>}</section>
    </>
  );
}

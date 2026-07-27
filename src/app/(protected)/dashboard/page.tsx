import Link from "next/link";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireSession();
  const [dashboard, notice] = await Promise.all([new SupabaseProgressReader().dashboard(actor.id), searchParams]);
  return (
    <><PageHeader title="Panel de progreso" description="Consultá el avance de los alumnos vinculados a tu cuenta." />
      {notice.error ? <Notice kind="error" message="No pudimos completar esa acción. Intentá de nuevo." /> : null}
      {dashboard.canReview ? <Card><h2>Revisiones pendientes</h2><p>Hay entregas esperando una decisión.</p><Link className="button" href="/reviews">Abrir cola de revisiones</Link></Card> : null}
      <section aria-labelledby="learners-heading"><h2 id="learners-heading">Alumnos vinculados</h2>{dashboard.learners.length === 0 ? <EmptyState title="No hay alumnos activos vinculados"><p>Cuando un alumno esté vinculado, su progreso aparecerá acá.</p></EmptyState> : <div className="grid">{dashboard.learners.map((learner) => <Card key={learner.studentId}><h3><Link href={`/students/${learner.studentId}`}>{learner.displayName}</Link></h3>{learner.enrollments.length === 0 ? <p>Sin inscripción activa.</p> : <ul>{learner.enrollments.map((enrollment) => <li key={enrollment.enrollmentId}>{enrollment.catalogTitle} ({enrollment.schoolYear}): {enrollment.approvedPercentage}% aprobado</li>)}</ul>}</Card>)}</div>}</section>
    </>
  );
}

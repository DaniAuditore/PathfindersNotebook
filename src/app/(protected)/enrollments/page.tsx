import Link from "next/link";

import { SupabaseOfficialAmigoEnrollment } from "@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment";
import { enrollOfficialAmigoStudentFormAction } from "@/modules/enrollment/presentation/official-amigo-actions";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { ActionResult } from "@/shared/ui/action-result";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string; studentId?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialAmigoEnrollment().listEligibleAdminStudents(actor.id, new Date().getFullYear()),
    searchParams,
  ]);

  const resultHref = notice.studentId && /^[0-9a-f-]{36}$/i.test(notice.studentId) ? `/students/${notice.studentId}` : null;
  return <><PageHeader title="Inscripción oficial de Amigo" description="Inscribe alumnos elegibles en el catálogo oficial regular de Amigo preparado para este año." />
    {notice.message ? <><ActionResult kind="success" message={notice.message} />{resultHref ? <p><Link href={resultHref}>Ver el progreso del alumno inscrito</Link></p> : null}</> : null}{notice.error ? <ActionResult kind="error" message="No fue posible completar la inscripción. Inténtalo de nuevo." /> : null}
    {clubs.length === 0 ? <EmptyState title="No hay alumnos elegibles"><p>No hay alumnos disponibles en un club administrado con Amigo regular oficial preparado.</p></EmptyState> : <div className="stack">{clubs.map((club) => <Card key={club.id}><h2>{club.name}</h2><ul>{club.students.map((student) => <li key={student.id} className="actions"><strong>{student.displayName}</strong>
        <form action={enrollOfficialAmigoStudentFormAction}>
          <input type="hidden" name="studentId" value={student.id} />
          <SubmitButton pendingLabel="Inscribiendo…">Inscribir en Amigo regular oficial</SubmitButton>
        </form><Link href={`/students/${student.id}`}>Ver alumno</Link></li>)}</ul></Card>)}</div>}
    <p><Link href="/classes">Administrar preparación de Amigo oficial</Link>{" · "}<Link href="/dashboard">Abrir panel de alumnos</Link></p>
  </>;
}

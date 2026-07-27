import Link from "next/link";

import { SupabaseOfficialAmigoEnrollment } from "@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment";
import { enrollOfficialAmigoStudentFormAction } from "@/modules/enrollment/presentation/official-amigo-actions";
import { requireSession } from "@/shared/auth/session";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialAmigoEnrollment().listEligibleAdminStudents(actor.id, new Date().getFullYear()),
    searchParams,
  ]);

  return <><PageHeader title="Inscripción oficial de Amigo" description="Inscribí alumnos elegibles en el catálogo oficial regular de Amigo ya preparado para este año." />
    {notice.message ? <Notice kind="success" message={notice.message} /> : null}{notice.error ? <Notice kind="error" message="No pudimos completar la inscripción. Intentá de nuevo." /> : null}
    {clubs.length === 0 ? <EmptyState title="No hay alumnos elegibles"><p>No hay alumnos disponibles en un club administrado con Amigo regular oficial preparado.</p></EmptyState> : <div className="stack">{clubs.map((club) => <Card key={club.id}><h2>{club.name}</h2><ul>{club.students.map((student) => <li key={student.id} className="actions"><strong>{student.displayName}</strong>
        <form action={enrollOfficialAmigoStudentFormAction}>
          <input type="hidden" name="studentId" value={student.id} />
          <SubmitButton pendingLabel="Inscribiendo…">Inscribir en Amigo regular oficial</SubmitButton>
        </form><Link href={`/students/${student.id}`}>Ver alumno</Link></li>)}</ul></Card>)}</div>}
    <p><Link href="/classes">Administrar preparación de Amigo oficial</Link>{" · "}<Link href="/dashboard">Abrir panel de alumnos</Link></p>
  </>;
}

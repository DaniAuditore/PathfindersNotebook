import { SupabaseProfileReader } from "@/modules/identity/infrastructure/supabase-profile-reader";
import { saveStudentFormAction } from "@/modules/identity/presentation/student-actions";
import { requireSession } from "@/shared/auth/session";
import { ActionResult } from "@/shared/ui/action-result";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { ResponsiveList } from "@/shared/ui/responsive-list";
import { SubmitButton } from "@/shared/ui/submit-button";

function StudentForm({ clubId, student }: { clubId: string; student?: { id: string; displayName: string; birthYear: number | null } }) {
  const formId = student ? `student-${student.id}` : `student-new-${clubId}`;
  return <form className="form-stack" action={saveStudentFormAction}><input type="hidden" name="clubId" value={clubId} />{student ? <input type="hidden" name="studentId" value={student.id} /> : null}<p className="form-field"><label htmlFor={`${formId}-name`}>Nombre del alumno</label><input id={`${formId}-name`} name="displayName" defaultValue={student?.displayName} required maxLength={120} /></p><p className="form-field"><label htmlFor={`${formId}-year`}>Año de nacimiento (opcional)</label><input id={`${formId}-year`} name="birthYear" type="number" min="1900" max="2100" defaultValue={student?.birthYear ?? ""} /></p><SubmitButton pendingLabel="Guardando…">{student ? "Guardar alumno" : "Agregar alumno"}</SubmitButton></form>;
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const reader = new SupabaseProfileReader();
  const [students, clubs, notice] = await Promise.all([reader.managedStudents(actor.id), reader.managedClubs(actor.id), searchParams]);
  if (clubs.length === 0) return <><PageHeader title="Alumnos" description="Gestiona únicamente los alumnos de tus clubes asignados." /><EmptyState title="Sin alcance de gestión"><p>No tienes un rol de dirección o instrucción activo en un club.</p></EmptyState></>;
  return <><PageHeader title="Alumnos" description="Gestiona únicamente los alumnos de tus clubes asignados." />
    {notice.message ? <ActionResult kind="success" message={notice.message} /> : null}{notice.error ? <ActionResult kind="error" message="No fue posible guardar el alumno. Inténtalo de nuevo." /> : null}
    <section className="stack"><h2>Agregar alumno</h2>{clubs.map((club) => <details className="card" key={club.id}><summary>Agregar alumno a {club.name}</summary><StudentForm clubId={club.id} /></details>)}</section>
    <section className="stack"><h2>Alumnos visibles</h2>{students.length === 0 ? <EmptyState title="No hay alumnos en tus clubes" /> : <ResponsiveList label="Alumnos visibles">{students.map((student) => <li key={student.id}><details><summary>{student.displayName}{student.birthYear ? ` · ${student.birthYear}` : ""}</summary><StudentForm clubId={student.clubId} student={student} /></details></li>)}</ResponsiveList>}</section>
  </>;
}

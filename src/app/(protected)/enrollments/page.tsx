import Link from "next/link";

import { SupabaseOfficialAmigoEnrollment } from "@/modules/enrollment/infrastructure/supabase-official-amigo-enrollment";
import { enrollOfficialAmigoStudentFormAction } from "@/modules/enrollment/presentation/official-amigo-actions";
import { requireSession } from "@/shared/auth/session";

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialAmigoEnrollment().listEligibleAdminStudents(actor.id, new Date().getFullYear()),
    searchParams,
  ]);

  return <main>
    <h1>Official Amigo enrollment</h1>
    {notice.message ? <p role="status">{notice.message}</p> : null}
    {notice.error ? <p role="alert">{notice.error}</p> : null}
    <p>Enroll eligible students in this year&apos;s already-provisioned immutable official regular Amigo catalog. This is not catalog authoring.</p>
    {clubs.length === 0 ? <p>No eligible students are available in an administrator club with official regular Amigo provisioned.</p> : <ul>{clubs.map((club) => <li key={club.id}>
      <h2>{club.name}</h2>
      <ul>{club.students.map((student) => <li key={student.id}>
        <span>{student.displayName}</span>{" "}
        <form action={enrollOfficialAmigoStudentFormAction} style={{ display: "inline" }}>
          <input type="hidden" name="studentId" value={student.id} />
          <button type="submit">Enroll in official regular Amigo</button>
        </form>{" "}
        <Link href={`/students/${student.id}`}>View learner</Link>
      </li>)}</ul>
    </li>)}</ul>}
    <p><Link href="/classes">Manage official Amigo provisioning</Link>{" | "}<Link href="/dashboard">Open learner dashboard</Link></p>
  </main>;
}

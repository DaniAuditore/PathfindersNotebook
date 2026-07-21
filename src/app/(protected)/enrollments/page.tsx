import { requireSession } from "@/shared/auth/session";

export default async function EnrollmentsPage() {
  await requireSession();
  return <main><h1>Enrollments</h1><p>Enroll students against a published class version.</p></main>;
}

import Link from "next/link";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { requireSession } from "@/shared/auth/session";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireSession();
  const [dashboard, notice] = await Promise.all([new SupabaseProgressReader().dashboard(actor.id), searchParams]);
  return (
    <main>
      <h1>Progress dashboard</h1>
      {notice.error ? <p role="alert">{notice.error}</p> : null}
      {dashboard.canReview ? <p><Link href="/reviews">Open submitted-attempt review queue</Link></p> : null}
      <h2>Linked learners</h2>
      {dashboard.learners.length === 0 ? <p>No linked active learner records are available.</p> : (
        <ul>{dashboard.learners.map((learner) => (
          <li key={learner.studentId}>
            <Link href={`/students/${learner.studentId}`}>{learner.displayName}</Link>
            {learner.enrollments.length === 0 ? " — no active enrollment" : (
              <ul>{learner.enrollments.map((enrollment) => <li key={enrollment.enrollmentId}>{enrollment.catalogTitle} ({enrollment.schoolYear}): {enrollment.approvedPercentage}% approved</li>)}</ul>
            )}
          </li>
        ))}</ul>
      )}
    </main>
  );
}

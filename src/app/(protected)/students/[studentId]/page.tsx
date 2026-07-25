import { notFound } from "next/navigation";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { submitProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";

const statusLabel = { draft: "Draft", submitted: "Submitted", accepted: "Approved", rejected: "Changes requested" } as const;

export default async function StudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  await requireSession();
  const { studentId } = await params;
  const notice = await searchParams;
  const learner = await new SupabaseProgressReader().learner(studentId);
  if (!learner) notFound();

  return (
    <main>
      <h1>{learner.displayName}</h1>
      {notice.message ? <p role="status">{notice.message}</p> : null}
      {notice.error ? <p role="alert">{notice.error}</p> : null}
      {learner.enrollments.length === 0 ? <p>No active enrollment.</p> : learner.enrollments.map((enrollment) => (
        <section key={enrollment.enrollmentId}>
          <h2>{enrollment.catalogTitle} — {enrollment.schoolYear}</h2>
          <p><strong>{enrollment.approvedPercentage}% approved</strong></p>
          {enrollment.requirements.map((requirement) => (
            <article key={requirement.requirementId}>
              <h3>{requirement.title}</h3>
              <p>Status: {statusLabel[requirement.status]}</p>
              {requirement.instructions ? <p>{requirement.instructions}</p> : null}
              {requirement.reviewReason ? <p><strong>Review reason:</strong> {requirement.reviewReason}</p> : null}
              {requirement.history.length > 0 ? (
                <details><summary>Submission history ({requirement.history.length})</summary><ol>{requirement.history.map((attempt) => (
                  <li key={attempt.attemptId}>
                    Attempt {attempt.attemptNumber}: {attempt.submissionText || "No text"} — {attempt.decision ? statusLabel[attempt.decision] : "Awaiting review"}
                    {attempt.decisionReason ? ` (${attempt.decisionReason})` : ""}
                  </li>
                ))}</ol></details>
              ) : null}
              {(requirement.status === "draft" || requirement.status === "rejected") && !requirement.requiresEvidence ? (
                <form action={submitProgressFormAction}>
                  <input type="hidden" name="progressId" value={requirement.progressId} />
                  <input type="hidden" name="studentId" value={learner.studentId} />
                  <p><label>Submission text<br /><textarea name="submissionText" required maxLength={10000} /></label></p>
                  <button type="submit">{requirement.status === "rejected" ? "Resubmit" : "Submit for review"}</button>
                </form>
              ) : null}
              {(requirement.status === "draft" || requirement.status === "rejected") && requirement.requiresEvidence ? <p>This requirement needs scanned evidence; file submission is not available in this slice.</p> : null}
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}

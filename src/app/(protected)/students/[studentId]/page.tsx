import { notFound } from "next/navigation";

import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { submitProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";

const statusLabel = { draft: "Draft", submitted: "Submitted", accepted: "Approved", rejected: "Changes requested" } as const;

function RequirementTree({ requirement, studentId }: { requirement: import("@/modules/progress/application/progress-read-model").RequirementProgressItem; studentId: string }) {
  const isDerived = requirement.completionSemantics && requirement.completionSemantics !== "direct";
  const modalities = requirement.modalities ?? [];
  const children = requirement.children ?? [];
  const canSubmitText = requirement.canSubmitText ?? ((requirement.status === "draft" || requirement.status === "rejected") && !requirement.requiresEvidence);
  const modality = modalities.join(", ") || "legacy text workflow";
  return <li>
    <article>
      <h4>{requirement.title}</h4>
      <p role="status">{isDerived ? `Derived from children: ${requirement.complete ? "Complete" : "Not complete"}` : `Status: ${statusLabel[requirement.status]}`}</p>
      <p><strong>Type:</strong> {isDerived ? "Compound requirement" : modality}</p>
      {requirement.instructions ? <p>{requirement.instructions}</p> : null}
      {requirement.reviewReason ? <p><strong>Review reason:</strong> {requirement.reviewReason}</p> : null}
      {requirement.history.length > 0 ? <details><summary>Submission history ({requirement.history.length})</summary><ol>{requirement.history.map((attempt) => <li key={attempt.attemptId}>Attempt {attempt.attemptNumber}: {attempt.submissionText || "No text"} — {attempt.decision ? statusLabel[attempt.decision] : "Awaiting review"}{attempt.decisionReason ? ` (${attempt.decisionReason})` : ""}</li>)}</ol></details> : null}
      {canSubmitText ? <form action={submitProgressFormAction}><input type="hidden" name="progressId" value={requirement.progressId} /><input type="hidden" name="studentId" value={studentId} /><p><label>Submission text<br /><textarea name="submissionText" required maxLength={10000} /></label></p><button type="submit">{requirement.status === "rejected" ? "Resubmit" : "Submit for review"}</button></form> : null}
      {!canSubmitText && requirement.requiresEvidence ? <p>This requirement needs evidence and cannot be submitted as text.</p> : null}
      {!canSubmitText && modalities.includes("practical_in_person") ? <p>This practical requirement requires in-person instructor handling.</p> : null}
      {children.length > 0 ? <ol aria-label={`${requirement.title} items`}>{children.map((child) => <RequirementTree key={child.requirementId} requirement={child} studentId={studentId} />)}</ol> : null}
    </article>
  </li>;
}

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
          {(enrollment.sections ?? [{ sectionId: "legacy-requirements", title: "Requirements", approvedPercentage: enrollment.approvedPercentage, requirements: enrollment.requirements }]).map((section) => <section key={section.sectionId} aria-labelledby={`section-${section.sectionId}`}><h3 id={`section-${section.sectionId}`}>{section.title}</h3><p role="status"><strong>{section.approvedPercentage}% approved in this section</strong></p>{section.requirements.length === 0 ? <p>No requirements are available in this section.</p> : <ol>{section.requirements.map((requirement) => <RequirementTree key={requirement.requirementId} requirement={requirement} studentId={learner.studentId} />)}</ol>}</section>)}
        </section>
      ))}
    </main>
  );
}

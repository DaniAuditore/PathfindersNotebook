import { SupabaseProgressReader } from "@/modules/progress/infrastructure/supabase-progress-reader";
import { reviewProgressFormAction } from "@/modules/review/presentation/actions";
import { requireSession } from "@/shared/auth/session";

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [queue, notice] = await Promise.all([new SupabaseProgressReader().reviewQueue(actor.id), searchParams]);
  return (
    <main>
      <h1>Review queue</h1>
      {notice.message ? <p role="status">{notice.message}</p> : null}
      {notice.error ? <p role="alert">{notice.error}</p> : null}
      {queue.length === 0 ? <p>No submitted attempts are waiting in your clubs.</p> : queue.map((item) => (
        <article key={item.attemptId}>
          <h2>{item.studentName}: {item.requirementTitle}</h2>
          <p>{item.submissionText || "No text was submitted."}</p>
          <form action={reviewProgressFormAction}>
            <input type="hidden" name="progressId" value={item.progressId} />
            <input type="hidden" name="attemptId" value={item.attemptId} />
            <button type="submit" name="decision" value="accepted">Approve</button>
          </form>
          <form action={reviewProgressFormAction}>
            <input type="hidden" name="progressId" value={item.progressId} />
            <input type="hidden" name="attemptId" value={item.attemptId} />
            <p><label>Reason for changes<br /><textarea name="reason" required maxLength={2000} /></label></p>
            <button type="submit" name="decision" value="rejected">Request changes</button>
          </form>
        </article>
      ))}
    </main>
  );
}

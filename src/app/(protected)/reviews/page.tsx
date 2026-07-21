import { requireSession } from "@/shared/auth/session";

export default async function ReviewsPage() {
  await requireSession();
  return <main><h1>Review queue</h1><p>Review submitted requirements assigned to your club role.</p></main>;
}

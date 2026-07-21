import { requireSession } from "@/shared/auth/session";

export default async function DashboardPage() {
  await requireSession();
  return <main><h1>Progress dashboard</h1><p>Choose a student or review queue within your club.</p></main>;
}

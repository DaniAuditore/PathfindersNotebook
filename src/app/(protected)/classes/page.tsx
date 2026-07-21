import { requireSession } from "@/shared/auth/session";

export default async function ClassesPage() {
  await requireSession();

  return (
    <main>
      <h1>Class management</h1>
      <p>Choose a club to manage its versioned class catalog.</p>
    </main>
  );
}

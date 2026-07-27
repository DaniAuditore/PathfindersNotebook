import Link from "next/link";

import { provisionOfficialAmigoFormAction } from "@/modules/catalog/presentation/actions";
import { SupabaseOfficialProvisioningReader } from "@/modules/catalog/infrastructure/supabase-official-provisioning-reader";
import { requireSession } from "@/shared/auth/session";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireSession();
  const [clubs, notice] = await Promise.all([
    new SupabaseOfficialProvisioningReader().listAdminClubs(actor.id),
    searchParams,
  ]);

  return (
    <main>
      <h1>Official Amigo provisioning</h1>
      {notice.message ? <p role="status">{notice.message}</p> : null}
      {notice.error ? <p role="alert">{notice.error}</p> : null}
      <p>Provision the immutable official regular Amigo catalog for one of your administrator clubs. This is not generic catalog authoring.</p>
      {clubs.length === 0 ? <p>You need an administrator membership in a club to provision official Amigo.</p> : (
        <ul>
          {clubs.map((club) => (
            <li key={club.id}>
              <h2>{club.name}</h2>
              <form action={provisionOfficialAmigoFormAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <button type="submit">Provision official regular Amigo</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p><Link href="/classes">View class catalogs</Link>{" | "}<Link href="/dashboard">Open learner dashboard</Link></p>
    </main>
  );
}

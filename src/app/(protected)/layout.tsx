import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/(auth)/actions";
import { AuthorizationError, requireSession } from "@/shared/auth/session";
import { navigationCapabilities } from "@/shared/navigation/navigation-capabilities";
import { AppShell } from "@/shared/ui/app-shell";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  let actor;
  try {
    actor = await requireSession();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/login");
    throw error;
  }
  const items = await navigationCapabilities(actor);
  return <AppShell email={actor.email} items={items} signOut={<form action={signOutAction}><SubmitButton className="shell__signout" pendingLabel="Cerrando sesión…">Cerrar sesión</SubmitButton></form>}>{children}</AppShell>;
}

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/(auth)/actions";
import { AuthorizationError, requireSession } from "@/shared/auth/session";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/login");
    throw error;
  }

  return (
    <>
      <header>
        <nav aria-label="Main navigation">
          <Link href="/dashboard">Dashboard</Link>{" | "}<Link href="/classes">Classes</Link>{" | "}<Link href="/reviews">Reviews</Link>
          <form action={signOutAction} style={{ display: "inline", marginInlineStart: "1rem" }}><button type="submit">Sign out</button></form>
        </nav>
      </header>
      {children}
    </>
  );
}

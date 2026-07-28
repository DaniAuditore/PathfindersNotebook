import Link from "next/link";

import { EmptyState } from "./empty-state";

export function DeferredState({ title, children }: { title: string; children: string }) {
  return <EmptyState title={title}><p>{children}</p><Link href="/operaciones-no-disponibles">Consultar alcance disponible</Link></EmptyState>;
}

import type { ReactNode } from "react";

/** Native disclosure keeps irreversible actions deliberately explicit. */
export function DestructiveConfirmation({ summary = "Confirmar acción irreversible", children }: { summary?: string; children: ReactNode }) {
  return <details className="destructive-confirmation"><summary>{summary}</summary><div>{children}</div></details>;
}

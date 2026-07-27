import type { ReactNode } from "react";
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) { return <section className="empty-state" aria-labelledby="empty-state-title"><h2 id="empty-state-title">{title}</h2>{children}</section>; }

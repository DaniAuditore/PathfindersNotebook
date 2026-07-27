import type { ReactNode } from "react";
export function StatusBadge({ status, children }: { status: "draft" | "submitted" | "accepted" | "rejected"; children: ReactNode }) { return <span className={`status-badge status-badge--${status}`}>{children}</span>; }

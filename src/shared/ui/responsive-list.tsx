import type { ReactNode } from "react";

export function ResponsiveList({ children, label }: { children: ReactNode; label: string }) {
  return <ul className="responsive-list" aria-label={label}>{children}</ul>;
}

import type { ReactNode } from "react";

export function DataSummary({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return <dl className="data-summary">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

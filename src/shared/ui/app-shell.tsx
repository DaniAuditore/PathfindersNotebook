import type { ReactNode } from "react";
import Link from "next/link";
import { Navigation, type NavigationItem } from "@/shared/ui/navigation";
export function AppShell({ children, email, items, signOut }: { children: ReactNode; email?: string; items: NavigationItem[]; signOut: ReactNode }) { return <div className="shell"><a className="skip-link" href="#contenido">Saltar al contenido</a><header className="shell__header"><div className="shell__bar"><Link className="brand" href="/dashboard">Cuaderno de Conquistadores</Link><Navigation items={items} />{email ? <span className="shell__account">{email}</span> : null}{signOut}</div></header><main id="contenido" className="page">{children}</main></div>; }

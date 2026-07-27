"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export type NavigationItem = { href: string; label: string; visible: boolean };
export function Navigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  return <details className="shell__navigation"><summary>Menú de navegación</summary><nav className="shell__nav" aria-label="Navegación principal">{items.filter((item) => item.visible).map((item) => pathname === item.href ? <span aria-current="page" key={item.href}>{item.label}</span> : <Link href={item.href} key={item.href}>{item.label}</Link>)}</nav></details>;
}

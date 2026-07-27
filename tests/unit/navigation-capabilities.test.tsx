import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
import { navigationCapabilities } from "@/shared/navigation/navigation-capabilities";
import { Navigation } from "@/shared/ui/navigation";

describe("capacidad de navegación", () => {
  it("muestra inscripciones sólo para administradores y no convierte visibilidad en autorización", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ role: "instructor" }] });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) });
    const links = await navigationCapabilities({ id: "instructor" });
    expect(links.find((link) => link.href === "/reviews")?.visible).toBe(true);
    expect(links.find((link) => link.href === "/enrollments")?.visible).toBe(false);
    expect(links).toEqual(expect.arrayContaining([{ href: "/dashboard", label: "Inicio", visible: true }]));
  });

  it("uses a keyboard-operable mobile menu and keeps role-hidden destinations absent", () => {
    const html = renderToStaticMarkup(<Navigation items={[
      { href: "/dashboard", label: "Inicio", visible: true },
      { href: "/classes", label: "Clases", visible: true },
      { href: "/enrollments", label: "Inscripciones", visible: false },
    ]} />);

    expect(html).toContain("<details");
    expect(html).toContain("Menú de navegación");
    expect(html).toContain('aria-label="Navegación principal"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Clases");
    expect(html).not.toContain("Inscripciones");
  });
});

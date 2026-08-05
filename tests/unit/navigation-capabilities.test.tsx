import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
import { navigationCapabilities } from "@/shared/navigation/navigation-capabilities";
import { Navigation } from "@/shared/ui/navigation";

describe("capacidad de navegación", () => {
  function v2Client({ director, staff }: { director: boolean; staff: boolean }) {
    return {
      from: vi.fn((table: string) => {
        if (table === "club_members") {
          const query = { select: () => query, eq: vi.fn().mockImplementationOnce(() => query).mockResolvedValueOnce({ data: [{ id: "member-a" }] }) };
          return query;
        }
        const query = { select: () => query, eq: () => query, in: () => query, is: vi.fn().mockResolvedValue({ data: table === "club_director_assignments" && director ? [{ id: "director-a" }] : table === "staff_unit_assignments" && staff ? [{ id: "staff-a" }] : [] }) };
        return query;
      }),
    };
  }
  it("muestra inscripciones sólo para administradores y no convierte visibilidad en autorización", async () => {
    createSupabaseServerClient.mockResolvedValue(v2Client({ director: false, staff: true }));
    const links = await navigationCapabilities({ id: "instructor" });
    expect(links.find((link) => link.href === "/reviews")?.visible).toBe(true);
    expect(links.find((link) => link.href === "/enrollments")?.visible).toBe(false);
    expect(links.find((link) => link.href === "/students")?.visible).toBe(true);
    expect(links.find((link) => link.href === "/club")?.visible).toBe(false);
    expect(links.find((link) => link.href === "/assessments")?.visible).toBe(true);
    expect(links).toEqual(expect.arrayContaining([{ href: "/dashboard", label: "Inicio", visible: true }]));
  });

  it("muestra perfil para toda sesión y reserva club para dirección activa", async () => {
    createSupabaseServerClient.mockResolvedValue(v2Client({ director: true, staff: false }));

    const links = await navigationCapabilities({ id: "director" });
    expect(links.find((link) => link.href === "/profile")?.visible).toBe(true);
    expect(links.find((link) => link.href === "/club")?.visible).toBe(true);
    expect(links.find((link) => link.href === "/audit")?.visible).toBe(true);
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

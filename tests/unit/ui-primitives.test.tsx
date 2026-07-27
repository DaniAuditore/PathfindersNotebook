import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

const formStatus = vi.hoisted(() => vi.fn(() => ({ pending: false })));
vi.mock("react-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-dom")>()), useFormStatus: formStatus }));

import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Notice } from "@/shared/ui/notice";
import { PageHeader } from "@/shared/ui/page-header";
import { ProgressSummary } from "@/shared/ui/progress-summary";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

describe("primitivas de interfaz", () => {
  it("renderiza jerarquía semántica, estados y controles con nombres en español", () => {
    const html = renderToStaticMarkup(<main><PageHeader title="Panel" description="Resumen" /><Card><Notice kind="success" message="Guardado correctamente." /><Notice kind="error" message="No pudimos guardar. Intentá de nuevo." /><ProgressSummary percentage={40} nextAction="Continuá con el próximo requisito." /><StatusBadge status="submitted">Enviado</StatusBadge><form><SubmitButton>Guardar</SubmitButton></form></Card><EmptyState title="No hay resultados" /></main>);
    expect(html).toContain("<h1>Panel</h1>");
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Resumen de progreso");
    expect(html).toContain("Guardar");
    expect(html).toContain("No hay resultados");
  });

  it("prevents repeated protected-form submission while the action is pending", () => {
    formStatus.mockReturnValue({ pending: true });
    const html = renderToStaticMarkup(<form><SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton></form>);

    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Enviando…");
    formStatus.mockReturnValue({ pending: false });
  });
});

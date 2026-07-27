import type { ReactNode } from "react";
export function ProgressSummary({ percentage, nextAction }: { percentage: number; nextAction?: ReactNode }) { return <section className="progress-summary" aria-label="Resumen de progreso"><strong>{percentage}% aprobado</strong>{nextAction ? <p>{nextAction}</p> : null}</section>; }

"use client";

import { useEffect, useRef } from "react";

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { void error; noticeRef.current?.focus(); }, [error]);
  return <section className="empty-state" aria-labelledby="protected-error-title"><h1 id="protected-error-title">No fue posible cargar esta información</h1><p ref={noticeRef} role="alert" tabIndex={-1}>Inténtalo de nuevo. Si el problema continúa, consulta al responsable autorizado de tu club.</p><button type="button" onClick={reset}>Reintentar</button></section>;
}

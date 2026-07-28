"use client";

import { useEffect, useRef } from "react";

export function Notice({ kind, message, focusOnRender = false }: { kind: "success" | "error"; message: string; focusOnRender?: boolean }) {
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (focusOnRender) noticeRef.current?.focus();
  }, [focusOnRender]);

  return <p ref={noticeRef} className={`notice notice--${kind}`} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"} tabIndex={focusOnRender ? -1 : undefined} autoFocus={focusOnRender}>{message}</p>;
}

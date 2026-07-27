"use client";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
export function SubmitButton({ children, pendingLabel = "Guardando…", ...props }: ComponentProps<"button"> & { pendingLabel?: string }) { const { pending } = useFormStatus(); return <button {...props} type={props.type ?? "submit"} disabled={pending || props.disabled} aria-busy={pending}>{pending ? pendingLabel : children}</button>; }

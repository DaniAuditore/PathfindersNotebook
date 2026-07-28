import { Notice } from "./notice";

/** A mutation outcome that is announced and focused after a server redirect. */
export function ActionResult({ kind, message }: { kind: "success" | "error"; message: string }) {
  return <Notice kind={kind} message={message} focusOnRender />;
}

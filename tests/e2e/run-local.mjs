import { spawn } from "node:child_process";

// Authenticated browser coverage is deliberately local-only. This wrapper never
// reads deployed Supabase configuration and gives the app server an explicit
// opt-in before it starts the local stack.
const command = process.platform === "win32"
  ? process.env.ComSpec ?? "cmd.exe"
  : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", `npx playwright test ${process.argv.slice(2).join(" ")}`]
  : ["playwright", "test", ...process.argv.slice(2)];
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, LOCAL_SUPABASE_E2E: "1" },
  stdio: "inherit",
  windowsHide: true,
});

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const port = 3100;
const nextPort = Number(process.env.PWA_E2E_UPSTREAM ?? 3101);
const updateWorkerUrl = new URL("./fixtures/sw-update-worker.js", import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const localSupabase = join(root, "node_modules", "supabase", "dist", "supabase.js");
let serveUpdateWorker = false;
let next;
let localStackStarted = false;

function runLocalSupabase(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [localSupabase, ...args], { cwd: root, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(output) : reject(new Error(`Local Supabase ${args.join(" ")} failed (${code}).`)));
  });
}

function parseEnvironment(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  const url = values.get("API_URL");
  const key = values.get("ANON_KEY");
  if (!url || !key || !/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(url)) throw new Error("E2E requires a local Supabase API URL and anon key.");
  return { url, key };
}

async function startUpstream() {
  if (process.env.PWA_E2E_UPSTREAM) return;
  if (process.env.LOCAL_SUPABASE_E2E !== "1") throw new Error("Refusing to run E2E without the local Supabase-only wrapper.");
  await runLocalSupabase(["start"]);
  localStackStarted = true;
  await runLocalSupabase(["db", "reset", "--local", "--no-seed"]);
  const { url, key } = parseEnvironment(await runLocalSupabase(["status", "-o", "env"]));
  const command = `npm run dev -- --hostname 127.0.0.1 --port ${nextPort}`;
  next = process.platform === "win32"
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], { cwd: root, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, stdio: "inherit" })
    : spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(nextPort)], { cwd: root, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, stdio: "inherit" });
}

const server = createServer(async (incoming, outgoing) => {
  const requestUrl = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`);
  if (requestUrl.pathname === "/__e2e__/enable-sw-update" && incoming.method === "POST") {
    serveUpdateWorker = true;
    outgoing.writeHead(204);
    outgoing.end();
    return;
  }
  if (requestUrl.pathname === "/sw.js" && serveUpdateWorker) {
    serveUpdateWorker = false;
    const body = await readFile(updateWorkerUrl);
    outgoing.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "service-worker-allowed": "/",
    });
    outgoing.end(body);
    return;
  }

  const proxied = request({
    hostname: "127.0.0.1",
    port: nextPort,
    path: incoming.url,
    method: incoming.method,
    // Preserve the browser-facing authority. Next validates Server Actions
    // against Origin, so forwarding the upstream port would reject every form.
    headers: { ...incoming.headers, host: incoming.headers.host, "x-forwarded-host": incoming.headers.host },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  proxied.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(503);
    outgoing.end("Waiting for the Next development server.");
  });
  incoming.pipe(proxied);
});

async function close() {
  server.close();
  next?.kill();
  if (localStackStarted) await runLocalSupabase(["stop", "--no-backup"]).catch(() => {});
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
async function main() {
  await startUpstream();
  next?.on("exit", (code) => process.exit(code ?? 0));
  server.listen(port, "127.0.0.1");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

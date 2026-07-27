import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";

const port = 3100;
const nextPort = Number(process.env.PWA_E2E_UPSTREAM ?? 3101);
const updateWorkerUrl = new URL("./fixtures/sw-update-worker.js", import.meta.url);
let serveUpdateWorker = false;
const next = process.env.PWA_E2E_UPSTREAM ? undefined : process.platform === "win32"
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm run dev -- --hostname 127.0.0.1 --port ${nextPort}`], { stdio: "inherit" })
  : spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(nextPort)], { stdio: "inherit" });

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
    headers: { ...incoming.headers, host: `127.0.0.1:${nextPort}` },
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

function close() {
  server.close();
  next?.kill();
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
next?.on("exit", (code) => process.exit(code ?? 0));
server.listen(port, "127.0.0.1");

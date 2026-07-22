import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const localSupabase = join(root, "node_modules", "supabase", "dist", "supabase.js");
const localVitest = join(root, "node_modules", "vitest", "vitest.mjs");
const databaseTestDirectory = join(root, "supabase", "tests", "database");
const databaseFixtureHelper = "fixtures.sql";
const localApiSuite = join("tests", "integration", "local-supabase-storage.test.ts");

let primaryFailure;
let startAttempted = false;

function redact(value) {
  return value
    .replace(/((?:SERVICE_ROLE|ANON|PUBLISHABLE)[A-Z_]*KEY\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(postgresql:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(│\s*(?:Secret(?: Key)?|Access Key)\s*│\s*)[^\s│]+/gi, "$1[REDACTED]")
    .replace(/sb_(?:publishable|secret)_[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.)[a-zA-Z0-9_-]+/g, "$1[REDACTED]");
}

function write(output, stream = process.stdout) {
  stream.write(redact(String(output)));
}

function run(command, args, { allowFailure = false, env = process.env } = {}) {
  const label = [command, ...args].join(" ");
  write(`\n[migration-gate] $ ${label}\n`);

  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(command, args, {
      cwd: root,
      env,
      shell: false,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      write(chunk, process.stderr);
    });
    child.once("error", (error) => {
      const failure = new Error(`${label} could not start: ${error.message}`);
      if (allowFailure) resolve({ ok: false, error: failure, output });
      else reject(failure);
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ ok: true, output });
        return;
      }

      const failure = new Error(
        `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
      );
      if (allowFailure) resolve({ ok: false, error: failure, output });
      else reject(failure);
    });
  });
}

function runSupabase(args, options) {
  return run(process.execPath, [localSupabase, ...args], options);
}

function executableDatabaseSuites() {
  return readdirSync(databaseTestDirectory, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".sql") && entry.name !== databaseFixtureHelper,
    )
    .map((entry) => entry.name)
    .sort();
}

async function runDatabaseSuites() {
  const suites = executableDatabaseSuites();
  if (suites.length === 0) {
    throw new Error("No executable pgTAP suites were found.");
  }

  write(`\n[migration-gate] Running ${suites.length} pgTAP suites in deterministic order.\n`);
  for (const suite of suites) {
    await runSupabase(["test", "db", "--local", join(databaseTestDirectory, suite)]);
  }
}

async function runLocalApiSuite() {
  await run(process.execPath, [localVitest, "run", localApiSuite, "--bail=1"], {
    env: { ...process.env, LOCAL_SUPABASE_TESTS: "1" },
  });
}

async function diagnostics() {
  write("\n[migration-gate] Failure diagnostics (sensitive values redacted)\n", process.stderr);
  await runSupabase(["status", "-o", "env"], { allowFailure: true });
  const containers = await run(
    "docker",
    ["ps", "-aq", "--filter", "label=com.supabase.cli.project"],
    { allowFailure: true },
  );
  for (const id of containers.output.trim().split(/\s+/).filter(Boolean)) {
    await run("docker", ["logs", "--tail", "100", id], { allowFailure: true });
  }
}

async function stop() {
  const result = await runSupabase(["stop", "--no-backup"], { allowFailure: true });
  if (!result.ok) throw result.error;
}

try {
  if (!existsSync(localSupabase)) {
    throw new Error(
      "Pinned Supabase CLI was not found. Run npm ci before npm run test:migrations; the gate will not download tooling.",
    );
  }
  if (!existsSync(localVitest)) {
    throw new Error(
      "Local Vitest was not found. Run npm ci before npm run test:migrations; the gate will not download tooling.",
    );
  }

  await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  startAttempted = true;
  await runSupabase(["start"]);
  await runSupabase(["db", "reset", "--local", "--no-seed"]);
  write("\n[migration-gate] Local reset completed: the current migration chain was applied from zero without a seed.\n");
  await runDatabaseSuites();
  await runLocalApiSuite();
} catch (error) {
  primaryFailure = error instanceof Error ? error : new Error(String(error));
  await diagnostics();
} finally {
  if (startAttempted) {
    try {
      await stop();
    } catch (teardownError) {
      const error = teardownError instanceof Error ? teardownError : new Error(String(teardownError));
      if (primaryFailure) {
        write(`\n[migration-gate] Teardown also failed: ${error.message}\n`, process.stderr);
      } else {
        primaryFailure = new Error(`Local stack teardown failed: ${error.message}`);
      }
    }
  }
}

if (primaryFailure) {
  write(`\n[migration-gate] FAILED: ${primaryFailure.message}\n`, process.stderr);
  process.exitCode = 1;
} else {
  write("\n[migration-gate] PASS: migrations, pgTAP, local Auth/Storage APIs, and cleanup passed.\n");
}

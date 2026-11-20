import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "aburii-db-tests-"));
const dir = join(root, "data");
let running = false;
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (r.status !== 0) throw Error(`${cmd}: ${r.stderr || r.stdout || r.error}`);
  return r.stdout;
}
try {
  run("initdb", [
    "-D",
    dir,
    "-A",
    "trust",
    "-U",
    "aburii_test",
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  // Unix socket in a unique directory; TCP disabled. Cannot connect to a live project.
  run("pg_ctl", [
    "-D",
    dir,
    "-l",
    join(root, "postgres.log"),
    "-o",
    `-h '' -k ${root}`,
    "start",
  ]);
  running = true;
  const env = {
    ...process.env,
    PGHOST: root,
    PGUSER: "aburii_test",
    PGDATABASE: "postgres",
    ABURII_DISPOSABLE_TEST: "yes",
  };
  run(
    "psql",
    [
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
    ],
    { env },
  );
  run("psql", ["-v", "ON_ERROR_STOP=1", "-f", "supabase/inspect_production.sql"], { env });
  run("psql", ["-v", "ON_ERROR_STOP=1", "-f", "supabase/001_aburii.sql"], {
    env,
  });
  run(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", "supabase/002_staff_workspace.sql"],
    { env },
  );
  run(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", "supabase/003_operating_hours.sql"],
    { env },
  );
  run("psql", ["-v", "ON_ERROR_STOP=1", "-f", "supabase/verify_production.sql"], { env });
  run("psql", ["-v", "ON_ERROR_STOP=1", "-f", "supabase/verify_production_full.sql"], { env });
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "tests/database.test.mjs",
      "tests/runtime-port.test.mjs",
      "tests/upstream-errors.test.mjs",
      "tests/staff-workspace.test.mjs",
      "tests/operating-hours.test.mjs",
      "tests/i18n.test.mjs",
      "tests/staff-view.test.mjs",
      "tests/local-development.test.mjs",
      "tests/production-config.test.mjs",
    ],
    { env, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (running)
    spawnSync("pg_ctl", ["-D", dir, "-m", "fast", "stop"], {
      encoding: "utf8",
    });
  rmSync(root, { recursive: true, force: true });
}

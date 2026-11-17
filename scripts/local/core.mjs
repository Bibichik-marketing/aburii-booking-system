import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir, userInfo } from "node:os";
import { spawn, spawnSync } from "node:child_process";
export const root = resolve(import.meta.dirname, "../..");
export const state = join(root, ".local-dev");
export const configPath = join(state, "config.json");
export const credentialsPath = join(state, "admin-credentials.json");
export function developmentOnly() {
  if (process.env.NODE_ENV === "production")
    throw Error("Local development tools refuse NODE_ENV=production.");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (pkg.name !== "aburii-booking-system")
    throw Error("Not the independent Aburii project.");
}
export function privateDirectory(path) {
  try {
    const info = lstatSync(path);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== userInfo().uid
    )
      throw Error("Unsafe local state directory.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  chmodSync(path, 0o700);
}
export function savePrivate(path, data) {
  // Exclusive temporary file and rename would also work; state is owner-only.
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || info.uid !== userInfo().uid)
      throw Error("Unsafe local state file.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
export function config() {
  developmentOnly();
  const c = JSON.parse(readFileSync(configPath, "utf8"));
  const socket = join(
    "/tmp",
    "aburii-local-" +
      createHash("sha256").update(root).digest("hex").slice(0, 12),
  );
  if (
    c.marker !== "aburii-local-development-v1" ||
    c.root !== root ||
    c.socket !== socket ||
    c.databaseDirectory !== join(state, "postgres") ||
    c.databasePort !== 55441 ||
    c.apiPort !== 3112 ||
    c.appPort !== 3100 ||
    !c.anonKey ||
    !c.serviceKey
  )
    throw Error("Local development configuration failed validation.");
  return c;
}
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}
export function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const literal = (value) =>
  value === null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
export function databaseEnvironment(c) {
  return {
    PATH: process.env.PATH,
    HOME: homedir(),
    LANG: "en_US.UTF-8",
    TZ: "Asia/Kuala_Lumpur",
    PGHOST: c.socket,
    PGPORT: String(c.databasePort),
    PGUSER: "aburii_dev",
    PGDATABASE: "postgres",
    PGPASSFILE: "/dev/null",
    PGSERVICEFILE: "/dev/null",
    PGOPTIONS: "",
  };
}
export function sqlSync(c, sql) {
  const result = spawnSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    env: databaseEnvironment(c),
    input: sql,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw Error("Isolated local database operation failed.");
  return result.stdout.trim();
}
export async function sql(c, query) {
  return await new Promise((resolve, reject) => {
    const p = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: databaseEnvironment(c),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      size = 0;
    const timeout = setTimeout(() => {
      p.kill();
      reject(Error("Local database timeout."));
    }, 12000);
    p.on("error", () => {
      clearTimeout(timeout);
      reject(Error("Local database unavailable."));
    });
    p.stdout.on("data", (part) => {
      size += part.length;
      if (size > 8 * 1024 * 1024) p.kill();
      else out += part;
    });
    p.stderr.resume();
    p.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(Error("Local database request failed."));
      else resolve(out.trim());
    });
    p.stdin.end(query);
  });
}
export function run(program, args, options = {}) {
  const r = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (r.status !== 0)
    throw Error(
      `${program} failed. Check that PostgreSQL tools are installed and local ports are available.`,
    );
  return r.stdout;
}
export function startDatabase(c) {
  privateDirectory(c.socket);
  const status = spawnSync("pg_ctl", ["-D", c.databaseDirectory, "status"], {
    encoding: "utf8",
  });
  if (status.status !== 0)
    run("pg_ctl", [
      "-D",
      c.databaseDirectory,
      "-l",
      join(state, "postgres.log"),
      "-o",
      `-h '' -p ${c.databasePort} -k ${c.socket}`,
      "start",
    ]);
  const marker = sqlSync(
    c,
    "select value from local_auth.metadata where key='identity';",
  );
  if (marker !== c.databaseIdentity)
    throw Error("Unexpected local database identity.");
}

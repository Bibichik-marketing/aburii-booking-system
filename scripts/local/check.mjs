// Verifies this account without printing passwords, API keys, access or refresh tokens.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  config,
  credentialsPath,
  configPath,
  sql,
  literal,
  digest,
  root,
} from "./core.mjs";
const c = config(),
  credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
const base = "http://localhost:3100",
  backend = `http://127.0.0.1:${c.apiPort}`;
let cookie = "";
function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function staff(payload, session = cookie) {
  const r = await fetch(`${base}/api/staff`, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(payload ? { Origin: base, "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  return r;
}
try {
  assert.equal(statSync(credentialsPath).mode & 0o777, 0o600);
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal((await staff()).status, 401);
  assert.equal(
    (
      await staff({
        action: "login",
        email: credentials.email,
        password: "intentionally-wrong-password",
      })
    ).status,
    401,
  );
  const login = await staff({
    action: "login",
    email: credentials.email,
    password: credentials.password,
  });
  assert.equal(login.status, 200);
  cookie = cookiesFrom(login);
  assert.ok(
    login.headers
      .getSetCookie()
      .every(
        (value) =>
          value.includes("HttpOnly") && value.includes("SameSite=strict"),
      ),
  );
  const dataResponse = await staff();
  assert.equal(dataResponse.status, 200);
  const data = await dataResponse.json();
  assert.equal(data.role, "admin");
  assert.ok(data.bookings.length >= 6);
  assert.ok(data.bookings.every((b) => b.name.startsWith("DEMO")));
  const forged = await fetch(`${backend}/rest/v1/rpc/aburii_staff_data`, {
    method: "POST",
    headers: {
      apikey: c.anonKey,
      Authorization: "Bearer forged-access-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(forged.status, 401);
  const noKey = await fetch(`${backend}/rest/v1/rpc/aburii_staff_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(noKey.status, 401);
  const crossOrigin = await fetch(
    `${backend}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: c.anonKey,
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  assert.equal(crossOrigin.status, 403);
  const settings = await staff({
    action: "config",
    config: data.config,
    version: data.version,
  });
  assert.equal(settings.status, 200);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 2 * 86400000));
  const availability = await fetch(
    `${base}/api/availability?date=${day}&area=private&guests=2`,
  );
  assert.equal(availability.status, 200);
  const available = await availability.json();
  assert.ok(available.slots.length);
  const id = randomUUID();
  const created = await fetch(`${base}/api/reservations`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      area: "private",
      start: available.slots[0].start,
      guests: 2,
      name: "DEMO Authentication Check",
      phone: "+12025550102",
      email: "dev-check@example.invalid",
      requests: "Synthetic local integration check.",
      consent: true,
      whatsapp: false,
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await staff({
        action: "status",
        id,
        expected: "pending",
        status: "confirmed",
      })
    ).status,
    200,
  );
  const after = await (await staff()).json();
  const b = after.bookings.find((b) => b.id === id);
  assert.equal(b.status, "confirmed");
  const alternate = data.config.rooms.find((r) => r.id !== b.room);
  assert.ok(alternate);
  assert.equal(
    (await staff({ action: "assign", id, room: alternate.id })).status,
    200,
  );
  assert.equal(
    (
      await staff({
        action: "status",
        id,
        expected: "confirmed",
        status: "cancelled",
      })
    ).status,
    200,
  );
  const audit = JSON.parse(
    await sql(
      c,
      `select json_build_object('events',count(*),'actors',count(actor)) from aburii.audit where booking_id=${literal(id)}::uuid;`,
    ),
  );
  assert.ok(audit.events >= 4);
  assert.ok(audit.actors >= 3);
  const refresh = await staff({ action: "refresh" });
  assert.equal(refresh.status, 200);
  const oldCookie = cookie;
  cookie = cookiesFrom(refresh);
  assert.notEqual(cookie, oldCookie);
  assert.equal((await staff(undefined, oldCookie)).status, 401);
  assert.equal((await staff()).status, 200);
  assert.equal((await staff({ action: "logout" })).status, 200);
  assert.equal((await staff()).status, 401);
  assert.equal(await sql(c, "select count(*) from aburii.outbox;"), "0");
  const prod = spawnSync(process.execPath, ["scripts/local/start.mjs"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
  });
  assert.notEqual(prod.status, 0);
  assert.match(prod.stderr, /refuse NODE_ENV=production/);
  const credentialOutput = spawnSync(
    process.execPath,
    ["scripts/local/credentials.mjs"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(credentialOutput.status, 1);
  assert.ok(!credentialOutput.stdout.includes(credentials.password));
  console.log(
    "PASS: private file permissions; unauthorized/wrong-password rejection; real Admin login; role check; synthetic-only data; API-key and origin protection; settings save; reservation creation/confirm/room assignment/cancel; database audit; refresh rotation; logout/revocation; no queued messages; production guard; noninteractive secret-output refusal.",
  );
} catch {
  console.error(
    "Local development verification failed. No credentials were printed.",
  );
  process.exitCode = 1;
}

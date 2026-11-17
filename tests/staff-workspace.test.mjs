import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
if (
  process.env.ABURII_DISPOSABLE_TEST !== "yes" ||
  !process.env.PGHOST?.includes("aburii-db-tests-")
)
  throw Error("Use npm test with the isolated database.");
const admin = "00000000-0000-4000-8000-000000000001",
  staff = "00000000-0000-4000-8000-000000000002";
const q = (v) => (v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const rpc = (name, args = "", user = admin, role = "authenticated") =>
  JSON.parse(
    sql(
      `set role ${role};set request.jwt.claim.sub=${q(user)};select public.${name}(${args});`,
    ),
  );
const list = (p = {}) =>
  rpc(
    "aburii_staff_list",
    Object.entries(p)
      .map(([key, v]) => `${key}=>${q(v)}`)
      .join(","),
  );
function insert({
  id = randomUUID(),
  name = "DEMO Guest",
  reference = "AB-" + randomUUID(),
  area = "counter",
  status = "confirmed",
  start = "2020-01-01T18:00:00+08:00",
  end = new Date(Date.parse(start) + 7200000).toISOString(),
  expires = "2019-12-31T18:00:00+08:00",
  released = null,
  guests = 2,
  phone = "+60123456789",
} = {}) {
  sql(
    `insert into aburii.bookings(id,reference,area,room,starts_at,ends_at,guests,name,phone,status,expires_at,capacity_released_at,request_hash) values(${q(id)},${q(reference)},${q(area)},${area === "private" ? "'test-room'" : "null"},${q(start)},${q(end)},${guests},${q(name)},${q(phone)},${q(status)},${q(expires)},${q(released)},'synthetic');`,
  );
  return id;
}
beforeEach(() => {
  sql(
    `truncate aburii.outbox,aburii.audit,aburii.bookings,aburii.staff,auth.users;insert into auth.users values('${admin}'),('${staff}');insert into aburii.staff values('${admin}','admin',true),('${staff}','staff',true);`,
  );
});
test("all-date pagination includes history older than seven days and records beyond 2000", () => {
  sql(
    `insert into aburii.bookings(id,area,starts_at,ends_at,guests,name,phone,status,expires_at,request_hash) select gen_random_uuid(),'counter','2010-01-01'::timestamptz+make_interval(days=>n),'2010-01-01'::timestamptz+make_interval(days=>n,hours=>2),2,'DEMO Guest '||n,'+60123456789','completed',now(),'synthetic' from generate_series(1,2105) n;`,
  );
  const a = list({ p_size: 10, p_page: 1 }),
    b = list({ p_size: 10, p_page: 211 });
  assert.equal(a.total, 2105);
  assert.equal(a.bookings.length, 10);
  assert.equal(b.bookings.length, 5);
  assert.equal(
    new Set([...a.bookings, ...b.bookings].map((b) => b.id)).size,
    15,
  );
  assert.ok(!Object.hasOwn(a.bookings[0], "request_hash"));
});
test("search, inclusive MYT date range, effective status and seating filters work together", () => {
  const target = insert({
    name: "DEMO Alice",
    reference: "AB-ALICE",
    area: "private",
    start: "2026-01-02T00:00:00+08:00",
    end: "2026-01-02T02:00:00+08:00",
  });
  insert({ name: "DEMO Alice", start: "2026-01-01T23:59:59+08:00" });
  insert({
    name: "DEMO Alice",
    area: "private",
    status: "cancelled",
    start: "2026-01-02T18:00:00+08:00",
  });
  const p = {
    p_query: "alice",
    p_from: "2026-01-02",
    p_to: "2026-01-02",
    p_status: "confirmed",
    p_area: "private",
  };
  assert.equal(list(p).total, 1);
  assert.equal(list(p).bookings[0].id, target);
  assert.equal(list({ ...p, p_query: "AB-ALICE" }).total, 1);
  assert.equal(list({ ...p, p_query: "+60 12 345 6789" }).total, 1);
  assert.throws(() => list({ ...p, p_to: "2026-01-01" }));
});
test("pending expiry is represented as Expired without changing stored status", () => {
  const id = insert({ status: "pending" });
  assert.equal(list({ p_status: "pending" }).total, 0);
  assert.equal(list({ p_status: "expired" }).bookings[0].id, id);
  assert.equal(
    sql(`select status from aburii.bookings where id='${id}'`),
    "pending",
  );
});
test("sorting and clamped pagination are deterministic across pages", () => {
  for (let i = 0; i < 31; i++)
    insert({ name: "DEMO " + String(i).padStart(2, "0"), guests: i + 1 });
  const a = list({ p_sort: "name", p_order: "asc", p_size: 10 }),
    b = list({ p_sort: "name", p_order: "asc", p_size: 10, p_page: 2 });
  assert.equal(a.bookings[0].name, "DEMO 00");
  assert.equal(b.bookings[0].name, "DEMO 10");
  assert.equal(list({ p_page: 999, p_size: 10 }).page, 4);
  assert.equal(
    list({ p_sort: "guests", p_order: "desc" }).bookings[0].guests,
    31,
  );
});
test("admin archive and restore are audit-backed and do not modify reservation rows", () => {
  const id = insert({ status: "completed" });
  const before = sql(
    `select md5(to_jsonb(b)::text) from aburii.bookings b where id='${id}'`,
  );
  assert.throws(() => rpc("aburii_staff_archive", `${q(id)},true`, staff));
  assert.equal(rpc("aburii_staff_archive", `${q(id)},true`).ok, true);
  assert.equal(list({ p_archive: "archived" }).total, 1);
  assert.equal(list({ p_archive: "active" }).total, 0);
  assert.equal(list().total, 1);
  assert.equal(rpc("aburii_staff_detail", q(id), staff).archived, true);
  assert.equal(
    sql(
      `select md5(to_jsonb(b)::text) from aburii.bookings b where id='${id}'`,
    ),
    before,
  );
  rpc("aburii_staff_archive", `${q(id)},false`);
  assert.equal(list({ p_archive: "active" }).total, 1);
  assert.equal(
    sql(
      `select count(*) from aburii.audit where booking_id='${id}' and actor='${admin}'`,
    ),
    "2",
  );
});
test("archiving cannot hide a live or retained capacity commitment", () => {
  const id = insert({
    status: "cancelled",
    start: new Date(Date.now() - 3600000).toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.throws(() => rpc("aburii_staff_archive", `${q(id)},true`));
  const future = insert({
    start: new Date(Date.now() + 3600000).toISOString(),
    end: new Date(Date.now() + 7200000).toISOString(),
  });
  assert.throws(() => rpc("aburii_staff_archive", `${q(future)},true`));
  assert.equal(list({ p_archive: "archived" }).total, 0);
});
test("Today includes only arrivals on MYT today, with overnight occupancy separately", () => {
  const date = sql(
    "select (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date",
  );
  const previous = sql(`select '${date}'::date-1`),
    tomorrow = sql(`select '${date}'::date+1`);
  const id = insert({
    start: date + "T18:00:00+08:00",
    end: date + "T20:00:00+08:00",
  });
  const overnight = insert({
    start: previous + "T23:00:00+08:00",
    end: date + "T02:00:00+08:00",
  });
  insert({
    start: tomorrow + "T18:00:00+08:00",
    end: tomorrow + "T20:00:00+08:00",
  });
  const today = rpc("aburii_staff_today");
  assert.equal(today.date, date);
  assert.deepEqual(
    today.bookings.map((b) => b.id),
    [id],
  );
  assert.ok(today.occupancy.some((b) => b.id === overnight));
  assert.equal(
    new Set(today.bookings.map((b) => b.id)).size,
    today.bookings.length,
  );
});
test("new staff reads enforce membership and never expose public access", () => {
  for (const name of [
    "aburii_staff_context",
    "aburii_staff_list",
    "aburii_staff_today",
  ]) {
    assert.throws(() => rpc(name, "", admin, "anon"));
    assert.throws(() => rpc(name, "", admin, "service_role"));
    assert.throws(() => rpc(name, "", randomUUID()));
  }
  assert.ok(!Object.hasOwn(rpc("aburii_staff_context"), "bookings"));
  sql(`update aburii.staff set active=false where user_id='${staff}'`);
  assert.throws(() => rpc("aburii_staff_today", "", staff));
});
test("invalid sort, pagination and range inputs fail rather than becoming SQL", () => {
  for (const p of [
    { p_sort: "name;drop table aburii.bookings" },
    { p_size: 100000 },
    { p_page: 0 },
    { p_from: "2026-02-02", p_to: "2026-01-01" },
  ])
    assert.throws(() => list(p));
  assert.equal(list({ p_query: "%' or true --" }).total, 0);
});
test("expired pending requests may be archived without materializing a status change", () => {
  const id = insert({ status: "pending" });
  assert.equal(rpc("aburii_staff_archive", `${q(id)},true`).ok, true);
  assert.equal(
    sql(`select status from aburii.bookings where id='${id}'`),
    "pending",
  );
  assert.equal(list({ p_status: "expired", p_archive: "archived" }).total, 1);
});

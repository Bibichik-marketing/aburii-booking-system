import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  officialHours,
  launchDefaults,
  mondayClosed,
} from "../lib/operating-hours.mjs";
if (
  process.env.ABURII_DISPOSABLE_TEST !== "yes" ||
  !process.env.PGHOST?.includes("aburii-db-tests-")
)
  throw Error("Use npm test.");
const admin = "00000000-0000-4000-8000-000000000001";
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const rpc = (name, args = "", role = "service_role") =>
  JSON.parse(
    sql(
      `set role ${role};set request.jwt.claim.sub='${admin}';select public.${name}(${args});`,
    ) || "null",
  );
const future = (dow) =>
  sql(
    `select d::date from generate_series((clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+2,(clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+9,interval '1 day') d where extract(dow from d)=${dow} limit 1`,
  );
const localTime = (s) =>
  sql(
    `select to_char(${q(s)}::timestamptz at time zone 'Asia/Kuala_Lumpur','HH24:MI')`,
  );
const base = () => ({
  ...launchDefaults,
  operatingHours: officialHours,
  hoursPolicyVersion: "aburii-official-v1",
  counter: {
    enabled: true,
    capacity: 8,
    min: 1,
    max: 8,
    duration: 120,
    minimumSpend: 0,
  },
  private: {
    enabled: true,
    capacity: 0,
    min: 2,
    max: 8,
    duration: 120,
    minimumSpend: 0,
  },
  rooms: [
    { id: "room-a", name: "Test Room A", capacity: 4, enabled: true },
    { id: "room-b", name: "Test Room B", capacity: 8, enabled: true },
  ],
  noticeMinutes: 0,
  advanceDays: 365,
  holdMinutes: 30,
  services: [],
  closures: [],
});
let c;
const configure = (config) =>
  rpc(
    "aburii_configure",
    `${q(JSON.stringify(config))}::jsonb,${sql("select version from aburii.settings")}`,
    "authenticated",
  );
const avail = (date, area = "counter", guests = 2) =>
  rpc("aburii_availability", `${q(date)}::date,${q(area)},${guests}`);
const book = (date, time = "18:00", area = "counter", guests = 2) =>
  rpc(
    "aburii_book",
    `${q(JSON.stringify({ id: randomUUID(), area, guests, start: `${date}T${time}:00+08:00`, name: "DEMO Hours Test", phone: "+12025550101", email: "", requests: "", consent: true, whatsapp: false }))}::jsonb`,
  );
function launch() {
  c.publicBookingsEnabled = true;
  c.capacitiesConfirmed = true;
  c.policiesConfirmed = true;
  configure(c);
}
beforeEach(() => {
  sql(
    `truncate aburii.outbox,aburii.audit,aburii.bookings,aburii.staff,auth.users;insert into auth.users values('${admin}');insert into aburii.staff values('${admin}','admin',true);`,
  );
  c = base();
  sql(`update aburii.settings set config=${q(JSON.stringify(c))}::jsonb;`);
});
test("official defaults match every approved service window and are fail-closed", () => {
  assert.deepEqual(
    JSON.parse(sql("select aburii.official_hours()")),
    officialHours,
  );
  assert.deepEqual(officialHours.find((d) => d.day === 1).periods, []);
  for (const d of [2, 3, 4, 5])
    assert.deepEqual(officialHours.find((h) => h.day === d).periods, [
      { start: "18:00", end: "22:30" },
    ]);
  for (const d of [0, 6])
    assert.equal(
      officialHours.find((h) => h.day === d).periods[0].end,
      "14:30",
    );
  assert.equal(avail(future(2)).bookingOpen, false);
  assert.equal(avail(future(2)).slots.length, 0);
  assert.throws(() => book(future(2)));
});
test("Monday cannot be booked, including forged explicit overrides", () => {
  launch();
  const d = future(1);
  assert.equal(mondayClosed(d), true);
  assert.equal(avail(d).closed, true);
  assert.equal(avail(d).slots.length, 0);
  c.services = [{ date: d, area: "counter", times: ["18:00"] }];
  configure(c);
  assert.throws(() => book(d));
  c.operatingHours = c.operatingHours.map((h) =>
    h.day === 1 ? { ...h, periods: [{ start: "18:00", end: "22:30" }] } : h,
  );
  assert.throws(() => configure(c));
});
test("weekdays offer dinner only and the latest two-hour arrival is 20:30", () => {
  launch();
  for (const day of [2, 3, 4, 5]) {
    const d = future(day),
      a = avail(d);
    assert.deepEqual(
      a.slots.map((s) => localTime(s.start)),
      ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"],
    );
    assert.equal(localTime(a.slots.at(-1).end), "22:30");
    assert.throws(() => book(d, "12:00"));
    assert.throws(() => book(d, "21:00"));
  }
});
test("weekends have separate lunch/dinner windows and reject dining across the lunch break", () => {
  launch();
  for (const day of [0, 6]) {
    const d = future(day),
      times = avail(d).slots.map((s) => localTime(s.start));
    assert.deepEqual(times, [
      "12:00",
      "12:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
    ]);
    assert.throws(() => book(d, "13:00"));
    assert.throws(() => book(d, "14:00"));
    assert.throws(() => book(d, "16:00"));
  }
});
test("arrival interval and independent area durations change the last valid arrival", () => {
  launch();
  c.arrivalInterval = 15;
  c.counter.duration = 90;
  c.private.duration = 180;
  configure(c);
  const d = future(6);
  const counter = avail(d),
    room = avail(d, "private");
  assert.ok(counter.slots.some((s) => localTime(s.start) === "13:00"));
  assert.equal(
    counter.slots.some((s) => localTime(s.start) === "13:15"),
    false,
  );
  assert.equal(
    room.slots.some((s) => localTime(s.start) === "12:00"),
    false,
  );
  assert.equal(localTime(room.slots.at(-1).start), "19:30");
  c.arrivalInterval = 60;
  configure(c);
  assert.deepEqual(
    avail(future(2)).slots.map((s) => localTime(s.start)),
    ["18:00", "19:00", "20:00", "21:00"],
  );
});
test("explicit start-time overrides cannot run past closing or cross service breaks", () => {
  launch();
  const d = future(6);
  c.services = [
    {
      date: d,
      area: "counter",
      times: ["12:30", "13:00", "17:00", "20:30", "21:00"],
    },
  ];
  configure(c);
  assert.deepEqual(
    avail(d).slots.map((s) => localTime(s.start)),
    ["12:30", "20:30"],
  );
  assert.throws(() => book(d, "13:00"));
  assert.equal(book(d, "20:30").status, "pending");
});
test("counter occupancy and compatible private rooms remain independent", () => {
  launch();
  const d = future(2);
  book(d, "18:00", "counter", 8);
  assert.equal(
    avail(d, "counter", 1).slots.some((s) => localTime(s.start) === "18:00"),
    false,
  );
  assert.equal(
    avail(d, "private", 2).slots.some((s) => localTime(s.start) === "18:00"),
    true,
  );
  book(d, "18:00", "private", 4);
  book(d, "18:00", "private", 8);
  assert.equal(
    avail(d, "private", 2).slots.some((s) => localTime(s.start) === "18:00"),
    false,
  );
});
test("capacity and policy confirmations are mandatory before public launch", () => {
  c.publicBookingsEnabled = true;
  assert.throws(() => configure(c));
  c.capacitiesConfirmed = true;
  assert.throws(() => configure(c));
  c.policiesConfirmed = true;
  c.counter.capacity = 0;
  assert.throws(() => configure(c));
  c.counter.capacity = 8;
  assert.equal(configure(c).ok, true);
  c.publicBookingsEnabled = false;
  configure(c);
  assert.throws(() => book(future(2)));
});
test("changing hours and launch gate preserves existing reservation intervals, status and commitments", () => {
  launch();
  const d = future(2);
  book(d, "20:30");
  const before = sql(
    "select md5(jsonb_agg(to_jsonb(b) order by id)::text) from aburii.bookings b",
  );
  c.operatingHours = c.operatingHours.map((h) =>
    h.day === 2 ? { ...h, periods: [{ start: "18:00", end: "21:00" }] } : h,
  );
  c.publicBookingsEnabled = false;
  configure(c);
  assert.equal(
    sql(
      "select md5(jsonb_agg(to_jsonb(b) order by id)::text) from aburii.bookings b",
    ),
    before,
  );
  assert.equal(avail(d).slots.length, 0);
});
test("special closures and date-specific empty overrides remain enforced", () => {
  launch();
  const d = future(2);
  c.services = [{ date: d, area: "private", times: [] }];
  c.closures = [
    {
      area: "counter",
      start: `${d}T19:00:00+08:00`,
      end: `${d}T20:00:00+08:00`,
    },
  ];
  configure(c);
  assert.equal(avail(d, "private").slots.length, 0);
  assert.deepEqual(
    avail(d).slots.map((s) => localTime(s.start)),
    ["20:00", "20:30"],
  );
});
test("first migration disables public launch and preserves legacy out-of-hours reservations", () => {
  const id = randomUUID(),
    d = future(1);
  sql(
    `insert into aburii.bookings(id,area,starts_at,ends_at,guests,name,phone,status,expires_at,request_hash) values('${id}','counter','${d}T21:00:00+08:00','${d}T23:00:00+08:00',2,'DEMO Legacy Monday','+12025550101','confirmed',now(),'legacy');update aburii.settings set config=(config-'hoursPolicyVersion')||'{"publicBookingsEnabled":true,"capacitiesConfirmed":true,"policiesConfirmed":true}'::jsonb;`,
  );
  const before = sql(
    "select md5(jsonb_agg(to_jsonb(b) order by id)::text) from aburii.bookings b",
  );
  execFileSync(
    "psql",
    [
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "supabase/003_operating_hours.sql",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const installed = JSON.parse(sql("select config from aburii.settings"));
  assert.equal(installed.publicBookingsEnabled, false);
  assert.equal(installed.capacitiesConfirmed, false);
  assert.equal(installed.policiesConfirmed, false);
  assert.deepEqual(installed.operatingHours, officialHours);
  assert.equal(
    sql(
      "select md5(jsonb_agg(to_jsonb(b) order by id)::text) from aburii.bookings b",
    ),
    before,
  );
});
test("reapplying the migration is idempotent and the legacy validator is not directly callable", () => {
  c.arrivalInterval = 15;
  configure(c);
  const before = sql(
    "select md5(config::text)||version::text from aburii.settings",
  );
  execFileSync(
    "psql",
    [
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "supabase/003_operating_hours.sql",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(
    sql("select md5(config::text)||version::text from aburii.settings"),
    before,
  );
  assert.throws(() =>
    sql(
      `set role authenticated;select aburii.configure_base(${q(JSON.stringify(c))}::jsonb,1)`,
    ),
  );
});

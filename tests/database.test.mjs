import { officialHours, launchDefaults } from "../lib/operating-hours.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
if (
  process.env.ABURII_DISPOSABLE_TEST !== "yes" ||
  !process.env.PGHOST?.includes("aburii-db-tests-")
)
  throw Error("Use npm test; an isolated test database is required.");
const admin = "00000000-0000-4000-8000-000000000001",
  staff = "00000000-0000-4000-8000-000000000002",
  manager = "00000000-0000-4000-8000-000000000003";
const quote = (x) => `'${String(x).replaceAll("'", "''")}'`;
function sql(s) {
  return execFileSync(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", s],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
function rpc(name, args, role = "service_role", uid = "") {
  const value = sql(
    `set role ${role};set request.jwt.claim.sub=${quote(uid)};select public.${name}(${args});`,
  );
  return value === "t"
    ? true
    : value === "f"
      ? false
      : JSON.parse(value || "null");
}
function asyncSql(s) {
  return new Promise((resolve) => {
    const p = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", s]);
    let out = "",
      err = "";
    p.stdout.on("data", (v) => (out += v));
    p.stderr.on("data", (v) => (err += v));
    p.on("exit", (code) => resolve({ code, out: out.trim(), err }));
  });
}
const date = () =>
  sql(
    "select ((now() at time zone 'Asia/Kuala_Lumpur')::date+2+case when extract(dow from (now() at time zone 'Asia/Kuala_Lumpur')::date+2)=1 then 1 else 0 end)::text",
  );
const config = () => ({
  ...launchDefaults,
  publicBookingsEnabled: true,
  capacitiesConfirmed: true,
  policiesConfirmed: true,
  operatingHours: officialHours.map((d) => ({
    ...d,
    periods: d.day === 1 ? [] : [{ start: "00:00", end: "23:59" }],
  })),
  counter: {
    enabled: true,
    capacity: 6,
    min: 1,
    max: 6,
    duration: 120,
    minimumSpend: 0,
  },
  private: {
    enabled: true,
    capacity: 0,
    min: 2,
    max: 10,
    duration: 120,
    minimumSpend: 300,
  },
  rooms: [
    { id: "small", name: "Small", capacity: 4, enabled: true },
    { id: "large", name: "Large", capacity: 8, enabled: true },
  ],
  noticeMinutes: 0,
  advanceDays: 30,
  holdMinutes: 30,
  services: ["counter", "private"].map((area) => ({
    date: date(),
    area,
    times: ["12:00", "13:00", "14:00", "15:00", "16:00", "18:00"],
  })),
  closures: [],
});
const request = (extra = {}) => ({
  id: randomUUID(),
  start: `${date()}T12:00:00+08:00`,
  area: "counter",
  guests: 3,
  name: "Synthetic Guest",
  phone: "+60123456789",
  email: "",
  requests: "",
  consent: true,
  whatsapp: false,
  ...extra,
});
const book = (p) => rpc("aburii_book", `${quote(JSON.stringify(p))}::jsonb`);
const avail = (area = "counter", guests = 3) =>
  rpc("aburii_availability", `${quote(date())}::date,${quote(area)},${guests}`);
const status = (p, next, expected = "pending", uid = staff) =>
  rpc(
    "aburii_status",
    `${quote(p.id)}::uuid,${quote(expected)},${quote(next)}`,
    "authenticated",
    uid,
  );
const configure = (c) =>
  rpc(
    "aburii_configure",
    `${quote(JSON.stringify(c))}::jsonb,${sql("select version from aburii.settings")}`,
    "authenticated",
    admin,
  );
beforeEach(() => {
  sql(
    `truncate aburii.outbox,aburii.audit,aburii.bookings,aburii.staff,auth.users,aburii.rates;insert into auth.users values('${admin}'),('${staff}'),('${manager}');insert into aburii.staff values('${admin}','admin',true),('${staff}','staff',true),('${manager}','manager',true);update aburii.settings set config=${quote(JSON.stringify(config()))}::jsonb;`,
  );
});
test("anonymous and service clients cannot read tables or staff functions", () => {
  assert.throws(() => sql("set role anon;select * from aburii.bookings"));
  assert.throws(() =>
    rpc("aburii_book", `${quote(JSON.stringify(request()))}::jsonb`, "anon"),
  );
  assert.throws(() =>
    rpc(
      "aburii_staff_data",
      "",
      "authenticated",
      "00000000-0000-4000-8000-000000000099",
    ),
  );
  assert.throws(() => rpc("aburii_staff_data", "", "service_role"));
  assert.throws(() => sql("set role authenticated;select * from aburii.staff"));
  assert.throws(() =>
    sql(
      "set role service_role;insert into aburii.bookings(id) values(gen_random_uuid())",
    ),
  );
});
test("starts closed with no configured capacity", () => {
  const c = config();
  c.counter.enabled = false;
  configure(c);
  assert.equal(avail().slots.length, 0);
  assert.throws(() => book(request()));
});
test("overlapping counter reservations respect guest capacity; adjacent intervals are allowed", () => {
  book(request({ guests: 4 }));
  assert.throws(() =>
    book(request({ start: `${date()}T13:00:00+08:00`, guests: 3 })),
  );
  assert.equal(
    book(request({ start: `${date()}T14:00:00+08:00`, guests: 6 })).status,
    "pending",
  );
});
test("counter capacity uses peak occupancy instead of overcounting sequential overlaps", () => {
  book(request({ guests: 3 }));
  book(request({ start: `${date()}T14:00:00+08:00`, guests: 3 }));
  assert.equal(
    book(request({ start: `${date()}T13:00:00+08:00`, guests: 3 })).status,
    "pending",
  );
});
test("parallel requests cannot oversell counter capacity", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      asyncSql(
        `set role service_role;select public.aburii_book(${quote(JSON.stringify(request({ guests: 2 })))}::jsonb)`,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.code === 0).length, 3);
  assert.equal(Number(sql("select sum(guests) from aburii.bookings")), 6);
});
test("private inventory is independent; compatible rooms are exclusively allocated", () => {
  book(request({ guests: 6 }));
  const a = request({ area: "private", guests: 4 }),
    b = request({ area: "private", guests: 8 });
  book(a);
  book(b);
  assert.equal(
    sql(`select room from aburii.bookings where id='${a.id}'`),
    "small",
  );
  assert.equal(
    sql(`select room from aburii.bookings where id='${b.id}'`),
    "large",
  );
  assert.throws(() => book(request({ area: "private", guests: 2 })));
  assert.equal(avail("private", 9).slots.length, 0);
});
test("parallel private requests cannot share the same room", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      asyncSql(
        `set role service_role;select public.aburii_book(${quote(JSON.stringify(request({ area: "private", guests: 8 })))}::jsonb)`,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.code === 0).length, 1);
});
test("pending expiry releases availability and cannot be confirmed", () => {
  const p = request({ guests: 6 });
  book(p);
  assert.equal(avail().slots.length, 4);
  sql(
    `update aburii.bookings set expires_at=now()-interval '1 second' where id='${p.id}'`,
  );
  assert.equal(avail().slots.length, 6);
  assert.throws(() => status(p, "confirmed"));
  assert.equal(book(request({ guests: 6 })).status, "pending");
});
test("cancellation before seating frees future capacity", () => {
  const p = request({ guests: 6 });
  book(p);
  status(p, "confirmed");
  status(p, "cancelled", "confirmed");
  assert.equal(book(request({ guests: 6 })).status, "pending");
  assert.throws(() => status(p, "confirmed", "cancelled"));
});
test("completed dining retains its original interval", () => {
  const p = request({ guests: 6 });
  book(p);
  sql(`update aburii.bookings set status='seated' where id='${p.id}'`);
  status(p, "completed", "seated");
  assert.throws(() => book(request()));
});
test("room reassignment checks capacity and overlapping bookings", () => {
  const a = request({ area: "private", guests: 3 }),
    b = request({ area: "private", guests: 6 });
  book(a);
  book(b);
  assert.throws(() =>
    rpc("aburii_assign", `'${a.id}','large'`, "authenticated", staff),
  );
  assert.throws(() =>
    rpc("aburii_assign", `'${b.id}','small'`, "authenticated", staff),
  );
  status(b, "cancelled");
  assert.equal(
    rpc("aburii_assign", `'${a.id}','large'`, "authenticated", staff).ok,
    true,
  );
});
test("retries return the same reference; changed payload cannot reuse a request ID", async () => {
  const p = request();
  const a = book(p);
  assert.equal(book(p).reference, a.reference);
  assert.equal(Number(sql("select count(*) from aburii.bookings")), 1);
  assert.throws(() => book({ ...p, guests: 1 }));
});
test("configuration requires admin and detects stale updates", () => {
  const c = config();
  assert.throws(() =>
    rpc(
      "aburii_configure",
      `${quote(JSON.stringify(c))}::jsonb,1`,
      "authenticated",
      staff,
    ),
  );
  assert.throws(() =>
    rpc(
      "aburii_configure",
      `${quote(JSON.stringify(c))}::jsonb,1`,
      "authenticated",
      manager,
    ),
  );
  assert.throws(() =>
    rpc(
      "aburii_configure",
      `${quote(JSON.stringify(c))}::jsonb,-1`,
      "authenticated",
      admin,
    ),
  );
  assert.equal(configure(c).ok, true);
});
test("inventory edits cannot invalidate existing allocations", () => {
  book(request());
  const c = config();
  c.counter.capacity = 1;
  assert.throws(() => configure(c));
  c.counter.capacity = 6;
  c.rooms = [];
  assert.throws(() => configure(c));
});
test("special date hours replace weekly hours, including all-day closure", () => {
  const c = config();
  c.services = [
    {
      day: Number(sql(`select extract(dow from '${date()}'::date)`)),
      area: "counter",
      times: ["12:00"],
    },
    { date: date(), area: "counter", times: [] },
  ];
  configure(c);
  assert.equal(avail().slots.length, 0);
  c.services[1].times = ["18:00"];
  configure(c);
  assert.equal(avail().slots.length, 1);
  assert.match(avail().slots[0].start, /10:00:00\+00:00|18:00:00\+08:00/);
});
test("closures apply to the whole dining interval and only the chosen area", () => {
  const c = config();
  c.closures = [
    {
      area: "counter",
      start: `${date()}T13:30:00+08:00`,
      end: `${date()}T14:00:00+08:00`,
    },
  ];
  configure(c);
  assert.equal(avail().slots.length, 4);
  assert.equal(avail("private", 3).slots.length, 6);
});
test("notice, horizon, party size and nonconfigured times are enforced inside the database", () => {
  const c = config();
  c.advanceDays = 1;
  configure(c);
  assert.equal(avail().slots.length, 0);
  assert.throws(() => book(request()));
  c.advanceDays = 30;
  c.noticeMinutes = 43200;
  configure(c);
  assert.equal(avail().slots.length, 0);
  c.noticeMinutes = 0;
  configure(c);
  assert.equal(avail("counter", 7).slots.length, 0);
  assert.throws(() => book(request({ start: `${date()}T12:17:00+08:00` })));
});
test("revoked staff lose access and all status changes are audited", () => {
  const p = request();
  book(p);
  status(p, "confirmed");
  assert.equal(
    sql("select count(*) from aburii.audit where event='status_changed'"),
    "1",
  );
  sql(`update aburii.staff set active=false where user_id='${staff}'`);
  assert.throws(() => rpc("aburii_staff_data", "", "authenticated", staff));
});
test("minimum spend is snapshotted, and opt-in notifications are transactional", () => {
  const p = request({ area: "private", guests: 3, whatsapp: true });
  assert.equal(book(p).minimumSpend, 300);
  assert.equal(sql("select count(*) from aburii.outbox"), "1");
  book(p);
  assert.equal(sql("select count(*) from aburii.outbox"), "1");
  status(p, "confirmed");
  assert.equal(sql("select count(*) from aburii.outbox"), "2");
  const jobs = rpc("aburii_claim_notifications", "");
  assert.equal(jobs.length, 1);
  assert.equal(rpc("aburii_claim_notifications", "").length, 0);
  rpc(
    "aburii_finish_notification",
    `'${jobs[0].id}','${randomUUID()}',true,null`,
  );
  assert.equal(
    sql("select count(*) from aburii.outbox where delivered_at is not null"),
    "0",
  );
  rpc(
    "aburii_finish_notification",
    `'${jobs[0].id}','${jobs[0].lease}',true,null`,
  );
  assert.equal(
    sql("select count(*) from aburii.outbox where delivered_at is not null"),
    "1",
  );
});
test("rate limiting is persisted and shared across callers", () => {
  const key = "a".repeat(64);
  assert.equal(rpc("aburii_rate_limit", `'${key}',2`), true);
  assert.equal(rpc("aburii_rate_limit", `'${key}',2`), true);
  assert.equal(rpc("aburii_rate_limit", `'${key}',2`), false);
});
test("expiry maintenance queues only the current expiry notification", () => {
  const p = request({ whatsapp: true });
  book(p);
  sql(
    `update aburii.bookings set expires_at=now()-interval '1 minute' where id='${p.id}'`,
  );
  rpc("aburii_expire_holds", "");
  assert.equal(
    sql(`select status from aburii.bookings where id='${p.id}'`),
    "expired",
  );
  const jobs = rpc("aburii_claim_notifications", "");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].event, "expired");
  assert.equal(
    sql("select count(*) from aburii.outbox where discarded_at is not null"),
    "1",
  );
});
test("concurrent duplicate requests persist only one reservation", async () => {
  const p = request();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      asyncSql(
        `set role service_role;select public.aburii_book(${quote(JSON.stringify(p))}::jsonb)`,
      ),
    ),
  );
  assert.ok(results.every((r) => r.code === 0));
  assert.equal(
    new Set(results.map((r) => JSON.parse(r.out).reference)).size,
    1,
  );
  assert.equal(sql("select count(*) from aburii.bookings"), "1");
});
test("database rejects incomplete configuration and invalid customer input", () => {
  const c = config();
  c.counter.min = null;
  assert.throws(() => configure(c));
  assert.throws(() => book(request({ phone: "123" })));
  assert.throws(() => book(request({ consent: false })));
  assert.throws(() => book(request({ name: "A" })));
  assert.equal(sql("select count(*) from aburii.bookings"), "0");
});

function serviceDayForTest(s) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(s));
}
// Build a real current dining interval, then attempt a configured overlapping booking.
function startedBooking(
  area,
  initial = "confirmed",
  expiresBeforeStart = false,
) {
  const p = request({ area, guests: area === "counter" ? 6 : 8 });
  book(p);
  sql(
    `update aburii.bookings set starts_at=now()-interval '15 minutes',ends_at=now()+interval '3 hours',expires_at=now()-interval '${expiresBeforeStart ? "30" : "15"} minutes',status=${quote(initial)} where id='${p.id}'`,
  );
  // Align expiry exactly with original start for the at-start hold-expiry case.
  if (!expiresBeforeStart)
    sql(`update aburii.bookings set expires_at=starts_at where id='${p.id}'`);
  const service = JSON.parse(
    sql(
      `select json_build_object('date',((now()+interval '1 hour') at time zone 'Asia/Kuala_Lumpur')::date,'time',to_char((now()+interval '1 hour') at time zone 'Asia/Kuala_Lumpur','HH24:MI'),'start',date_trunc('minute',now()+interval '1 hour'))`,
    ),
  );
  const c = config();
  c[area].duration = 15;
  if (new Date(service.date + "T12:00:00+08:00").getUTCDay() === 1) {
    service.start = new Date(
      Date.parse(service.start) + 86400000,
    ).toISOString();
    service.date = serviceDayForTest(service.start);
  }
  service.time = service.time.slice(0, 2) + ":00";
  service.start = `${service.date}T${service.time}:00+08:00`;
  sql(
    `update aburii.bookings set ends_at=${quote(service.start)}::timestamptz+interval '3 hours' where id='${p.id}'`,
  );
  c.services = [{ date: service.date, area, times: [service.time] }];
  configure(c);
  return {
    p,
    overlap: request({
      area,
      guests: area === "counter" ? 1 : 8,
      start: service.start,
    }),
  };
}
for (const area of ["counter", "private"]) {
  for (const terminal of ["cancelled", "no_show", "completed"]) {
    test(`${area}: ${terminal} after scheduled start retains original capacity`, () => {
      const initial = terminal === "completed" ? "seated" : "confirmed";
      const { p, overlap } = startedBooking(area, initial);
      status(p, terminal, initial);
      assert.throws(() => book(overlap));
      assert.equal(
        sql(
          `select capacity_released_at is null from aburii.bookings where id='${p.id}'`,
        ),
        "t",
      );
    });
  }
  test(`${area}: expiry exactly at scheduled start retains original capacity`, () => {
    const { p, overlap } = startedBooking(area, "pending");
    rpc("aburii_expire_holds", "");
    assert.equal(
      sql(`select status from aburii.bookings where id='${p.id}'`),
      "expired",
    );
    assert.throws(() => book(overlap));
  });
  test(`${area}: expiry before scheduled start releases capacity even when materialized later`, () => {
    const { p, overlap } = startedBooking(area, "pending", true);
    rpc("aburii_expire_holds", "");
    assert.equal(
      sql(
        `select capacity_released_at<starts_at from aburii.bookings where id='${p.id}'`,
      ),
      "t",
    );
    assert.equal(book(overlap).status, "pending");
  });
  test(`${area}: rejected before scheduled start releases capacity`, () => {
    const p = request({ area, guests: area === "counter" ? 6 : 8 });
    book(p);
    status(p, "declined");
    assert.equal(
      book(request({ area, guests: area === "counter" ? 6 : 8 })).status,
      "pending",
    );
    assert.equal(
      sql(
        `select capacity_released_at<starts_at from aburii.bookings where id='${p.id}'`,
      ),
      "t",
    );
  });
}
test("staff cannot reassign a private room once its scheduled interval starts", () => {
  const { p } = startedBooking("private");
  assert.throws(() =>
    rpc("aburii_assign", `'${p.id}','large'`, "authenticated", staff),
  );
});
test("an overlapping room cannot be reassigned into a post-start cancelled room", () => {
  const { p, overlap } = startedBooking("private");
  status(p, "cancelled", "confirmed");
  const other = { ...overlap, guests: 2 };
  book(other);
  assert.throws(() =>
    rpc("aburii_assign", `'${other.id}','large'`, "authenticated", staff),
  );
});
for (const area of ["counter", "private"])
  test(`${area}: pre-start release remains released after original start passes`, () => {
    const { p, overlap } = startedBooking(area);
    sql(
      `update aburii.bookings set status='cancelled',capacity_released_at=starts_at-interval '1 minute' where id='${p.id}'`,
    );
    assert.equal(book(overlap).status, "pending");
  });

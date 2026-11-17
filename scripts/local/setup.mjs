import { officialHours, launchDefaults } from "../../lib/operating-hours.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  developmentOnly,
  root,
  state,
  configPath,
  credentialsPath,
  privateDirectory,
  savePrivate,
  token,
  passwordHash,
  literal,
  run,
  sqlSync,
  config,
  startDatabase,
} from "./core.mjs";
developmentOnly();
privateDirectory(state);
if (existsSync(configPath)) {
  const c = config();
  startDatabase(c);
  console.log(
    "Aburii local development is already initialized. Existing account/data were preserved.",
  );
  console.log(
    "Start: npm run local:start\nCredentials: npm run local:credentials",
  );
  process.exit(0);
}
const socket =
  "/tmp/aburii-local-" +
  createHash("sha256").update(root).digest("hex").slice(0, 12);
privateDirectory(socket);
const c = {
  marker: "aburii-local-development-v1",
  root,
  socket,
  databaseDirectory: join(state, "postgres"),
  databasePort: 55441,
  apiPort: 3112,
  appPort: 3100,
  databaseIdentity: token(),
  anonKey: token(),
  serviceKey: token(),
  rateLimitSecret: token(),
};
if (existsSync(c.databaseDirectory))
  throw Error(
    "A local database directory already exists without its configuration. Refusing to overwrite it.",
  );
run("initdb", [
  "-D",
  c.databaseDirectory,
  "-A",
  "trust",
  "-U",
  "aburii_dev",
  "--no-locale",
  "-E",
  "UTF8",
]);
run("pg_ctl", [
  "-D",
  c.databaseDirectory,
  "-l",
  join(state, "postgres.log"),
  "-o",
  `-h '' -p ${c.databasePort} -k ${c.socket}`,
  "start",
]);
sqlSync(
  c,
  `create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema local_auth;
create table local_auth.metadata(key text primary key,value text not null);
create table local_auth.users(id uuid primary key references auth.users(id),email text unique not null,password_hash text not null,salt text not null);
create table local_auth.sessions(id uuid primary key,user_id uuid not null references local_auth.users(id),access_hash text unique not null,refresh_hash text unique not null,expires_at timestamptz not null,refresh_expires_at timestamptz not null,revoked boolean not null default false);
revoke all on schema local_auth from public,anon,authenticated,service_role;
insert into local_auth.metadata values('identity',${literal(c.databaseIdentity)});`,
);
sqlSync(c, readFileSync(join(root, "supabase/001_aburii.sql"), "utf8"));
sqlSync(
  c,
  readFileSync(join(root, "supabase/002_staff_workspace.sql"), "utf8"),
);
sqlSync(
  c,
  "insert into local_auth.metadata(key,value) values('migration:002_staff_workspace','applied') on conflict(key) do nothing;",
);
sqlSync(
  c,
  readFileSync(join(root, "supabase/003_operating_hours.sql"), "utf8"),
);
sqlSync(
  c,
  "insert into local_auth.metadata(key,value) values('migration:003_operating_hours','applied') on conflict(key) do nothing;",
);
const id = randomUUID(),
  email = "admin@aburii.test",
  password = randomBytes(24).toString("base64url"),
  salt = token();
sqlSync(
  c,
  `begin;insert into auth.users values(${literal(id)}::uuid);insert into local_auth.users values(${literal(id)}::uuid,${literal(email)},${literal(passwordHash(password, salt))},${literal(salt)});insert into aburii.staff(user_id,role) values(${literal(id)}::uuid,'admin');commit;`,
);
// Entirely synthetic inventory; never represents the restaurant's actual capacities.
const settingsVersion = sqlSync(
  c,
  "select version from aburii.settings where id;",
);
const inventory = {
  ...launchDefaults,
  operatingHours: officialHours,
  counter: {
    enabled: true,
    capacity: 16,
    min: 1,
    max: 12,
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
    { id: "dev-sakura", name: "DEMO · Sakura", capacity: 6, enabled: true },
    { id: "dev-kaede", name: "DEMO · Kaede", capacity: 10, enabled: true },
  ],
  noticeMinutes: 30,
  advanceDays: 30,
  holdMinutes: 120,
  services: [],
  closures: [],
};
sqlSync(
  c,
  `begin;set local role authenticated;set local request.jwt.claim.sub=${literal(id)};select public.aburii_configure(${literal(JSON.stringify(inventory))}::jsonb,${settingsVersion});commit;`,
);
// Derive synthetic example intervals from approved service windows, without opening public bookings.
function sampleStart(direction, earliestDay) {
  return sqlSync(
    c,
    `with days as (select ((clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+n)::date d from generate_series(${direction === "past" ? -8 : earliestDay},${direction === "past" ? 0 : 8}) n), periods as (select d,p from days cross join lateral jsonb_array_elements(aburii.official_hours()) h cross join lateral jsonb_array_elements(h->'periods') p where (h->>'day')::integer=extract(dow from d)::integer), candidates as (select generate_series((d::text||'T'||(p->>'start')||':00+08:00')::timestamptz,(d::text||'T'||(p->>'end')||':00+08:00')::timestamptz-interval '2 hours',interval '30 minutes') s from periods) select s from candidates where ${direction === "past" ? "s+interval '2 hours'<=clock_timestamp()" : "s>clock_timestamp()+interval '30 minutes'"} order by s ${direction === "past" ? "desc" : "asc"} limit 1;`,
  );
}
const futureExample = sampleStart("future", 0),
  laterExample = sampleStart("future", 1),
  pastExample = sampleStart("past", 0);
// Populate today's and tomorrow's service book with reserved .invalid email addresses.
for (const [index, status] of [
  "pending",
  "confirmed",
  "confirmed",
  "completed",
  "cancelled",
  "pending",
].entries()) {
  const starts =
    literal(
      status === "completed"
        ? pastExample
        : index === 5
          ? laterExample
          : futureExample,
    ) + "::timestamptz";
  const area = index % 2 ? "counter" : "private",
    room =
      area === "private" ? (index === 0 ? "dev-sakura" : "dev-kaede") : null;
  // Sequential synthetic intervals avoid inconsistent room allocations.
  const offset = 0;
  sqlSync(
    c,
    `insert into aburii.bookings(id,reference,area,room,starts_at,ends_at,guests,name,phone,email,requests,status,expires_at,capacity_released_at,request_hash,minimum_spend,whatsapp)
 values(${literal(randomUUID())}::uuid,${literal("AB-DEMO-" + String(index + 1).padStart(3, "0"))},${literal(area)},${literal(room)},(${starts})+interval '${offset} hours',(${starts})+interval '${offset + 2} hours',${index === 2 ? 6 : 2},${literal("DEMO Guest " + (index + 1))},'+12025550101',${literal("demo" + (index + 1) + "@example.invalid")},'Synthetic development reservation — no real customer.',${literal(status)},least(clock_timestamp()+interval '90 minutes',(${starts})+interval '${offset} hours'),${status === "cancelled" ? "clock_timestamp()" : "null"},${literal(token())},${area === "private" ? 300 : 0},false);`,
  );
}
savePrivate(credentialsPath, {
  email,
  password,
  loginUrl: "http://localhost:3100/staff",
  notice: "Development only. Do not reuse this password elsewhere.",
});
savePrivate(configPath, c);
console.log(
  "Isolated Aburii local development account and synthetic database created.",
);
console.log(
  "Start: npm run local:start\nRetrieve credentials in your own terminal: npm run local:credentials",
);

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  config,
  developmentOnly,
  sql,
  literal,
  token,
  digest,
  passwordHash,
  equal,
} from "./core.mjs";
const serviceRpcs = {
  aburii_rate_limit: { p_key: "text", p_limit: "integer" },
  aburii_availability: { p_date: "date", p_area: "text", p_guests: "integer" },
  aburii_book: { p: "jsonb" },
};
const staffRpcs = {
  aburii_staff_data: {},
  aburii_status: { p_id: "uuid", p_expected: "text", p_next: "text" },
  aburii_assign: { p_id: "uuid", p_room: "text" },
  aburii_configure: { p_config: "jsonb", p_version: "integer" },
};
const failure = (status, message) => Object.assign(Error(message), { status });
export async function startAuthServer(c = config()) {
  developmentOnly();
  let inflight = 0;
  const attempts = new Map();
  async function body(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw failure(415, "JSON required");
    let value = "";
    for await (const chunk of req) {
      value += chunk;
      if (Buffer.byteLength(value) > 32000)
        throw failure(413, "Request too large");
    }
    try {
      return JSON.parse(value || "{}");
    } catch {
      throw failure(400, "Invalid JSON");
    }
  }
  function throttle() {
    const minute = Math.floor(Date.now() / 60000);
    for (const [key] of attempts) if (key !== minute) attempts.delete(key);
    const count = (attempts.get(minute) || 0) + 1;
    attempts.set(minute, count);
    if (count > 20) throw failure(429, "Too many authentication requests");
  }
  async function currentSession(access) {
    if (typeof access !== "string" || access.length > 150) return null;
    const result = await sql(
      c,
      `select coalesce((select json_build_object('id',s.id,'user_id',s.user_id) from local_auth.sessions s join aburii.staff m on m.user_id=s.user_id and m.active where s.access_hash=${literal(digest(access))} and not s.revoked and s.expires_at>clock_timestamp()),'null'::json);`,
    );
    return JSON.parse(result);
  }
  async function createSession(user) {
    const access = token(),
      refresh = token();
    await sql(
      c,
      `insert into local_auth.sessions values(${literal(randomUUID())}::uuid,${literal(user)}::uuid,${literal(digest(access))},${literal(digest(refresh))},clock_timestamp()+interval '1 hour',clock_timestamp()+interval '12 hours',false);`,
    );
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: "bearer",
    };
  }
  const server = createServer(async (req, res) => {
    let counted = false;
    try {
      if (req.headers.host !== `127.0.0.1:${c.apiPort}` || req.headers.origin)
        throw failure(403, "Server-to-server local requests only");
      if (req.url === "/health" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ development: true, ready: true }));
        return;
      }
      if (req.method !== "POST") throw failure(405, "Method not allowed");
      const key = req.headers.apikey;
      if (!equal(key, c.anonKey) && !equal(key, c.serviceKey))
        throw failure(401, "API key required");
      if (inflight >= 6)
        throw failure(429, "Local development service is busy");
      inflight++;
      counted = true;
      const p = await body(req),
        bearer = req.headers.authorization?.replace(/^Bearer /, "");
      const url = new URL(req.url, "http://127.0.0.1");
      let result;
      if (url.pathname === "/auth/v1/token") {
        if (!equal(key, c.anonKey) || !equal(bearer, c.anonKey))
          throw failure(401, "Anonymous client key required");
        throttle();
        if (url.searchParams.get("grant_type") === "password") {
          if (
            typeof p.email !== "string" ||
            typeof p.password !== "string" ||
            p.email.length > 254 ||
            p.password.length > 200
          )
            throw failure(401, "Invalid login credentials");
          const user = JSON.parse(
            await sql(
              c,
              `select coalesce((select row_to_json(u) from local_auth.users u join aburii.staff m on u.id=m.user_id and m.active where u.email=${literal(p.email.toLowerCase())}),'null'::json);`,
            ),
          );
          // Hash even an unknown email to avoid a trivial account-existence timing distinction.
          const computed = passwordHash(
            p.password,
            user?.salt || "aburii-unknown-development-user",
          );
          if (!user || !equal(computed, user.password_hash))
            throw failure(401, "Invalid login credentials");
          result = await createSession(user.id);
        } else if (url.searchParams.get("grant_type") === "refresh_token") {
          if (
            typeof p.refresh_token !== "string" ||
            p.refresh_token.length > 150
          )
            throw failure(401, "Invalid refresh token");
          const access = token(),
            refresh = token();
          const changed = await sql(
            c,
            `with rotated as (update local_auth.sessions s set access_hash=${literal(digest(access))},refresh_hash=${literal(digest(refresh))},expires_at=clock_timestamp()+interval '1 hour' where s.refresh_hash=${literal(digest(p.refresh_token))} and not s.revoked and s.refresh_expires_at>clock_timestamp() and exists(select 1 from aburii.staff m where m.user_id=s.user_id and m.active) returning s.id) select count(*) from rotated;`,
          );
          if (changed !== "1") throw failure(401, "Invalid refresh token");
          result = {
            access_token: access,
            refresh_token: refresh,
            expires_in: 3600,
            token_type: "bearer",
          };
        } else throw failure(400, "Unsupported development auth grant");
      } else if (url.pathname === "/auth/v1/logout") {
        const session = await currentSession(bearer);
        if (!session) throw failure(401, "Sign in required");
        await sql(
          c,
          `update local_auth.sessions set revoked=true where id=${literal(session.id)}::uuid;`,
        );
        result = { ok: true };
      } else if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.slice("/rest/v1/rpc/".length);
        let args,
          role,
          uid = "";
        if (Object.hasOwn(serviceRpcs, name)) {
          if (!equal(key, c.serviceKey) || !equal(bearer, c.serviceKey))
            throw failure(403, "Service role required");
          args = serviceRpcs[name];
          role = "service_role";
        } else if (Object.hasOwn(staffRpcs, name)) {
          if (!equal(key, c.anonKey))
            throw failure(403, "Staff client required");
          const session = await currentSession(bearer);
          if (!session) throw failure(401, "Sign in required");
          args = staffRpcs[name];
          role = "authenticated";
          uid = session.user_id;
        } else throw failure(404, "Development RPC not exposed");
        if (
          !p ||
          typeof p !== "object" ||
          Array.isArray(p) ||
          Object.keys(p).sort().join(",") !== Object.keys(args).sort().join(",")
        )
          throw failure(400, "Invalid RPC arguments");
        const values = Object.entries(args)
          .map(
            ([key, type]) =>
              `${key} => ${literal(type === "jsonb" ? JSON.stringify(p[key]) : p[key])}::${type}`,
          )
          .join(",");
        const value = await sql(
          c,
          `begin;set local role ${role};set local request.jwt.claim.sub=${literal(uid)};select to_json(public.${name}(${values}));commit;`,
        );
        result = JSON.parse(value || "null");
      } else throw failure(404, "Not found");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(result));
    } catch (e) {
      res.statusCode = e.status || 409;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          message: e.status ? e.message : "Local development request failed",
        }),
      );
    } finally {
      if (counted) inflight--;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(c.apiPort, "127.0.0.1", resolve);
  });
  return server;
}

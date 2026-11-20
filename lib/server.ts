import "server-only";
import { upstreamError } from "./upstream-errors.mjs";
import { supabaseConfig, supabaseHeaders } from "./supabase-config.mjs";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
export async function supabase(
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
) {
  return requestSupabase(path, body, token ? "staff" : "service", token, method);
}
export const authRequest = (path: string, body: unknown) =>
  requestSupabase(path, body, "auth");
async function requestSupabase(path: string, body: unknown, mode: "staff" | "service" | "auth", token?: string, method?: string) {
  let config;
  try { config = supabaseConfig(); } catch {
    console.warn("aburii_request_failed", { stage: mode, code: "SERVER_CONFIGURATION" });
    throw new ApiError("The server connection is not configured correctly. Please contact the administrator.", 503, "SERVER_CONFIGURATION");
  }
  let response: Response;
  try {
  response = await fetch(`${config.url}${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: supabaseHeaders(config, mode, token),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  } catch {
    console.warn("aburii_request_failed", { stage: mode, code: "UPSTREAM_NETWORK" });
    throw new ApiError("Unable to reach the sign-in or booking service. Please try again later.", 503, "UPSTREAM_NETWORK");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const classified = upstreamError(mode, response.status, data);
    if (classified) {
      console.warn("aburii_request_failed", { stage: mode, status: response.status, code: classified.code });
      throw new ApiError(classified.message, classified.status, classified.code);
    }
    console.warn("aburii_request_failed", { stage: mode, status: response.status, code: "UPSTREAM_API" });
    const known = [
      "No availability",
      "Booking expired",
      "Status changed",
      "Invalid transition",
      "Room unavailable",
      "Configuration has active reservations",
      "Request ID reused",
      "Booking not found",
      "Active commitment cannot be archived",
      "Invalid list filters",
      "Invalid operating hours",
      "Monday is closed",
      "Confirm capacity and policies before enabling bookings",
    ];
    throw new ApiError(
      known.includes(data.message)
        ? data.message
        : response.status === 401 || response.status === 403
          ? "Sign in with an active staff account."
          : "Unable to complete this request. Check the details and try again.",
      response.status === 401 || response.status === 403 ? 401 : 409,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}
export const rpc = (name: string, args: unknown, token?: string) =>
  supabase(`/rest/v1/rpc/${name}`, args, token);
export async function staffToken() {
  const token = (await cookies()).get("aburii_access")?.value;
  if (!token) throw new ApiError("Please sign in.", 401);
  return token;
}
export async function guard(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.ABURII_SITE_URL ||
    (process.env.NODE_ENV === "production" ? undefined : new URL(req.url).origin);
  if (process.env.NODE_ENV === "production") {
    try {
      const site = new URL(expected || "");
      if (site.protocol !== "https:" || site.origin !== expected || site.username || site.password)
        throw Error();
    } catch { throw new ApiError("Request origin denied.", 403); }
  }
  if (origin !== expected) throw new ApiError("Request origin denied.", 403);
}
export async function json(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError("JSON required.", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("Body required");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32000) {
      await reader.cancel();
      throw new ApiError("Request too large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("Invalid JSON");
  }
}
export async function limit(req: Request, scope: string) {
  const secret = process.env.ABURII_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiError("Online reservations are not configured.", 503);
  const header = process.env.ABURII_TRUSTED_CLIENT_IP_HEADER;
  const ip = header ? req.headers.get(header) || "unknown" : "shared";
  const key = createHmac("sha256", secret)
    .update(scope + ":" + ip)
    .digest("hex");
  const allowed = await rpc("aburii_rate_limit", {
    p_key: key,
    p_limit: header
      ? scope === "availability"
        ? 60
        : 10
      : scope === "availability"
        ? 240
        : 60,
  });
  if (!allowed)
    throw new ApiError("Too many requests. Please try again in a minute.", 429);
}
export function reply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return reply({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
  return reply({ error: "Please check your details and try again." }, 400);
}

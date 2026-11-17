import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
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
  const url = process.env.ABURII_SUPABASE_URL;
  const key = token
    ? process.env.ABURII_SUPABASE_ANON_KEY
    : process.env.ABURII_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      "Online reservations are not available yet. Please contact Aburii.",
      503,
    );
  const response = await fetch(`${url}${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
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
  const expected = process.env.ABURII_SITE_URL || new URL(req.url).origin;
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
  if (!secret)
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
    return reply({ error: error.message }, error.status);
  return reply({ error: "Please check your details and try again." }, 400);
}

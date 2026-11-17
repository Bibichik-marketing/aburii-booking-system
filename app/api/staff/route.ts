import { completeStaffPassword } from "@/lib/staff-password.mjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { configSchema } from "@/lib/schema";
import {
  rpc,
  supabase,
  authRequest,
  staffToken,
  guard,
  json,
  limit,
  reply,
  failure,
  ApiError,
} from "@/lib/server";
export const runtime = "nodejs";
const names = ["aburii_access", "aburii_refresh"];
async function setSession(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/staff",
  };
  jar.set(names[0], data.access_token, { ...options, maxAge: data.expires_in });
  jar.set(names[1], data.refresh_token, { ...options, maxAge: 60 * 60 * 12 });
}
export async function GET(req: Request) {
  try {
    const token = await staffToken();
    const params = new URL(req.url).searchParams;
    const view = params.get("view");
    if (view === "context")
      return reply(await rpc("aburii_staff_context", {}, token));
    if (view === "today")
      return reply(await rpc("aburii_staff_today", {}, token));
    if (view === "detail")
      return reply(
        await rpc(
          "aburii_staff_detail",
          { p_id: z.string().uuid().parse(params.get("id")) },
          token,
        ),
      );
    if (view === "list") {
      const date = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable();
      const p = z
        .object({
          q: z.string().max(150),
          from: date,
          to: date,
          status: z.enum([
            "all",
            "pending",
            "confirmed",
            "seated",
            "completed",
            "cancelled",
            "declined",
            "expired",
            "no_show",
          ]),
          area: z.enum(["all", "counter", "private"]),
          sort: z.enum(["arrival", "name", "guests", "area", "status"]),
          order: z.enum(["asc", "desc"]),
          page: z.coerce.number().int().min(1).max(1000000),
          size: z.coerce.number().refine((n) => [10, 25, 50].includes(n)),
          archive: z.enum(["all", "active", "archived"]),
        })
        .parse({
          q: params.get("q") || "",
          from: params.get("from") || null,
          to: params.get("to") || null,
          status: params.get("status") || "all",
          area: params.get("area") || "all",
          sort: params.get("sort") || "arrival",
          order: params.get("order") || "desc",
          page: params.get("page") || 1,
          size: params.get("size") || 25,
          archive: params.get("archive") || "all",
        });
      if (p.from && p.to && p.from > p.to)
        throw new ApiError("Invalid date range");
      return reply(
        await rpc(
          "aburii_staff_list",
          {
            p_query: p.q,
            p_from: p.from,
            p_to: p.to,
            p_status: p.status,
            p_area: p.area,
            p_sort: p.sort,
            p_order: p.order,
            p_page: p.page,
            p_size: p.size,
            p_archive: p.archive,
          },
          token,
        ),
      );
    }
    return reply(await rpc("aburii_staff_data", {}, token));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    await guard(req);
    const p = await json(req);
    const action = z
      .enum([
        "setup_password",
        "login",
        "logout",
        "refresh",
        "status",
        "config",
        "assign",
        "archive",
      ])
      .parse(p.action);
    if (action === "setup_password") {
      await limit(req, "password_setup");
      const input = z.object({
        token_hash: z.string().regex(/^[a-fA-F0-9]{32,128}$/),
        type: z.enum(["invite", "recovery"]),
        password: z.string().min(12).max(128),
      }).parse(p);
      const session = await completeStaffPassword(input, {
        auth: authRequest,
        member: token => rpc("aburii_staff_context", {}, token),
        user: supabase,
      });
      await setSession(session);
      return reply({ ok: true });
    }
    if (action === "login") {
      await limit(req, "login");
      const input = z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(200),
        })
        .parse(p);
      const data = await authRequest("/auth/v1/token?grant_type=password", input);
      await rpc("aburii_staff_data", {}, data.access_token);
      await setSession(data);
      return reply({ ok: true });
    }
    if (action === "logout") {
      const jar = await cookies();
      const token = jar.get(names[0])?.value;
      if (token) await supabase("/auth/v1/logout", {}, token).catch(() => null);
      for (const name of names)
        jar.set(name, "", { httpOnly: true, path: "/api/staff", maxAge: 0 });
      return reply({ ok: true });
    }
    if (action === "refresh") {
      await limit(req, "refresh");
      const refresh = (await cookies()).get(names[1])?.value;
      if (!refresh)
        throw new ApiError("Please sign in.", 401);
      const data = await authRequest(
        "/auth/v1/token?grant_type=refresh_token",
        { refresh_token: refresh },
      );
      await rpc("aburii_staff_data", {}, data.access_token);
      await setSession(data);
      return reply({ ok: true });
    }
    const token = await staffToken();
    if (action === "config") {
      const config = configSchema.parse(p.config);
      return reply(
        await rpc(
          "aburii_configure",
          { p_config: config, p_version: z.number().int().parse(p.version) },
          token,
        ),
      );
    }
    const id = z.string().uuid().parse(p.id);
    if (action === "archive")
      return reply(
        await rpc(
          "aburii_staff_archive",
          { p_id: id, p_archived: z.boolean().parse(p.archived) },
          token,
        ),
      );
    if (action === "assign")
      return reply(
        await rpc(
          "aburii_assign",
          { p_id: id, p_room: z.string().max(40).parse(p.room) },
          token,
        ),
      );
    return reply(
      await rpc(
        "aburii_status",
        {
          p_id: id,
          p_expected: z.string().parse(p.expected),
          p_next: z
            .enum([
              "confirmed",
              "cancelled",
              "declined",
              "seated",
              "completed",
              "no_show",
            ])
            .parse(p.status),
        },
        token,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

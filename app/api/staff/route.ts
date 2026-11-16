import { cookies } from "next/headers";
import { z } from "zod";
import { configSchema } from "@/lib/schema";
import {
  rpc,
  supabase,
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
export async function GET() {
  try {
    return reply(await rpc("aburii_staff_data", {}, await staffToken()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    await guard(req);
    const p = await json(req);
    const action = z
      .enum(["login", "logout", "refresh", "status", "config", "assign"])
      .parse(p.action);
    if (action === "login") {
      await limit(req, "login");
      const input = z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(200),
        })
        .parse(p);
      const key = process.env.ABURII_SUPABASE_ANON_KEY;
      if (!key) throw new ApiError("Authentication not configured.", 503);
      const data = await supabase(
        "/auth/v1/token?grant_type=password",
        input,
        key,
      );
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
      if (!refresh || !process.env.ABURII_SUPABASE_ANON_KEY)
        throw new ApiError("Please sign in.", 401);
      const data = await supabase(
        "/auth/v1/token?grant_type=refresh_token",
        { refresh_token: refresh },
        process.env.ABURII_SUPABASE_ANON_KEY,
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

import { z } from "zod";
import { rpc, limit, reply, failure } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await limit(req, "availability");
    const q = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        area: z.enum(["counter", "private"]),
        guests: z.coerce.number().int().min(1).max(200),
      })
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    return reply(
      await rpc("aburii_availability", {
        p_date: q.date,
        p_area: q.area,
        p_guests: q.guests,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}

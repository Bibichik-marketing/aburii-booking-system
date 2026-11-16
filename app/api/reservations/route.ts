import { bookingSchema } from "@/lib/schema";
import { rpc, guard, json, limit, reply, failure } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await guard(req);
    await limit(req, "booking");
    const input = bookingSchema.parse(await json(req));
    return reply(await rpc("aburii_book", { p: input }), 201);
  } catch (e) {
    return failure(e);
  }
}

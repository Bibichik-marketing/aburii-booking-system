import { supabaseConfig, supabaseHeaders } from "../lib/supabase-config.mjs";
// Run from a scheduler every minute. Credentials are read only from environment.
// Delivery is at-least-once: a provider timeout after acceptance may cause a duplicate.
const required = [

  "ABURII_WHATSAPP_ACCESS_TOKEN",
  "ABURII_WHATSAPP_PHONE_NUMBER_ID",
  "ABURII_WHATSAPP_TEMPLATE_NAME",
  "ABURII_WHATSAPP_GRAPH_VERSION",
];
if (required.some((k) => !process.env[k])) {
  console.error(
    "Notification worker is not configured; queue was not claimed.",
  );
  process.exit(1);
}
let connection;
try { connection = supabaseConfig(); } catch {
  console.error("Aburii Supabase configuration is missing or invalid; queue was not claimed.");
  process.exit(1);
}
async function rpc(name, args) {
  const r = await fetch(
    `${connection.url}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: supabaseHeaders(connection, "service"),
      redirect: "error",
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok) throw Error("Database request failed");
  return r.status === 204 ? null : r.json();
}
try {
  await rpc("aburii_expire_holds", {});
  const jobs = await rpc("aburii_claim_notifications", {});
  for (const job of jobs) {
    let success = false;
    let error = null;
    try {
      const p = job.payload;
      // Approved utility template requires six text parameters in this order.
      const values = [
        p.reference,
        p.status,
        new Intl.DateTimeFormat("en-MY", {
          timeZone: "Asia/Kuala_Lumpur",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(p.start)) + " MYT",
        p.area === "counter" ? "Counter Seating" : "Private Room",
        String(p.guests),
        "For assistance or cancellation, call +60 10 910 0267. Pending requests require confirmation.",
      ];
      const r = await fetch(
        `https://graph.facebook.com/${process.env.ABURII_WHATSAPP_GRAPH_VERSION}/${process.env.ABURII_WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.ABURII_WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: p.phone.replace("+", ""),
            type: "template",
            template: {
              name: process.env.ABURII_WHATSAPP_TEMPLATE_NAME,
              language: {
                code: process.env.ABURII_WHATSAPP_TEMPLATE_LANGUAGE || "en",
              },
              components: [
                {
                  type: "body",
                  parameters: values.map((text) => ({ type: "text", text })),
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      success = r.ok;
      error = success ? null : `Provider HTTP ${r.status}`;
    } catch {
      error = "Provider connection failed";
    }
    await rpc("aburii_finish_notification", {
      p_id: job.id,
      p_lease: job.lease,
      p_success: success,
      p_error: error,
    });
  }
  console.log(`Processed ${jobs.length} notification jobs.`);
} catch {
  console.error(
    "Notification worker failed. Check server configuration and connectivity.",
  );
  process.exitCode = 1;
}

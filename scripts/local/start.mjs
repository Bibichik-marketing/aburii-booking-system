import { spawn } from "node:child_process";
import { config, startDatabase, root } from "./core.mjs";
import { startAuthServer } from "./auth-server.mjs";
const c = config();
startDatabase(c);
const server = await startAuthServer(c);
// This launcher is never imported by the application or by its production entry point.
// All backend destinations are fixed to loopback; inherited integration secrets are removed.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("ABURII_") && !key.startsWith("PG"),
  ),
);
Object.assign(env, {
  NODE_ENV: "development",
  ABURII_LOCAL_DEVELOPMENT: "true",
  ABURII_SUPABASE_URL: `http://127.0.0.1:${c.apiPort}`,
  ABURII_SUPABASE_PUBLISHABLE_KEY: c.anonKey,
  ABURII_SUPABASE_SECRET_KEY: c.serviceKey,
  ABURII_RATE_LIMIT_SECRET: c.rateLimitSecret,
  ABURII_SITE_URL: "http://localhost:3100",
});
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(c.appPort),
  ],
  { cwd: root, env, stdio: "inherit" },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  app.kill("SIGTERM");
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("error", stop);
app.on("exit", (code) => {
  if (!stopping) {
    stopping = true;
    server.close(() => process.exit(code || 0));
  }
});
console.log(
  "ABURII DEVELOPMENT ONLY — synthetic reservations, isolated local authentication.",
);
console.log("Login: http://localhost:3100/staff");
console.log(
  "Credentials: run npm run local:credentials in your own interactive terminal.",
);
console.log("Outbound WhatsApp/email workers are not started.");

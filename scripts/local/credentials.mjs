import { readFileSync } from "node:fs";
import { developmentOnly, config, credentialsPath } from "./core.mjs";
developmentOnly();
config();
if (!process.stdout.isTTY) {
  console.error(
    "Open your own interactive terminal and run npm run local:credentials. Credentials are not printed to logs or noninteractive output.",
  );
  process.exit(1);
}
const c = JSON.parse(readFileSync(credentialsPath, "utf8"));
console.log(
  `Login URL: ${c.loginUrl}\nEmail: ${c.email}\nPassword: ${c.password}\n\nDevelopment only. Keep this terminal output private.`,
);

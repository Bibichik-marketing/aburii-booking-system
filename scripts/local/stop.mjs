import { config, run } from "./core.mjs";
const c = config();
run("pg_ctl", ["-D", c.databaseDirectory, "-m", "fast", "stop"]);
console.log("Aburii development database stopped.");

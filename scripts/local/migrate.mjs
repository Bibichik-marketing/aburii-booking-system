import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, startDatabase, sqlSync, root, literal } from "./core.mjs";
const c = config();
startDatabase(c);
for (const name of ["002_staff_workspace", "003_operating_hours"]) {
  if (
    sqlSync(
      c,
      `select exists(select 1 from local_auth.metadata where key=${literal("migration:" + name)});`,
    ) === "t"
  )
    continue;
  sqlSync(c, readFileSync(join(root, "supabase", name + ".sql"), "utf8"));
  sqlSync(
    c,
    `insert into local_auth.metadata(key,value) values(${literal("migration:" + name)},'applied');`,
  );
  console.log(
    "Applied " + name + " to the isolated local development database.",
  );
}
console.log(
  "Local migrations are current. Reservation rows and credentials were preserved.",
);

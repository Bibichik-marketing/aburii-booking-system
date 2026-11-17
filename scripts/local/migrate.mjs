import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, startDatabase, sqlSync, root } from "./core.mjs";
const c = config();
startDatabase(c);
if (
  sqlSync(
    c,
    "select exists(select 1 from local_auth.metadata where key='migration:002_staff_workspace');",
  ) === "t"
) {
  console.log("Staff workspace migration is already applied. No data changed.");
  process.exit(0);
}
sqlSync(
  c,
  readFileSync(join(root, "supabase/002_staff_workspace.sql"), "utf8"),
);
sqlSync(
  c,
  "insert into local_auth.metadata(key,value) values('migration:002_staff_workspace','applied');",
);
console.log(
  "Applied additive staff read/archive functions to the isolated local database. Reservation rows were preserved.",
);

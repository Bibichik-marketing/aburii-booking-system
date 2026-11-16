import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "--webpack"],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
console.log("Standalone Node deployment prepared at .next/standalone");

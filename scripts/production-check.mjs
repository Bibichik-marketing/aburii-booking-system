// Offline only: this command does not fetch, connect, migrate, invite or deploy.
import { productionIssues, ABURII_PROJECT_REF } from '../lib/supabase-config.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const plan = JSON.parse(readFileSync(new URL('../supabase/migration-plan.json', import.meta.url), 'utf8'));
const issues = productionIssues();
if (plan.projectReference !== ABURII_PROJECT_REF) issues.push("Migration plan project reference does not match the pinned Aburii project.");
for (const entry of plan.migrations) {
  const file = readFileSync(new URL(`../supabase/${entry.file}`, import.meta.url));
  if (createHash('sha256').update(file).digest('hex') !== entry.sha256) issues.push(`Migration checksum mismatch: ${entry.file}`);
}
console.log('Aburii offline production preflight — no remote requests made.');
if (issues.length) {
  for (const issue of issues) console.error(`BLOCKER: ${issue}`);
  process.exitCode = 1;
} else console.log('Offline configuration and migration checks pass. Remote project identity/key ownership, schema state, Auth and launch-gate verification remain required before migration or release.');

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  developmentOnly,
  token,
  digest,
  passwordHash,
  equal,
  literal,
  root,
} from "../scripts/local/core.mjs";
test("development commands refuse production before reading credentials or starting services", () => {
  for (const script of [
    "start",
    "setup",
    "credentials",
    "stop",
    "check",
    "migrate",
  ]) {
    const child = spawnSync(process.execPath, [`scripts/local/${script}.mjs`], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /refuse NODE_ENV=production/);
  }
});
test("development passwords use unique salts and access/refresh secrets have random entropy", () => {
  const a = token(),
    b = token();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.equal(digest(a).length, 64);
  assert.notEqual(
    passwordHash("test-only-value", a),
    passwordHash("test-only-value", b),
  );
  assert.equal(
    equal(
      passwordHash("test-only-value", a),
      passwordHash("different-value", a),
    ),
    false,
  );
  assert.equal(equal(a, a), true);
  assert.equal(equal(a, b), false);
  assert.equal(equal(a, undefined), false);
});
test("SQL literals quote data and cannot introduce a new statement", () => {
  assert.equal(literal("' ; select 1; --"), "''' ; select 1; --'");
  assert.equal(literal(null), "null");
});
test("production application does not import the development authentication service", () => {
  for (const path of [
    "app/api/staff/route.ts",
    "lib/server.ts",
    "next.config.ts",
    "scripts/build.mjs",
  ])
    assert.ok(!readFileSync(path, "utf8").includes("scripts/local"));
  assert.match(readFileSync(".gitignore", "utf8"), /^\.local-dev\/$/m);
});

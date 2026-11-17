import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { chinese } from "../lib/messages.mjs";
import {
  languages,
  normalizeLanguage,
  translate,
  translateError,
  validationMessage,
} from "../lib/i18n.mjs";

test("exactly EN and Simplified Chinese are supported; default is English", () => {
  assert.deepEqual(languages, ["en", "zh-CN"]);
  for (const value of [undefined, null, "", "zh", "zh-TW", "ja", "ko", "es"])
    assert.equal(normalizeLanguage(value), "en");
  assert.equal(normalizeLanguage("zh-CN"), "zh-CN");
});
test("required seating names and every reservation status have translations", () => {
  assert.equal(translate("zh-CN", "Counter Seating"), "吧台座位");
  assert.equal(translate("zh-CN", "Private Room"), "包间");
  for (const status of [
    "pending",
    "confirmed",
    "seated",
    "completed",
    "cancelled",
    "declined",
    "expired",
    "no_show",
  ]) {
    assert.match(translate("zh-CN", status), /[\u3400-\u9fff]/);
    assert.notEqual(translate("en", status), status);
  }
});
test("all literal UI translation keys and dynamic seating descriptions are covered", () => {
  const paths = [
    "app/booking.tsx",
    "app/staff/page.tsx",
    "app/staff/password/page.tsx",
    "app/staff/staff-workspace.tsx",
    "app/staff/components.tsx",
    "app/page.tsx",
    "app/policies/page.tsx",
    "app/shell.tsx",
    "lib/language.tsx",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["t", "translate"].includes(node.expression.text)
      ) {
        const arg =
          node.arguments[node.expression.text === "translate" ? 1 : 0];
        if (arg && ts.isStringLiteral(arg))
          assert.ok(
            Object.hasOwn(chinese, arg.text.trim()),
            `${path}: untranslated ${arg.text}`,
          );
      }
      if (
        ts.isPropertyAssignment(node) &&
        ["title", "description"].includes(node.name.getText(file)) &&
        ts.isStringLiteral(node.initializer) &&
        path === "app/booking.tsx"
      )
        assert.ok(Object.hasOwn(chinese, node.initializer.text));
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
});
test("database/API error strings are translated without modifying server contracts", () => {
  const files = ["lib/server.ts", "app/api/staff/route.ts"];
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(file) === "ApiError"
      ) {
        const arg = node.arguments?.[0];
        if (arg && ts.isStringLiteral(arg))
          assert.ok(Object.hasOwn(chinese, arg.text), arg.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  for (const message of [
    "No availability",
    "Booking expired",
    "Status changed",
    "Invalid transition",
    "Room unavailable",
    "Configuration has active reservations",
    "Request ID reused",
    "Booking not found",
  ])
    assert.notEqual(translateError("zh-CN", message), message);
  assert.equal(
    translateError("zh-CN", "Failed to fetch"),
    chinese["Please check your details and try again."],
  );
});
test("interpolation preserves references, numbers, whitespace and valid example JSON", () => {
  assert.equal(
    translate("zh-CN", "Assign room for {reference}", { reference: "AB-123" }),
    "为预订 AB-123 分配包间",
  );
  assert.equal(translate("zh-CN", " Counter Seating "), " 吧台座位 ");
  const example =
    '[{"id":"room-a","name":"Room A","capacity":6,"enabled":true}]';
  assert.equal(JSON.parse(translate("zh-CN", example))[0].capacity, 6);
  assert.ok(
    translate(
      "zh-CN",
      "This is a request, not a confirmed reservation. Your capacity hold expires {expiry} MYT unless our team confirms it. Please call us if you need assistance.",
      { expiry: "2026年11月18日 18:00" },
    ).includes("2026年11月18日 18:00"),
  );
});
test("native validation provides localized required, email, phone, length and capacity messages", () => {
  const cases = [
    { valueMissing: true },
    { typeMismatch: true },
    { patternMismatch: true },
    { tooShort: true },
    { tooLong: true },
    { rangeUnderflow: true },
    { rangeOverflow: true },
    { stepMismatch: true },
  ];
  for (const flags of cases) {
    const [key, values] = validationMessage(flags, {
      type: "email",
      min: "1",
      max: "200",
      minLength: 2,
      maxLength: 100,
    });
    assert.ok(Object.hasOwn(chinese, key), key);
    assert.match(translate("zh-CN", key, values), /[\u3400-\u9fff]/);
    assert.ok(!translate("zh-CN", key, values).match(/\{min\}|\{max\}/));
  }
});
test("language changes do not alter reservation requests, capacity schema, or WhatsApp workflow", () => {
  const booking = readFileSync("app/booking.tsx", "utf8");
  assert.ok(!booking.includes("key={language}"));
  assert.ok(!booking.includes("key={locale}"));
  assert.match(booking, /\}, \[area, date, guests\]\)/);
  const provider = readFileSync("lib/language.tsx", "utf8");
  assert.match(provider, /localStorage.getItem/);
  assert.match(provider, /localStorage.setItem/);
  for (const path of [
    "app/api/reservations/route.ts",
    "app/api/availability/route.ts",
    "app/api/staff/route.ts",
    "lib/server.ts",
    "lib/schema.ts",
    "supabase/001_aburii.sql",
    "scripts/notifications.mjs",
  ])
    assert.ok(!readFileSync(path, "utf8").includes("useLanguage"));
});

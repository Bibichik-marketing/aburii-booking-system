import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serviceDay,
  displayStatus,
  holdsCapacity,
  sortArrivals,
  availableActions,
  occupancyRows,
  whatsappUrl,
} from "../lib/staff-view.mjs";
const now = Date.parse("2026-11-17T12:00:00+08:00");
const booking = (extra = {}) => ({
  id: "1",
  status: "confirmed",
  starts_at: "2026-11-17T11:00:00+08:00",
  ends_at: "2026-11-17T13:00:00+08:00",
  expires_at: "2026-11-17T11:00:00+08:00",
  capacity_released_at: null,
  ...extra,
});
test("dashboard date grouping uses Malaysia time at UTC date boundaries", () => {
  assert.equal(serviceDay("2026-11-16T20:00:00Z"), "2026-11-17");
  assert.equal(serviceDay("2026-11-17T15:59:59Z"), "2026-11-17");
  assert.equal(serviceDay("2026-11-17T16:00:00Z"), "2026-11-18");
});
test("pending and arrival order is chronological without changing source records", () => {
  const records = [
    booking({ id: "later", starts_at: "2026-11-18T10:00:00+08:00" }),
    booking({ id: "evening", starts_at: "2026-11-17T20:00:00+08:00" }),
    booking({ id: "first" }),
  ];
  assert.deepEqual(
    sortArrivals(records).map((b) => b.id),
    ["first", "evening", "later"],
  );
  assert.equal(records[0].id, "later");
});
test("timeline preserves post-start cancelled, no-show and completed commitments", () => {
  for (const status of ["cancelled", "declined", "no_show", "completed"]) {
    assert.equal(holdsCapacity(booking({ status }), now), true);
    assert.equal(
      occupancyRows([booking({ status })], "2026-11-17", now).length,
      1,
    );
  }
  assert.equal(
    holdsCapacity(
      booking({
        status: "cancelled",
        capacity_released_at: "2026-11-17T10:00:00+08:00",
      }),
      now,
    ),
    false,
  );
});
test("expired pre-start holds are excluded while expiry exactly at start retains capacity", () => {
  const expired = booking({
    status: "pending",
    expires_at: "2026-11-17T10:00:00+08:00",
  });
  assert.equal(displayStatus(expired, now), "expired");
  assert.equal(holdsCapacity(expired, now), false);
  assert.equal(holdsCapacity(booking({ status: "expired" }), now), true);
  assert.equal(
    holdsCapacity(
      booking({
        status: "pending",
        starts_at: "2026-11-17T18:00:00+08:00",
        expires_at: "2026-11-17T12:30:00+08:00",
      }),
      now,
    ),
    true,
  );
});
test("timeline clips overnight intervals and excludes nonoverlapping half-open intervals", () => {
  const b = booking({
    starts_at: "2026-11-16T23:00:00+08:00",
    ends_at: "2026-11-17T02:00:00+08:00",
  });
  const [row] = occupancyRows([b], "2026-11-17", now);
  assert.equal(row.left, 0);
  assert.equal(row.width, (2 / 24) * 100);
  assert.equal(
    occupancyRows(
      [
        booking({
          ends_at: "2026-11-17T00:00:00+08:00",
          starts_at: "2026-11-16T23:00:00+08:00",
        }),
      ],
      "2026-11-17",
      now,
    ).length,
    0,
  );
  assert.equal(occupancyRows([b], "2026-11-18", now).length, 0);
  assert.equal(occupancyRows([b], "", now).length, 0);
});
test("available service controls respect existing start/end and hold expiry boundaries", () => {
  const future = booking({
    starts_at: "2026-11-17T18:00:00+08:00",
    ends_at: "2026-11-17T20:00:00+08:00",
  });
  assert.deepEqual(availableActions(future, now), ["cancelled"]);
  assert.ok(availableActions(booking(), now).includes("seated"));
  assert.ok(availableActions(booking(), now).includes("no_show"));
  assert.ok(
    !availableActions(
      booking({ ends_at: "2026-11-17T12:00:00+08:00" }),
      now,
    ).includes("seated"),
  );
  assert.deepEqual(
    availableActions(
      booking({ status: "pending", expires_at: "2026-11-17T11:59:00+08:00" }),
      now,
    ),
    [],
  );
});
test("WhatsApp actions compose a manual chat only for valid international numbers", () => {
  assert.equal(whatsappUrl("+60123456789"), "https://wa.me/60123456789");
  for (const value of [
    "60123456789",
    "javascript:alert(1)",
    "+01234567",
    "+60123",
    "+60123456789?text=send",
  ])
    assert.equal(whatsappUrl(value), null);
});

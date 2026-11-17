# Staff workspace

The staff area has three actual routes with one shared authenticated workspace and existing detail/settings components:

- `/staff` — **Dashboard**: all reservations across all dates, including history and future bookings. No date filter is selected by default. There is one compact desktop table or one mobile card list, never two visible management lists.
- `/staff/today` — **Today**: arrivals whose scheduled start falls on the current Asia/Kuala_Lumpur calendar date. A small Total Reservations / Pending / Confirmed / Total Guests overview precedes one list. Pending requests appear first, ordered by arrival; the remaining entries follow chronological arrival time. Total Reservations includes all today's statuses; Total Guests includes pending, confirmed, seated and completed records. These are service summaries, not capacity calculations.
- `/staff/settings` — **Settings**, shown only to Admins. Direct navigation by other roles does not mount the settings editor; configuration RPCs still enforce Admin membership server-side.

English and Simplified Chinese apply to all three pages, details, filters, status labels, archive prompts and existing settings. The language preference persists as before. The customer booking page was not redesigned or changed.

## Search, sorting and pagination

Dashboard search matches name, phone or reference, with formatted phone matching supported. Date range endpoints are inclusive Malaysia calendar dates. Status, seating area, archive visibility and search filters combine with the range. Rejected displays the existing `declined` status; Seated remains available to preserve the existing service workflow. Archive visibility defaults to All so no records silently disappear.

Rows can be sorted by arrival, customer, guest count, seating area or effective status in either direction. A stable booking-ID tie-breaker prevents overlapping pages when values match. Page sizes are 10, 25 or 50; the database returns only the requested page plus the total. Out-of-range pages clamp to the last page after results shrink. Search input is debounced and stale responses cannot overwrite newer results.

The old read RPC remains available for compatibility, but the workspace no longer relies on its seven-day lookback / 2,000-row limit. The new context RPC excludes bulk booking data. List, Today and individual-detail reads all verify active staff membership.

## Actions and archive semantics

Click a table row or mobile card, or use Details, to open the shared reservation dialog. Existing Confirm, Reject, private-room Edit, manual WhatsApp and service-status actions remain. Edit continues to support **future private-room assignment only**; guest information, party size and dining times remain read-only because no safe editing API exists for those fields. The existing status/assignment RPCs and capacity rules are unchanged.

Admin Archive and Restore are non-destructive. They append `booking_archived` / `booking_restored` events to the existing private audit table. Current visibility is derived from the latest archive event. No booking row, status, original time interval, capacity commitment, notification consent or prior audit event is rewritten or deleted. Active or retained capacity commitments cannot be archived. Expired pending requests may be archived without materializing a status change. Archive filtering is independent of reservation status.

All roles can inspect archive metadata; only active Admins can write Archive/Restore events. Original database grants, authentication cookies, session refresh, notification worker and mutation permissions remain intact.

## Compact occupancy reference

Today has a collapsed, read-only occupancy timeline below its single management list. It includes original intervals that intersect today, including overnight arrivals and retained capacity after cancellation/no-show. It has no management or configuration controls. Inventory, capacity, service hours and booking policy settings remain solely in Settings. Archiving never alters occupancy or bookable availability.

## Additive migration

`supabase/002_staff_workspace.sql` adds staff read/archive functions and two indexes using the existing booking/audit tables. **No table or column is added, removed or migrated.** `001_aburii.sql` and all existing booking/capacity/status/assignment functions are unchanged. Functions are created with pinned search paths, revoked public/service-client execution and explicit authenticated grants inside a single transaction.

For a new Aburii Supabase project, apply `001_aburii.sql` then `002_staff_workspace.sql`. For an existing Aburii environment, apply only `002_staff_workspace.sql` through trusted database administration before serving this UI. This task applied it only to the already-isolated local development database; no production database was contacted.

Local setup includes migrations 001–003. Migration 003 adds official service windows and the public-booking readiness gate; see `OPERATING-HOURS.md`. Existing local accounts and data can be preserved with:

```sh
npm run local:migrate
npm run local:start
```

The local adapter exposes the new operations through the same verified sessions and fixed RPC allowlist. No authentication bypass is added.

## Verification

67 automated tests passed, including unchanged capacity/concurrency tests and new tests for historical reads beyond 2,000 records, combined filters, inclusive MYT boundaries, deterministic sorting and pagination, membership revocation, admin-only archive/restore, retained commitments, immutable booking rows and audit history, and Today/overnight separation. TypeScript and production build passed.

Browser checks used the existing authenticated local synthetic-data environment. Combined search/date/status/seating filters, row/card detail opening, separate Today routing, non-duplicated daily records, archive confirmation without changing sample records, Settings navigation, English/Chinese rendering and responsive desktop/mobile presentation were verified. No notifications were sent and no production deployment occurred.

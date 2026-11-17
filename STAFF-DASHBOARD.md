# Staff service desk

The staff interface keeps Aburii's existing cream, burgundy, typography and bilingual header. It uses the existing `/api/staff` actions and existing Supabase RPCs. No schema, authentication, permissions, capacity enforcement, notification worker or audit behavior was changed.

## Daily overview

Today's Reservations, Pending, Confirmed and Total Guests always describe the current **Malaysia calendar day**, independently of the service-date and search filters below. Active reservation totals include pending, confirmed, seated and completed bookings; Total Guests includes pending requests and excludes cancelled, declined, expired and no-show records. These are service summary metrics, not occupancy calculations. The first three cards offer shortcuts to today's matching reservation list.

Pending requests have a dedicated highlighted queue, chronological date groups, arrival/end times, hold expiry, a seating-category label and immediate Confirm / Reject controls. Other reservations are grouped by service date and arrival time. Search, date, seating-area and status filters remain available. The dashboard refreshes every minute and displays its last refresh time.

## Reservation details

The keyboard-accessible detail dialog shows the original dining interval, seating category, internal room, guests, contacts, requests, minimum spend and applicable capacity commitment. Confirm uses the existing compare-and-set status endpoint. Reject, cancellation and no-show have a bilingual confirmation step with the existing capacity-policy explanation. The server remains authoritative for all transitions and conflicts.

**Edit is intentionally limited to the existing supported private-room assignment capability.** It is available for future pending/confirmed private bookings. Existing guest details, party size and reservation times are read-only because the current API does not support safely editing them. A new room assignment is checked transactionally by the existing RPC on save; no success is simulated. Counter bookings and started/terminal reservations show an explanation instead of an enabled Edit control.

WhatsApp opens the guest's validated international number in a manual chat. It does not send a message automatically, alter consent or change the existing automated WhatsApp template/outbox workflow. Notification queue health remains available to the same manager/admin roles as before.

## Read-only timeline and administration

The Availability Timeline visualizes original capacity commitments for both seating categories on the selected service day. It mirrors the existing database commitment policy for display: pre-start releases stay released; unreleased post-start cancellations, no-shows and completed bookings retain their original intervals; pending expiry before start releases capacity, while expiry exactly at start preserves the interval. Overnight intervals are clipped to the selected day. The display does not change any capacity calculation in the booking backend.

The timeline ignores reservation search/status filters so occupancy cannot disappear merely because staff selected a different status. It contains no editing, capacity, opening-hours or availability overrides. It is an occupancy reference, not a promise that a new party can be booked. On smaller screens the chart scrolls within its own container. All configuration remains in the admin-only Admin Settings view, using the existing settings component and configuration endpoint.

## Verification

- TypeScript and standalone production build passed.
- All 53 tests passed: 39 database integration tests, 7 localization tests and 7 staff presentation tests. Final UI-only refinements also passed the 14 localization/presentation tests.
- Tests cover MYT date boundaries, arrival sorting, original-interval commitments, pre-start hold expiry, overnight clipping, service-action timing and safe WhatsApp links.
- Browser QA used synthetic data on an isolated loopback-only fixture: Confirm, room reassignment, rejection prompt, English/Chinese dialogs, Admin Settings, staff-only navigation, manual WhatsApp destination, Escape handling and responsive layouts at 320px, 768px and 1280px. No horizontal page overflow was observed; the timeline has its own horizontal scroll container.
- The fixture was stopped after QA. It made no Supabase connections and sent no notifications. The standard preview remains http://localhost:3100/staff and requires real Aburii staff configuration for live data. No production deployment was performed.

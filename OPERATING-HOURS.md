# Official operating hours

All dates, service windows and arrival times use Asia/Kuala_Lumpur (UTC+8).

| Day | Lunch | Dinner |
| --- | --- | --- |
| Monday | Closed | Closed |
| Tuesday–Friday | No service | 18:00–22:30 |
| Saturday–Sunday | 12:00–14:30 | 18:00–22:30 |

Admin Settings contains editable service windows, arrival interval (default 30 minutes), and separate Counter Seating / Private Room durations. Monday remains closed, including date-specific overrides. Customer and Admin displays support English and Simplified Chinese.

An arrival is available only if its entire configured dining duration fits inside one service period. With a 120-minute duration and 30-minute interval, the last dinner arrival is 20:30 and the last weekend lunch arrival is 12:30. Durations and intervals are configurable, so these example cutoffs are calculated rather than hardcoded. Explicit start-time overrides can narrow availability but cannot cross a service break, extend past closing, or open Monday. Existing notice, booking horizon, temporary closures and independent counter/room capacity checks still apply transactionally.

## Migration and existing reservations

For a new isolated Aburii database apply 001, 002, then `supabase/003_operating_hours.sql`. For an existing database with 001 and 002, apply only 003. This task applied 003 only to the isolated local development database. `npm run local:migrate` applies outstanding local migrations without recreating accounts or reservations.

Migration 003 updates settings once to the approved weekly defaults, clears obsolete weekly explicit start lists, retains date-specific overrides and inventory, and disables public bookings. It preserves every existing reservation, including legacy reservations outside the new hours, their original intervals and retained capacity commitments. Reapplying it does not reset later Admin settings. No booking table columns change. The original configuration validator remains private and continues checking inventory, permissions, concurrency and audit history.

## Public launch stays closed

`publicBookingsEnabled`, `capacitiesConfirmed` and `policiesConfirmed` default to false. The database returns no public slots and rejects public reservation creation until all three are true. An Admin must enter actual inventory, verify enabled-area capacities, approve the policies, and explicitly enable public bookings. Synthetic local inventory does not constitute confirmation. This task leaves all three false and sends no WhatsApp messages.

## Verification

The automated suite uses disposable Unix-socket PostgreSQL clusters, never a configured Supabase connection. It covers weekly windows, Monday override rejection, service breaks, duration cutoffs, arrival intervals, independent capacities, launch prerequisites, migration idempotence and preservation of existing reservations, alongside the existing capacity/authentication/staff tests.

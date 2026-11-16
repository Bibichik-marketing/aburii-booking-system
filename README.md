# Aburii Booking System

Independent Next.js App Router / TypeScript application for Aburii Japanese Restaurant. BiBiChik source was inspected read-only for architectural reference. Only Aburii's existing logo was copied; no customer records, reservations, credentials, environment files or database connections were copied. This directory has its own package manifest, lockfile, Git history and deployment output.

## Run locally

Requires Node.js 22.13+ and npm. From **this directory**:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Visit http://localhost:3100. The design and staff login page work without configuration; availability and submission fail closed. There are no demo reservations, fake confirmations or assumed seating capacities.

## Connect a separate Supabase project

1. Create a **new, empty Aburii-only Supabase project**. Never execute this migration in BiBiChik's project. The migration creates a private `aburii` schema and dedicated `public.aburii_*` RPC functions.
2. Execute `supabase/001_aburii.sql` once in the new project's SQL editor. It is intentionally a one-time, atomic migration, not a destructive reset script.
3. Set `ABURII_SUPABASE_URL`, `ABURII_SUPABASE_ANON_KEY`, and `ABURII_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` or the hosting environment. Only server code reads these. All variables are prefixed `ABURII_` to avoid accidentally inheriting BiBiChik configuration.
4. Set `ABURII_SITE_URL` to the exact browser origin, with scheme and no trailing slash; e.g. `https://booking.your-aburii-domain.example`. POST requests require that exact Origin. Set `ABURII_RATE_LIMIT_SECRET` to a freshly generated random secret (at least 32 bytes).
5. In Supabase Auth, disable public signup and invite Aburii's staff. Use Supabase's invitation/recovery flows to establish passwords. No passwords are stored in this project.
6. In the private SQL editor, register the invited user's UUID:

```sql
insert into aburii.staff(user_id, role)
values ('REPLACE_WITH_ABURII_AUTH_USER_UUID', 'admin');
```

Roles are `admin`, `manager`, `staff`. All active staff can inspect reservations, transition status and assign compatible rooms. Only admins can configure inventory and policies. Managers/admins also see notification queue health. Role checks read the database on every staff RPC; disabling `active` revokes staff capabilities even for an existing token. Provisioning and role administration use trusted Supabase access, not a public registration screen.

7. Sign in at `/staff`, open Booking settings, and enter **verified** counter capacity, party limits, room inventory, dining durations, service start times, advance notice, horizon and hold duration. Enable each area when ready. Defaults are illustrative policy values and both areas are disabled; there are no room or service defaults.
8. Approve the text in `app/policies/page.tsx` before enabling live bookings, replace the `2026-11-draft` policy version in the migration for a fresh installation (or a separately reviewed forward migration if already deployed), and establish a personal-data retention policy. See `LAUNCH.md`.

## Customer experience

Customers select only Counter Seating（吧台）or Private Room（包间）using responsive cards. No floor plan, table number or room identifier appears in the public API or booking receipt. Date, start time, guests, name, international phone and policy consent are required. Email and requests are optional. WhatsApp updates require a separate optional opt-in.

The server validates JSON sizes and request fields. Availability returns start/end times and applicable minimum spend. A database transaction rechecks all rules at submission. A request ID provides idempotent retries; reusing an ID with a changed payload fails. A successful request shows its actual stored status, reference, expiry and minimum spend. It does not claim staff confirmation.

## Capacity and status rules

- All mutations acquire the restaurant settings row `FOR UPDATE` first. Concurrent bookings, staff actions and settings edits follow the same locking protocol. Public, authenticated and service-role clients have **no direct table access**; only specifically granted RPCs may write.
- Counter capacity is enforced at the **peak occupancy** during the whole requested interval, including reservations with different start times. Adding the totals of all overlapping bookings would incorrectly reject some valid bookings; tests cover this distinction.
- A private booking reserves the smallest compatible available room internally. This guarantees a valid, exclusive allocation. Before scheduled start, staff can reassign to another compatible room only after another overlap check. Reassignment is blocked once the original interval starts. Allocations are stable: the algorithm does not automatically reshuffle existing bookings to optimize future requests.
- Intervals are half-open `[start,end)` so consecutive reservations can share capacity. Counter and room inventory are independent.
- Pending reservations hold capacity until `min(created + configured hold, reservation start)`. Every capacity read ignores holds that expired **before** the scheduled start even if a scheduler is offline. A hold that reaches the scheduled start without prior release commits its original interval, including if expiry is materialized at or after the start. Mutations and the notification worker materialize expiry and queue opted-in updates. Holds cannot be revived or confirmed after expiry.
- Flow: pending → confirmed/declined/cancelled; confirmed → seated/cancelled/no_show; seated → completed/cancelled/no_show. Terminal states cannot be reactivated. Compare-and-set status updates detect conflicting staff edits. Seating is allowed from 30 minutes before start until the booked end; no-show is allowed only after start.
- Cancellation, rejection and expiry **before scheduled start** release future capacity immediately. Once scheduled start is reached, any unreleased commitment remains occupied until the original scheduled end, including Completed, Cancelled, No-show and expiry at start. The database records pre-start release time independently of current status. These rules apply independently to counter seats and private rooms. Early completion does not resell the interval.
- Dining duration and minimum spend are snapshotted. Changing future rules does not alter existing bookings. Changes to rooms or counter capacity are blocked while any active interval remains; cancel/reconcile affected bookings first. Hours and closures affect new requests only; they do not cancel existing reservations.
- Weekly starts use MYT (Asia/Kuala_Lumpur). A date-specific entry **replaces** that area's weekly starts, including `times: []` for a closed date. A temporary closure blocks any overlapping interval. Times are approved **start times**; each holds the full configured duration, so the administrator must ensure the final start ends within the intended service.

## Staff operations

The dashboard refreshes every minute and supports service date, area, status and customer/reference/phone search; confirmation, decline, cancellation, seating, completion and no-show; internal room reassignment; and admin settings. It displays up to 2,000 bookings from seven days ago through the booking horizon. Historical reporting and bulk exports are not included. Actions and configuration versions are audited privately.

Auth uses Supabase password authentication with HttpOnly, SameSite=Strict cookies restricted to `/api/staff`. Access tokens expire with the provider session; refresh tokens rotate through the server, remain HttpOnly and have a 12-hour cookie lifetime. Logout attempts provider revocation and clears cookies. Use HTTPS in production. Sensitive responses are `no-store`; no personal information or credentials are logged by the application.

## WhatsApp delivery

No messages are sent during setup or testing. `scripts/notifications.mjs` requires a separately owned Aburii WhatsApp Business sender and an approved **utility** template. Set all `ABURII_WHATSAPP_*` variables in the server scheduler environment. Supply the currently supported Meta Graph API version explicitly; none is guessed or hardcoded.

The approved template must accept these six body parameters, in order:

1. Booking reference
2. Status (`pending`, `confirmed`, `cancelled`, `declined`, `seated`, `completed`, `no_show`, `expired`)
3. Reservation date/time in MYT
4. Dining category
5. Number of guests
6. Assistance and pending-confirmation wording

Schedule `npm run notifications` every minute using the host's cron/service scheduler, with the same Aburii-only environment. It expires holds, then claims at most ten queued messages with `FOR UPDATE SKIP LOCKED` and a five-minute lease. An obsolete unsent status is discarded. Lease-matched acknowledgements prevent stale workers acknowledging a newer claim. Failures retry with exponential backoff up to eight attempts; dashboard queue health shows exhausted retries. Investigate exhausted jobs via trusted database access. Never blindly resend messages after a provider timeout.

Delivery is **at least once**, not exactly once. A provider acceptance followed by a network failure can produce a duplicate. Provider HTTP acceptance is recorded as delivered; webhook-based read/delivery receipts, inbound WhatsApp replies and automated email delivery are not implemented. No customer messages are sent without explicit opt-in. Staff alerts are in the dashboard, not outbound staff WhatsApp messages.

## Tests and security

```sh
npm run typecheck
npm test
npm run build
npm audit
```

`npm test` requires local PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) on PATH. It creates a new temporary cluster with TCP disabled and a unique Unix socket, mocks only Supabase's auth roles/`auth.uid()`, executes the actual migration, and tests real SQL and concurrent transactions. It never connects to a configured Supabase URL and removes its test cluster afterward. Do not run it as root. Supabase's live Auth/REST gateway and Meta delivery require separate staging verification.

The integration suite covers authorization, independent inventory, overlap peak capacity, simultaneous seat/room requests, retries, expiry, status transitions, room reassignment, configuration versions, special hours, closures, notice, party limits, audit, notifications and shared rate limits. The migration pins empty function search paths, qualifies data references, enables RLS without public policies and revokes default function grants inside the same transaction.

Rate limits persist in PostgreSQL across instances. Set `ABURII_TRUSTED_CLIENT_IP_HEADER` only when a trusted reverse proxy overwrites the header and direct backend access is blocked. Without it, the application uses conservative **shared** limits (60 booking/auth requests and 240 availability requests per minute) across visitors. With a trusted client header, limits are 10 booking/auth and 60 availability requests per client/minute. Add edge/gateway abuse controls for a public launch.

## Node / GoDaddy deployment

Use a GoDaddy plan that can run a persistent Node.js process with Node 22.13+ and HTTPS reverse proxying. A static/PHP-only plan cannot run this app. No GoDaddy account or hosting plan was available to verify or configure.

```sh
npm ci
npm run build
npm start
```

The build script produces `.next/standalone`, including public assets and `.next/static`. The start script runs its standalone `server.js`. Configure `PORT` and `HOSTNAME` as required by the host. For an upload-only deployment, copy the **contents** of `.next/standalone` to the application directory and run `node server.js`; keep runtime secrets in the host's environment. Build on the same OS/architecture as the target host, preferably in CI or on the server. Configure the proxy to preserve Origin and use the same canonical origin as `ABURII_SITE_URL`. Restart after environment changes. Configure encrypted backups and verify restore in a separate environment before launch.

## GitHub

This directory is an independent Git repository on `codex/initial-aburii`. No existing parent remote is reused. Create a new, empty private GitHub repository named `aburii-booking-system`, then run from this directory:

```sh
git remote add origin YOUR_NEW_ABURII_REPOSITORY_URL
git push -u origin codex/initial-aburii
```

Never point it at BiBiChik's repository. No GitHub connector/CLI account is configured in this session, so a remote repository was not created or pushed. No production service was provisioned or deployed.

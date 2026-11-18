# Aburii Production Supabase preparation

## Latest inspection

See `PRODUCTION-MIGRATION-REVIEW.md` for the 2026-11-17 authenticated read-only Production catalog/Auth review and exact approval plan. Keys are now privately configured; the application schema is fresh and compatible. Public signup/default Auth origin/SMTP setup, actual archive recovery and local 001→002→003 rehearsal now pass; staff onboarding settings still need review. Migration preflight is GO for explicit owner approval, with no Production migrations executed. The publishable-key REST 401 has been resolved as expected OpenAPI endpoint protection; normal Data API authorization passes. See `PRODUCTION-BACKUP-RECOVERY.md` and `PRODUCTION-AUTH-CHANGE-PLAN.md` for the remaining gates. No Production migrations were executed. The original preparation notes below describe the state before that inspection.

## Confirmed project and current state

Owner-confirmed project reference: **oemwlqisfwrhfxsvuszi**. API origin: **https://oemwlqisfwrhfxsvuszi.supabase.co**. This reference is public, not a credential.

Hosted connections in the application and notification worker are pinned in `lib/supabase-config.mjs` to this exact reference and HTTPS origin. Changing only environment variables cannot switch to another project. Paths, embedded credentials, query strings, custom domains and unexpected local flags are rejected. API keys are opaque, so their ownership cannot be proved offline: obtain both from this exact project's dashboard. No BiBiChik project identifier, connection string, account, database or secret is needed or read.

No remote connection, SQL execution, invitation email, deployment or public launch was performed during preparation. There are no production keys in this repository. Local synthetic accounts/data remain isolated behind the explicit development launcher. They must never be copied into Production.

## Secure environment

Use the ignored, owner-only `.env.production.local` for local production-configuration review, or the hosting provider's server-side secret store later. The prepared file contains the pinned public URL/reference and empty secrets. It is not a deployment. Do not paste keys/passwords into chat, screenshots, command arguments or issue/PR text.

| Variable | Source / purpose |
| --- | --- |
| `ABURII_SUPABASE_PROJECT_REF` | `oemwlqisfwrhfxsvuszi`; required exact pin |
| `ABURII_SUPABASE_URL` | Exact API origin above |
| `ABURII_SUPABASE_PUBLISHABLE_KEY` | This project's `sb_publishable_…` key; server-side Auth requests and staff RPC client identity |
| `ABURII_SUPABASE_SECRET_KEY` | This project's `sb_secret_…` key; server-only public reservation/rate-limit RPCs and notification worker |
| `ABURII_SITE_URL` | Approved application HTTPS origin without trailing slash; not the Supabase API URL |
| `ABURII_RATE_LIMIT_SECRET` | A new random Aburii-only secret, at least 32 characters; generate/store through a password manager |

Do not set the former `ABURII_SUPABASE_ANON_KEY` / `ABURII_SUPABASE_SERVICE_ROLE_KEY` variables or any `NEXT_PUBLIC_ABURII_SUPABASE_*` variables. Legacy keys are deliberately rejected. No API key is sent to the browser in this architecture. `lib/server.ts` is marked `server-only`; only API routes import it.

API keys go in `apikey`. A staff access JWT goes in `Authorization: Bearer …`, together with the publishable API key. Anonymous Auth requests use publishable `apikey` only; privileged server RPCs use secret `apikey` only. Redirects are rejected to avoid forwarding credentials elsewhere. The explicit non-production loopback adapter is the only compatibility exception for its synthetic key headers.

After privately filling the file, run from this Aburii repository:

```sh
chmod 600 .env.production.local
node --env-file=.env.production.local scripts/production-check.mjs
```

This is **offline**: it validates project pin, key formats, HTTPS app origin, rate secret and migration checksums. It prints no supplied configuration values or credentials. A passing result is not proof of key ownership, remote database state or live Auth behavior. It does not run migrations. Ordinary `npm run production:check` uses only the current process environment; it does not automatically load Next.js env files.

## Migration review and execution plan

The immutable sequence is recorded with SHA-256 hashes in `supabase/migration-plan.json`:

1. `001_aburii.sql` — independent private schema/tables, RLS, RPC grants, capacity locking, original-interval commitments, expiry, audit, outbox and staff roles. New empty Aburii project only; one-time, not idempotent.
2. `002_staff_workspace.sql` — existing staff read/list/detail/Today/archive RPCs and indexes. No reservation migration.
3. `003_operating_hours.sql` — official MYT service windows, duration-aware arrivals, and fail-closed public launch settings. Preserves existing reservations; resets weekly defaults/launch flags only on first application.

Before **any remote write**, verify in the Supabase dashboard that the active project reference exactly matches the owner-confirmed reference, review project ownership/access, inspect its migration state through trusted administration and review backups/recovery. Do not use a previously linked CLI target, a generic `DATABASE_URL`, a parent repository environment or any BiBiChik resource. If `aburii` already exists, stop and reconcile checksums/applied versions; never rerun 001 or drop anything. Do not copy local development schemas, sessions, accounts, demo data or configuration into Production.

Only after the review/blockers are resolved and remote execution is authorized, use this exact project's trusted SQL editor to apply outstanding files in order. Each migration is transactional, but the three-file sequence is not a single transaction; if one fails, stop, diagnose and continue only from a known state. No automated remote apply command is provided or run. Configure the Data API to expose `public` only, never `aburii`; the application's RPC-only design needs no exposed private tables.

Then run `supabase/verify_production.sql` in this exact project. It is a read-only transaction that rolls back, checks all three launch flags are false, validates official hours/RLS/private table privileges and representative RPC grants, and returns no personal data. It is included in the local migration test sequence. Do not use it as a project-identity check; that must happen before connecting.

## Admin and Staff authentication

Supabase Auth issues sessions; no production passwords are hardcoded. Existing access/refresh cookies remain HttpOnly, SameSite=Strict, Secure in Production and scoped to `/api/staff`. Login and refresh verify active database membership before setting cookies. Every staff RPC resolves current `aburii.staff` membership; changing an account to inactive revokes authorization even while its JWT remains valid. Admin settings require `admin`; do not derive roles from editable Auth user metadata.

Preparation for the owner in the **Aburii project's** Auth dashboard:

1. Disable public signups and anonymous users. Enable email/password Auth. Configure an approved mail sender/SMTP, password policy (at least 12 characters; use unique passwords), secure email-change/password settings and suitable session limits. Assess the organization's MFA requirements before launch; this implementation has no MFA enrollment/challenge UI.
2. Set Auth Site URL to the approved application HTTPS origin. Use exact allowed redirects; no Production wildcards or inherited BiBiChik URLs. No invitations are sent by this preparation task.
3. Set the **Invite user** email action link to:

   ```html
   <a href="{{ .SiteURL }}/staff/password#token_hash={{ .TokenHash }}&amp;type=invite">Set your Aburii staff password</a>
   ```

   Set the **Reset password** action link to:

   ```html
   <a href="{{ .SiteURL }}/staff/password#token_hash={{ .TokenHash }}&amp;type=recovery">Reset your Aburii staff password</a>
   ```

   These are custom TokenHash templates; default confirmation-link templates do not target this flow. The fragment avoids sending the one-time token in a URL request/access log. The page strips it from browser history and verifies it only after explicit password submission. Do not add analytics or third-party scripts to this page, enable request-body logging, or share these links.
4. When authorized to onboard a staff member, invite their approved work email using trusted Auth administration. Record the resulting Auth UUID and provision membership **before they open/submit the link** in this Aburii project's SQL editor:

   ```sql
   -- Replace the placeholder with that invited Aburii Auth user's UUID.
   insert into aburii.staff(user_id, role, active)
   values ('REPLACE_WITH_ABURII_AUTH_UUID'::uuid, 'admin', true);
   -- For ordinary Staff, use role 'staff'; do not give every user admin.
   ```

   Use explicit inserts; do not silently overwrite existing roles. Existing valid roles `admin`, `manager`, `staff` remain unchanged. No Admin/Staff account is automatically created.
5. The invite/recovery form calls Supabase `/auth/v1/verify`, checks active staff membership using the returned user JWT, then updates that user's password. Only a successful result sets the normal HttpOnly staff session and returns to `/staff`. Expired/replayed/missing links, nonstaff users and inactive memberships cannot establish an app session. If setup fails after consuming a link, request a new authorized recovery link. Passwords, token hashes, JWTs and refresh tokens are never returned in the API response.
6. Recovery is initiated through trusted Auth administration, not a public signup/reset endpoint. Mail generation/delivery and live Supabase Auth behavior must be tested with approved recipients later; the isolated local adapter does not implement these mail flows.

## Booking gate and preserved behavior

All three flags remain **false**: `publicBookingsEnabled`, `capacitiesConfirmed`, `policiesConfirmed`. The application has no environment switch that enables them. The database returns no public slots and rejects creation until an Admin explicitly approves capacities/policies and enables public booking. Keep them false throughout this preparation and initial authentication testing. Do not start the WhatsApp worker or attach a scheduler until its separate sender/templates/recipients are approved.

Counter Seating and Private Room retain independent capacity checks and transactional locking. Official hours remain Monday closed, Tue–Fri dinner 18:00–22:30, Sat/Sun lunch 12:00–14:30 and dinner 18:00–22:30, Asia/Kuala_Lumpur. Durations/arrival intervals stay configurable and bookings cannot cross service end. Post-start capacity commitments, pending expiry, status actions, permissions, archives, audits and WhatsApp workflow are unchanged. No migration file was edited during production preparation.

## Initial preparation blockers (superseded by the latest inspection above)

- Keys from the confirmed Aburii project have not been provided through a secure environment; opaque-key ownership is unverified.
- Approved application HTTPS origin is not supplied; there is no approved deployed target for Auth emails/redirects.
- Remote schema/migration state, Data API exposure, backup configuration and SMTP/Auth dashboard settings have not been inspected or changed.
- Approved real Admin/Staff identities and role assignments are not supplied; no invitations sent and no remote accounts provisioned.
- Hosted Supabase gateway/Auth/invitation/recovery testing is outstanding. Local tests do not emulate the hosted gateway's API-key-to-role translation.
- Actual seating capacities, final policies, end-to-end booking/expiry/concurrency and WhatsApp delivery approvals remain launch blockers. Public booking must remain off.

These blockers are reported before any remote change. Nothing in this document authorizes deployment, mail delivery or enabling live reservations.

## References

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/redirect-urls

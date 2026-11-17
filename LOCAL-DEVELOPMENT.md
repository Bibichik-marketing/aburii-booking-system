# Password-protected local Admin environment

The existing Aburii authentication configuration was absent: there were no Aburii Supabase environment values or local `.env` files. Docker/Supabase CLI are not installed on this machine. The development setup therefore provides a **loopback-only Supabase-compatible Auth/RPC adapter backed by a separate real PostgreSQL cluster**. This is not the hosted Supabase Auth service or a complete GoTrue implementation.

The normal application still follows its existing password-login → HttpOnly cookie → authenticated staff RPC architecture. The adapter verifies a generated password, issues random expiring sessions and establishes the verified user's `auth.uid()` for the **unchanged** database functions. It never grants Admin privileges merely because a development flag or browser value is present. Real staff membership checks, settings validation, booking transactions, capacity controls and audit logs execute in PostgreSQL.

## Log in now

The local environment is running at **http://localhost:3100/staff**. Use exactly `localhost`, not `127.0.0.1`, in the browser, because the existing Origin check is configured for the former.

Email: **admin@aburii.test**

To retrieve the generated password privately, open your own interactive terminal:

```sh
cd /Users/josephine/Documents/GitHub/review/aburii-booking-system
npm run local:credentials
```

Copy the displayed password into the Staff login form and select Sign in. The account has the Admin role and can access Staff Dashboard, reservation actions, the read-only timeline and Admin Settings. The retrieval command refuses noninteractive output, preventing credentials from being printed into automation logs. Do not paste the password into chat or reuse it elsewhere.

## Restart later

From this project directory:

```sh
npm run local:start
```

Keep that process running while using the dashboard. Ctrl+C stops the local app and auth adapter; the isolated database and synthetic data persist. `npm run local:stop-db` stops the database after the app has stopped. `npm run local:setup` is idempotent: it preserves an existing verified local environment rather than resetting its account, password or records.

Prerequisites are Node.js 22.13+, the installed npm dependencies, and PostgreSQL CLI tools (`initdb`, `pg_ctl`, `psql`) on PATH. All are available on this machine. No Docker, remote Supabase account or external connection is required.

## Security boundaries

- Every local command refuses `NODE_ENV=production`. The production `npm start` entry point does not import the development service or load its private configuration. `npm run dev` alone also does not activate the adapter; use the explicit `local:start` launcher.
- The app binds to 127.0.0.1:3100 and the local API to 127.0.0.1:3112. The PostgreSQL cluster has **no TCP listener**; its Unix socket is in an owner-only directory under `/tmp`. Its database identity is verified before startup.
- State lives only in this repository's ignored `.local-dev/` directory, mode 0700. Configuration and the password-retrieval file are mode 0600. No `.env` files, BiBiChik settings, customer data or production secrets were copied.
- The password is randomly generated with 192 bits of entropy. The database stores a salted scrypt password hash, never plaintext. The owner-only retrieval file contains the generated plaintext so you can log in; protect that file as a credential. Passwords and session tokens are not printed by setup, server, checks or chat.
- Access tokens expire after one hour. Refresh tokens rotate and have a fixed twelve-hour lifetime. Only token hashes are stored in the local database. Logout revokes the session. Invalid passwords, forged tokens, missing client keys, cross-origin requests and revoked staff membership are rejected.
- The adapter exposes only the password, refresh, logout and existing UI RPC operations. It has no sign-up or password recovery route and no table-reading endpoint. It is a development utility, not a substitute for production Supabase Auth, MFA, recovery, mail verification or other production identity features.
- The launcher removes inherited Aburii integration variables before passing fresh **local-only** configuration to Next.js. Production authentication and the production migration remain unchanged. No development key or password is embedded in application source or bundles.
- The bilingual banner identifies the local development environment. Production rendering cannot show it because it also requires `NODE_ENV=development`.

## Synthetic data and messages

All initial reservations, customer names, contacts, rooms and capacities are synthetic, labeled DEMO and use reserved example domains/numbers. The capacities are illustrative and do not represent real Aburii inventory. Use synthetic information only when creating further test bookings.

The synthetic seed contains pending, confirmed, completed and cancelled reservations, including tomorrow's service. Existing capacity restrictions still apply. For example, inventory changes may be blocked until active future reservations are cancelled/rejected or their original intervals end; Admin Settings does not override those rules.

No WhatsApp/email worker is started, and the launcher supplies no provider credentials. Automatic message delivery is disabled. The existing manual WhatsApp action is still a normal external chat link; do not use it to contact real people while testing.

## Verification

`npm run local:check` reads credentials in memory without displaying them and tests actual HTTP login, rejection of a wrong password, unauthorized and forged-token rejection, Admin role/data, settings save, synthetic booking creation, confirmation, room reassignment, cancellation, audit entries, refresh rotation, logout/revocation, private file permissions, no queued notifications, production startup refusal and noninteractive credential-output refusal. It creates a synthetic cancelled check reservation; no real messages are sent.

The production build, TypeScript checks and all 57 automated tests passed. The normal browser login page was verified with the development banner and without a password being entered by the agent. BiBiChik and production services were not accessed or modified. Nothing was deployed.

Official service windows and the launch gate are documented in `OPERATING-HOURS.md`. Run `npm run local:migrate` for an existing local database. Public booking remains disabled; the local check verifies this without enabling it. Existing synthetic reservations are preserved.

The launcher now injects `ABURII_SUPABASE_PUBLISHABLE_KEY` / `ABURII_SUPABASE_SECRET_KEY` names with its synthetic adapter keys and an explicit loopback-only development flag. Hosted connections require the pinned Aburii project and modern key formats. Production invite/recovery uses real Supabase Auth; see `PRODUCTION-SUPABASE.md`. The local adapter still does not send emails or implement invitation/recovery.

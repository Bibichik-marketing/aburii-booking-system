# Aburii Production migration approval plan

Project: `oemwlqisfwrhfxsvuszi` only. Review date: 2026-11-17, Asia/Kuala_Lumpur.

**Database/source compatibility: PASS. Production Auth/launch readiness: FAIL. Execution: NOT APPROVED / NOT RUN.** The authenticated dashboard and catalog inspection now confirm a fresh application schema and required PostgreSQL/Auth prerequisites. Only metadata SELECTs inside a READ ONLY transaction were executed remotely; no Production migrations, schema/data writes or Auth configuration changes were performed. The remaining Auth/API and recovery-plan issues below must be reviewed before final approval; they must not be mistaken for a capacity-rule failure.

## Read-only observations

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Exact target and saved key format | PASS | Server configuration pins the owner-confirmed HTTPS origin and project reference; keys are not printed |
| Secret-key REST metadata | PASS | HTTP 200; only `/` and `/rpc/rls_auto_enable` are advertised; no table definitions and no Aburii RPC paths |
| Private schema exposure | PASS for API exposure only | `Accept-Profile: aburii` returns HTTP 406 / `PGRST106`; this proves it is not an allowed Data API profile, not that the schema does not exist |
| Public Auth settings | PASS for reachability | HTTP 200; email enabled, mail auto-confirm false, phone auto-confirm false, anonymous users disabled |
| Staff-only signup configuration | FAIL | `disable_signup=false`: public signup is currently enabled. Do not change it as part of this read-only review; disable through separately authorized Auth configuration before staff onboarding/production use |
| Publishable key / Data API | PASS — 401 diagnosed | The root OpenAPI endpoint returns 401 "Secret API key required" by design. A normal GET to a known nonexistent public table with limit=0 returns 404/PGRST205 for the saved key; a deliberately invalid-key control returns 401. Headers use apikey only. No RLS/key rotation/private-schema changes are needed. Staff JWT/role flows still require later authorized account testing |
| Full catalog / initial schema | PASS | Authenticated Aburii dashboard plus catalog query: PostgreSQL 17.12, read_only=on, executor postgres, schema CREATE and Auth REFERENCES privileges true; auth.users/auth.uid()/UUID generator exist; expected API roles exist; zero application tables, no aburii schema, no Aburii-prefix functions, no migration-history table |
| Platform defaults/event triggers | PASS for reviewed behavior | Seven platform event triggers inspected by catalog. Existing public.rls_auto_enable() definition inspected: it applies only to public, not aburii. Public default ACLs are schema-scoped; explicit migration grants/revocations remain required and were tested locally |
| Auth origin and redirects | FAIL for onboarding/launch | Site URL is http://localhost:3000; redirect allowlist is empty. Approved HTTPS origin is still needed |
| Auth email delivery/templates | FAIL for onboarding | No custom SMTP; dashboard says default templates are used and custom SMTP is required to edit them. Required /staff/password TokenHash invite/recovery templates are not configured |
| Password-related settings | REVIEW REQUIRED | Secure email change enabled; secure password change and current-password-on-update disabled. Minimum password value was UI-redacted and was not extracted. Application setup enforces at least 12 characters; hosted policy and session/MFA requirements need separate approval |
| Recovery protection | Export PASS; actual archive restore BLOCKED | Full Production archive, password-free roles, listing/payload/hash/private-permission checks passed through verified Session pooler TLS. The native local environment lacks supabase_vault and a container runtime. A compatible isolated restore target must be selected before full recovery validation. See PRODUCTION-BACKUP-RECOVERY.md |

No customer/staff rows, passwords, JWTs or secret keys were displayed. Remote inspection used GET metadata requests, authenticated dashboard reads and catalog-only SQL in BEGIN READ ONLY / ROLLBACK. No migration file was loaded into the remote editor. Only the confirmed Aburii project was inspected; its organization/account display name is shared branding, not evidence of a BiBiChik database connection. No other project was opened.

## Immutable migration order

Checksums are in `supabase/migration-plan.json`; keep all three original files unchanged.

| Order | Exact file | Effect | Preconditions / risk |
| --- | --- | --- | --- |
| 1 | `supabase/001_aburii.sql` | Creates private Aburii schema, six tables, constraints, indexes, RLS and RPC-only access; settings start with both areas disabled, zero counter capacity, no rooms/services | Fresh installation only. Stops on an existing schema/function; never drop objects to force it through |
| 2 | `supabase/002_staff_workspace.sql` | Staff context/list/detail/Today/archive functions plus indexes; archives stored as audit events | Requires 001. `CREATE OR REPLACE` means unexpected pre-existing Aburii functions must first be investigated |
| 3 | `supabase/003_operating_hours.sql` | Official service windows, duration-aware arrivals, configurable interval and fail-closed public gate; original Admin validator becomes private | Requires 001 and 002. First application resets weekly service defaults, removes obsolete weekly starts, retains date overrides/inventory/bookings, and sets all three launch flags false. Reapplication preserves later Admin configuration; do not assume it will close a previously enabled installation |

No migration drops/truncates tables, deletes reservations or copies development/customer data. Migration 003 deliberately changes settings and appends an audit event, and moves/replaces functions. This is safe only after confirming the initial schema state. Do not assume a remote transaction can be rolled back after it has committed.

## Requirement coverage

| Requirement | Implementation | Local result |
| --- | --- | --- |
| Reservation records, consent, customer contacts, optional fields and references | 001 bookings constraints, `aburii_book`, original intervals, policy/consent snapshot and request-ID idempotency | PASS |
| Counter Seating capacity | Settings guest capacity; peak occupancy over overlapping half-open intervals; serialized settings-row lock | PASS, including concurrent last-seat requests |
| Private Room capacity and room assignment | Internal compatible room allocation and overlap validation; one/multiple configurable rooms; assignment before start only | PASS, including parallel requests and post-start retained room commitments |
| Independent availability | Each request evaluates only its own counter/private inventory; customer selects area category only | PASS |
| Capacity lifecycle | Pre-start cancellation/rejection/expiry release; post-start completion/cancellation/no-show preserves original commitment to original end | PASS |
| Pending expiry and confirmation | Logical expiry for reads/availability plus locked materialization on mutation; expired holds cannot be confirmed | PASS |
| Admin Settings | Admin-only configure, optimistic version, validated inventory/durations/intervals/notice/horizon/closures/minimum spend; prevents invalidating existing allocations | PASS |
| Staff roles | Auth UUID foreign key, active membership and `admin`/`manager`/`staff`; role checked per RPC; no automatic accounts or invitations | PASS |
| RLS and permissions | RLS enabled on settings/staff/bookings/audit/outbox/rates; no table access granted to API roles; explicit service vs authenticated RPC grants; pinned function search paths | PASS locally; Production catalogs pending |
| Dashboard/Today/Pending Approval/archive | 002 all-date search/filter/sort/pagination and effective status; Pending Approval reuses these APIs without new schema/status | PASS |
| Official hours and timezone | 003 Monday closed; Tue–Fri 18:00–22:30; weekends 12:00–14:30 and 18:00–22:30, Asia/Kuala_Lumpur; full duration must fit a single period | PASS |
| Notifications and audit | Transactional outbox, opted-in updates, leases/retries/superseded-state protection; no worker is started during migration | PASS |
| Public booking gate | 003 initializes `publicBookingsEnabled=false`, `capacitiesConfirmed=false`, `policiesConfirmed=false`; slots empty and new booking rejected until explicit Admin approval | PASS |

Capacity protection relies on the RPC-only privilege boundary and transactional locks, not a room exclusion constraint. Trusted SQL administrators must not insert/alter reservations outside these RPCs. The private schema must never be added to exposed API schemas. Do not alter unrelated Supabase system roles, functions or event triggers.

## Remaining approval gates

The verified schema is suitable for the fresh 001→002→003 sequence. Public signup/default Auth origin/SMTP/password policy and staff account end-to-end testing are onboarding/API/launch blockers; they do not require changing the migration files. The 401 is resolved as expected protection on OpenAPI metadata. A verified Production backup and actual archive recovery evidence are still required before final execution approval; see `PRODUCTION-BACKUP-RECOVERY.md`. No keys should be pasted into chat. API Auth-settings HTTP 200 alone was not sufficient to verify publishable-key Data API access.

The dashboard displays an active Supabase technical-issue banner. Its relevance to this project was not established; recheck service health before any authorized execution. The 401 was subsequently confirmed as deliberate OpenAPI endpoint protection, not an outage or bad key. See the Supabase changelog link below.

## Exact execution plan — only after final approval

1. Reconfirm project reference oemwlqisfwrhfxsvuszi in the trusted dashboard at execution time. Owner sign-in and catalog inspection are complete. Review the remaining API/Auth findings, approve a recovery approach, and obtain explicit migration-only approval. No Auth settings changes are included in that approval unless separately authorized.
2. Run only `supabase/inspect_production.sql` in the Aburii project's trusted SQL session. It wraps catalog SELECTs in `BEGIN READ ONLY … ROLLBACK` with timeouts. Review server version, `auth.users`, `auth.uid()`, UUID generator, expected roles, existing schemas/tables, all Aburii-prefix functions, event triggers, default ACLs and policies. It selects no user records or secret values. Inspect migration-history details if its table exists; do not infer that hand-run SQL files appear in Supabase CLI migration history.
3. Fresh-install acceptance criteria: no existing `aburii` schema, no `public.aburii_*` functions/overloads or other conflicting objects; required Auth objects/roles exist; trusted execution role can create the schema/functions and issue grants; default privileges/event triggers do not undermine explicit revocations; backup/recovery approach is reviewed. Existing unrelated application tables or migration history require explicit reconciliation. If anything differs, STOP and revise the plan; do not overwrite/drop or automatically skip files.
4. After explicit approval, open **the same verified Aburii project** SQL editor and execute the exact contents of `001_aburii.sql`. Require transaction success before continuing. It creates no staff/reservations and exposes no live booking slots. Do not run local setup/seed scripts remotely.
5. Execute the exact contents of `002_staff_workspace.sql`; require transaction success. Then execute the exact contents of `003_operating_hours.sql`; require transaction success. Each file has its own BEGIN/COMMIT. There is no single cross-file transaction. If a step fails, stop and inspect that step's rollback/committed state; never restart at 001 blindly.
6. Immediately run the read-only post-migration checks below. Record migration checksums, executor and results privately. Do not invite users, start a worker, connect the local preview to Production, enable capacities/launch flags or deploy anything.

No database URL/password, CLI link, management token, API secret or destructive reset command is embedded in this plan. Do not use an inherited CLI linked target or a parent repository environment.

## Exact post-migration verification

Execute these local files as SQL only after an approved migration in the confirmed project:

1. `supabase/verify_production.sql` — checks one settings record, all three launch flags false, official hours/version, all six tables with RLS, private schema/table access denial, and representative service/authenticated RPC grants. Read-only transaction ends in ROLLBACK.
2. `supabase/verify_production_full.sql` — fresh-install checks for no seeded staff/bookings/outbox/rates, disabled areas/zero counter/no rooms, all 15 public Aburii RPCs with the exact anon/authenticated/service grant matrix, no API-role execution of internal functions, and pinned search paths. Read-only transaction ends in ROLLBACK. Run before provisioning accounts or any application traffic, because it intentionally expects an empty installation.
3. Re-run read-only REST metadata inspection: only the intended Aburii public RPCs should be added alongside existing platform functions; no Aburii tables exposed, and the `aburii` profile remains rejected. Preserve the baseline `rls_auto_enable` platform function.
4. Using only SELECT/read-only availability checks after approval, confirm both areas report `bookingOpen=false` and zero slots for an otherwise open date, and Monday has no slots. Do not invoke book/status/configure/expiry/notification RPCs as a "read test"; some write even when their names sound administrative.
5. Confirm Admin Settings/Staff authorization and full Supabase Auth login/refresh/logout/invite/recovery later under separately approved staff provisioning. Do not create a test user or invite someone during this review. Keep all launch flags false until real capacities, policies and end-to-end tests are explicitly approved.

## Local validation performed

`npm test` passes **89/89** tests in a disposable PostgreSQL cluster with TCP disabled. The runner now also executes `inspect_production.sql` before the sequence and both verification files after 003, before fixtures. No configured Supabase URL is used by those database tests. The original three migration checksums remain unchanged.

Local SQL tests do not prove the Production database has no private objects, has the same event triggers/default ACLs/Postgres version, or has secure Auth dashboard settings. Production catalog observations are now recorded above. Final live Auth/API behavior, backup/recovery approval and all launch readiness checks remain distinct from the passing schema compatibility review.

References: Supabase [API security](https://supabase.com/docs/guides/api/securing-your-api), [custom schema exposure](https://supabase.com/docs/guides/api/using-custom-schemas), and [read-only Management API query](https://supabase.com/docs/reference/api/v1-read-only-query). Project API keys do not replace trusted dashboard access or an appropriately scoped Management API token for catalog inspection.

## Remaining preflight completion update

API authorization is PASS, with the OpenAPI root restriction explained by Supabase's [documented change](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key). The earlier inference that this 401 implied a publishable-key problem was incorrect.

A new isolated recovery drill passed against existing synthetic local data, including effective table/function permissions and RLS. It did not create a Production backup. The database password is now configured privately, and the downloaded CA is installed with verify-full, but direct endpoint DNS is blocked by this environment's IPv6 lookup limitation. A verified Session pooler host is needed before a full read-only Production export can run; the real archive then needs an isolated compatible restore check. **Current migration decision: NO-GO until that backup/recovery gate passes, followed by explicit migration approval.**

Auth changes and the still-undecided HTTPS origin/redirect/SMTP setup are prepared in `PRODUCTION-AUTH-CHANGE-PLAN.md`; no remote Auth changes were made. The original three migration hashes and their proven fail-closed launch behavior remain unchanged. The passed 89-test suite was not rerun during this remaining preflight.

## Production export completion update

The password authenticated successfully through the supplied Session pooler. The Supabase CA and verify-full are in use. The real Production dump and password-free role export were created; full payload readability, checksums and private permissions passed. Startup PGOPTIONS are ignored by this pooler, so the exporter's metadata check now explicitly starts a read-only transaction; pg_dump itself uses a read-only snapshot. No remote configuration was changed.

The remaining recovery blocker is a compatible isolated restore environment: this archive includes supabase_vault, which is absent locally, and no container runtime is installed. User preference for a local Docker/Supabase recovery environment versus a separately approved recovery project is pending. The full actual archive has not been restored, so the migration decision remains **NO-GO**, not a conditional or inferred recovery PASS. The previously passed migration suite was not repeated.

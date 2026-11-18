# Aburii Production migration execution — 2026-11-18

Project: `oemwlqisfwrhfxsvuszi` only. Owner explicitly approved execution.

**Database migration stage: COMPLETE / PASS.** All three approved migrations committed exactly once, both required verification scripts previously passed, and the separately approved corrected supplementary read-only check now passes. The original executor FAILED_STOPPED record is preserved as historical evidence; its migration guard remains in place.

No migration may be automatically rerun. The private one-shot execution ledger is retained and blocks accidental repetition. No automatic retry occurred. After the owner explicitly approved a separate read-only follow-up, only that corrected check was executed; no migration or prepared verification script was rerun.

## Exact results

| Migration | Result | Commit time (Asia/Kuala_Lumpur) |
| --- | --- | --- |
| `001_aburii.sql` | COMMITTED once | 2026-11-18T11:32:09+08:00 |
| `002_staff_workspace.sql` | COMMITTED once | 2026-11-18T11:32:12+08:00 |
| `003_operating_hours.sql` | COMMITTED once | 2026-11-18T11:32:15+08:00 |

- `verify_production.sql`: PASS.
- `verify_production_full.sql`: PASS.
- Preflight: exact API/native tenant pins, TLS verify-full, approved migration/verification file integrity, real backup checksum/recovery evidence and current schema/data checkpoint all passed.
- All 40 original tables/data fingerprints and pre-existing catalog/security metadata were preserved after migration.
- All 24 installed Aburii function bodies exactly match the reviewed SQL, including original-interval capacity commitments, counter peak occupancy, compatible private-room overlap checks, settings-row locking, expiry, status and Admin validation.
- Required scripts verified RLS on all six Aburii tables, exact grants on all 15 public RPCs, no API-role table/internal-function exposure, staff/Admin permission boundaries and official operating hours.
- Required scripts and per-migration area checks verified publicBookingsEnabled=false, capacitiesConfirmed=false, policiesConfirmed=false, counterEnabled=false and privateEnabled=false. Counter capacity is zero, no rooms configured, and no staff/bookings/outbox/rate rows were seeded.

## Stopped supplementary check

After the required verification scripts, preservation comparison and installed-function hash checks passed, an additional final read-only summary check failed with PostgreSQL SQLSTATE `42601` (syntax error), psql exit 3. The executor stopped immediately and did not retry or run further remote actions. This supplementary query is not part of the approved migration files or either prepared verification script. It did not roll back the three committed migrations or change booking flags/data. No claim is made that the additional availability summary completed.

The local execution record retains FAILED_STOPPED rather than hiding the error. A corrected read-only follow-up, if requested, must not rerun the migration executor or any migration file. The original migration/verification SQL was not changed.

## Preserved boundaries

No Auth settings, staff invitations, live booking requests, notifications, remote restores or GoDaddy deployment occurred. No BiBiChik or other Supabase project was connected. Secrets, raw SQL diagnostics, backup payloads and the private execution ledger are not committed. Auth/site/email setup and live booking approval remain separate.

## Approved read-only follow-up — PASS

The syntax error was the bare column alias `day`, a PostgreSQL keyword that requires AS. It was replaced by explicit `AS service_date` in `supabase/verify_booking_closed.sql`. The standalone runner `scripts/verify-production-closed.mjs` performs only this SELECT-based BEGIN READ ONLY / ROLLBACK check and validates the existing execution evidence locally. The one-shot migration executor was not invoked.

The follow-up completed on 2026-11-18 at 11:40:22 Asia/Kuala_Lumpur. All five public/area flags remain false; both seating categories return bookingOpen=false and zero slots; Monday returns closed=true. Catalog checks found six tables with RLS, 15 public RPCs, 24 exact reviewed function bodies, settings version 2 and one hours-initialization audit event. There are zero staff, bookings and outbox rows. These catalog facts corroborate the original execution record; catalogs alone do not count historical script invocations.

The original record confirms one committed execution per migration and prior PASS for both prepared verification scripts. It was not overwritten. The separate owner-only follow-up evidence is `.backups/production-readonly-followup-oemwlqisfwrhfxsvuszi.json`. No database/configuration/user changes or invitations occurred. Production Admin onboarding is now the next unapproved stage.

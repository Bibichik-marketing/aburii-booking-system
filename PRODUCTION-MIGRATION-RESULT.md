# Aburii Production migration execution — 2026-11-18

Project: `oemwlqisfwrhfxsvuszi` only. Owner explicitly approved execution.

**Approved migrations: PASS / all committed exactly once. Required verification scripts: PASS. Overall executor status: FAILED_STOPPED on an additional read-only summary query.**

No migration may be automatically rerun. The private one-shot execution ledger is retained and blocks accidental repetition. No retry or further remote query was executed after the error.

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

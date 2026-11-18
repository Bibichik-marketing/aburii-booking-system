# Aburii Production migration approval plan

Project: **oemwlqisfwrhfxsvuszi** only. Review date: 2026-11-17, Asia/Kuala_Lumpur.

**Execution update (2026-11-18): owner approved; 001→002→003 are committed once and both required verification scripts passed. A supplementary read-only summary query failed with SQLSTATE 42601; execution stopped without retry. Do not rerun migrations. See PRODUCTION-MIGRATION-RESULT.md.**

The reviewed plan below records the pre-execution decision: GO for explicit migration-only approval. Database compatibility, actual archive recovery and the local migration rehearsal passed. Production Auth/onboarding/launch is a separate gate and remains unconfigured. No Production schema/data/Auth settings were changed, no invitations sent, no bookings created and nothing deployed.

## Verified findings

| Check | Result | Evidence |
| --- | --- | --- |
| Project isolation | PASS | Server and backup connections are pinned to the owner-confirmed Aburii project; no other project was connected |
| Fresh application schema | PASS | Authenticated catalog inspection: PostgreSQL 17.12, required Auth objects/UUID generator/API roles, schema CREATE and Auth REFERENCES rights; no application tables, aburii schema, Aburii-prefix functions or migration-history table |
| API authorization | PASS | Saved publishable key reaches a normal read-only table endpoint (404/PGRST205 for the deliberately nonexistent table); invalid-key control receives 401. Root OpenAPI metadata intentionally requires the secret key. No key rotation/RLS changes needed |
| Private API exposure | PASS | The aburii profile is rejected with 406/PGRST106; no private tables exposed |
| Platform compatibility | PASS | Existing defaults and event triggers reviewed. Platform RLS auto-enable applies to public only. Supabase 17.12/supautils privilege behavior was reproduced in the isolated clone |
| Native Production backup | PASS | Full custom archive and password-free role export; listing, entire payload readability, SHA-256 and private file permissions verified; retained on this Mac outside the Production server |
| Actual Production archive recovery | PASS | All 40 archived tables and data hashes, sequences, constraints/indexes, non-extension function definitions/owners, RLS/policies, event triggers, extension versions and effective API-role permissions matched. No archive object/data section omitted or stubbed |
| Source preservation | PASS | Production fingerprints matched before/after full restoration and after local rehearsal; source access used read-only transactions |
| Exact migration rehearsal | PASS | Checksum-verified 001→002→003 ran only on the restored local clone as postgres; both read-only verification files passed |
| Closed public booking | PASS | Rehearsal ended with publicBookingsEnabled=false, capacitiesConfirmed=false, policiesConfirmed=false, counterEnabled=false and privateEnabled=false; no staff, bookings or outbox rows seeded |
| Runtime cleanup | PASS | Isolated network-disabled database container removed; dedicated Colima VM stopped; no host folder mounts, application port forwarding, active-context switch, Auth/email/delivery workers or automatic startup service |

Private evidence is in `.backups/production-2026-11-17T09-40-57-358Z/`: `manifest.json`, native archive, password-free roles, source/restored checkpoint fingerprints and `docker-recovery-report.json`. None are tracked by Git. See `PRODUCTION-BACKUP-RECOVERY.md` for the reproducible restore procedure and platform backup limits. No off-Mac upload was authorized/performed; an additional encrypted retention copy is recommended before collecting real customer data.

## Immutable migration sequence and data-loss review

The original files and SHA-256 hashes remain unchanged in `supabase/migration-plan.json`.

1. **001_aburii.sql** creates the private schema and six tables, constraints/indexes, RLS, staff role membership, capacity locks, expiry, audit, outbox and explicit RPC grants. Fresh installation only; do not rerun it over existing objects. Initial capacities are zero, inventory/services empty and both areas disabled. No accounts or customer data are seeded.
2. **002_staff_workspace.sql** adds staff context/list/detail/Today/archive RPCs and indexes. Reservation rows/status/capacity functions are preserved. Archive is audit-backed. Its CREATE OR REPLACE statements must not overwrite an unexpected existing installation.
3. **003_operating_hours.sql** initializes official weekly MYT windows and the fail-closed public-launch gate, replaces slot generation and wraps the original Admin validator privately. First application resets weekly service settings/removes obsolete weekly starts but retains date-specific overrides, inventory and reservations. It appends a migration audit event and sets all three public-launch flags false. Reapplying it does not reset later Admin settings.

No migration drops/truncates tables or deletes reservations. No development schemas, credentials, sessions or demo data may be copied into Production. No existing Aburii objects were found; if the target changes before execution, stop and reconcile rather than dropping objects or blindly skipping files. Each migration is transactional; the three-file sequence is not one atomic transaction. A committed step is not undone by a later failure.

## Reservation and security requirement coverage

- Counter Seating uses peak overlapping guest occupancy; Private Room uses internally selected compatible rooms and overlap checks. Their inventories are independent. Customers select only the category.
- Settings-row transactional locking serializes booking/status/assignment/configuration mutations. Explicit RPC-only grants protect that boundary; trusted administrators must not insert reservations directly.
- Pre-start cancellation/rejection/expiry releases future capacity; post-start completion/cancellation/no-show retains the original commitment through the original end. Logical expiry excludes invalid pending holds even without a scheduler.
- Admin-only settings use optimistic versions and validate capacities, inventory, durations, arrival interval, limits, notice/horizon, closures and minimum spend. Existing allocations cannot be invalidated by inventory edits.
- Staff uses Supabase Auth UUIDs plus active admin/manager/staff membership, checked on every staff RPC. Editable Auth user metadata cannot grant roles.
- RLS is enabled on settings/staff/bookings/audit/outbox/rates, with no direct API-role table privileges. Service-only and authenticated-only RPC grants and pinned function search paths passed the complete grant matrix checks.
- Official hours: Monday closed; Tue–Fri dinner 18:00–22:30; Sat/Sun lunch 12:00–14:30 and dinner 18:00–22:30, Asia/Kuala_Lumpur. The full configurable duration must fit one service period. Durations/arrival intervals remain configurable.
- Notifications remain transactional and opt-in; no worker starts during migration. Dashboard, Today, Pending Approval, archive, permissions and audit workflows retain existing APIs/statuses.

The existing 89-test SQL/security/capacity suite had already passed and was not rerun during this final recovery task. The actual-archive recovery and rehearsal are new integration checks against the matched Supabase runtime, not a repeat of that suite.

## Exact Production execution plan — requires final approval

1. Reconfirm project reference **oemwlqisfwrhfxsvuszi**, retained private checkpoint/checksums and that the source remains at the reviewed fresh-schema state. If Production has changed, take/retest the appropriate new checkpoint before proceeding.
2. Run `supabase/inspect_production.sql` only in the verified Aburii trusted SQL session. It uses BEGIN READ ONLY … ROLLBACK and returns catalog metadata, not customer/staff records or credentials. Stop on any new schema/function conflict or unexpected privilege/platform difference.
3. After explicit approval, execute the exact contents of `supabase/001_aburii.sql` in that project's trusted SQL editor. Require success before continuing. Do not run local setup or seed scripts remotely.
4. Execute `supabase/002_staff_workspace.sql`, require success, then execute `supabase/003_operating_hours.sql`, require success. If a step fails, stop, inspect rollback/committed state and revise the plan. Never restart at 001 blindly or drop the schema as an automatic recovery.
5. Immediately execute the read-only checks below. Keep all launch flags/areas disabled. Do not provision users, send mail, run notification/expiry workers, connect the local preview to Production or deploy anything.

No database URL/password, CLI link, management token or API secret is embedded in this plan. No Production restore command is automated. Any actual recovery is separately approved and must review the chosen checkpoint and changes since it.

## Exact post-migration checks

1. `supabase/verify_production.sql`: settings singleton, three false launch flags, official hours/version, RLS on all six tables, private schema/table access denial and representative RPC grants. Read-only transaction rolls back.
2. `supabase/verify_production_full.sql`: fresh-install empty staff/bookings/outbox/rates, disabled areas/zero counter/no rooms, exactly 15 public Aburii RPCs with complete anon/authenticated/service_role grant matrix, no API-role execution of internal functions and pinned paths. Read-only transaction rolls back. Run before application traffic/provisioning.
3. Read-only REST metadata: intended public Aburii RPCs alongside existing platform functions; no private table exposure; aburii profile remains rejected. A publishable-key 401 on the OpenAPI root is expected, not a failure. Preserve existing platform functions/triggers.
4. Only read-only availability checks: both areas report bookingOpen=false/zero slots, and Monday has no slots. Do not call book/status/configure/expiry/notification RPCs as a read test; they may write.

## Separate onboarding and launch requirements — no changes authorized here

Last Auth inspection showed public signup enabled, Site URL http://localhost:3000, an empty redirect allowlist and default email templates without custom SMTP. Before onboarding/launch, approve the changes in `PRODUCTION-AUTH-CHANGE-PLAN.md`: disable public signup while retaining Email and trusted Admin invitations, keep anonymous sign-ins off/email confirmation on, set the actual approved HTTPS origin/exact callbacks, configure approved SMTP/sender/templates and review hosted password/session/MFA requirements. Do not send invitations during this migration task.

Actual seating capacities, final policy approval, staff account end-to-end tests, WhatsApp delivery and public launch remain separate approvals. Migration approval never enables public bookings or authorizes GoDaddy deployment.

References: Supabase [OpenAPI endpoint restriction](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key), [API security](https://supabase.com/docs/guides/api/securing-your-api), [backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [supautils privilege behavior](https://github.com/supabase/supautils).

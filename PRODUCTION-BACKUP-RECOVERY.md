# Aburii manual backup and recovery gate

Project: `oemwlqisfwrhfxsvuszi` only. No backup/restore command may target BiBiChik.

## Current result — recovery PASS, migration approval GO

- **Production export/integrity: PASS.** The full native archive and password-free role definitions were exported through the pinned Aburii Session pooler using verify-full and the downloaded Supabase CA. Listing, complete payload readability, SHA-256 hashes and owner-only file permissions passed.
- **Actual archive restoration: PASS.** The real Production checkpoint was restored completely into the official, digest-pinned ARM64 Supabase PostgreSQL 17.12 image, including supabase_vault. All **40 archived tables**, row counts/SHA-256 data digests, sequences, constraints, indexes, non-extension function definitions/owners, RLS/policies, event triggers and effective API-role permissions matched the source. Required extension names/versions matched. The source fingerprint stayed unchanged before/after restoration and local migration rehearsal.
- **Local migration rehearsal: PASS.** The immutable 001→002→003 files were applied only to that restored local clone as postgres. Both post-migration verification SQL files passed. Public booking, capacity confirmation, policy confirmation and both seating-area enable flags remained false; no bookings/staff/outbox rows were seeded.
- **Isolation/cleanup: PASS.** A separate Colima Docker VM was used with no host directory mounts, no application port forwarding and no active-context switch. The database container had network=none and no published ports or notification/email/Auth services. It was removed after the check, and the dedicated VM was stopped. No Production migration, remote restore, invitation, Auth setting change or GoDaddy deployment occurred.
- **Decision: GO for migration-only approval.** Execution still requires the owner's explicit approval. Auth signup/origin/redirect/SMTP setup remains a separate onboarding/launch gate, and public booking stays off.

Private evidence stays in `.backups/production-2026-11-17T09-40-57-358Z/`: manifest, archive, password-free roles, source/restored checkpoint fingerprints and `docker-recovery-report.json`. This Mac is the backup destination outside the Production server. No off-Mac/cloud upload was performed or authorized; an additional encrypted retention copy is recommended before real customer data is collected. No extension/constraint/data section was omitted or stubbed to obtain PASS.

## Secure credential handoff

The ignored, owner-only `.env.backup.local` now contains the privately configured PostgreSQL password, the verified Session pooler host and the local CA path. Password authentication has passed. Preserve `ABURII_BACKUP_DB_PASSWORD` privately; Do not paste passwords, connection URLs or archive contents into chat. Do not reset a forgotten password without explicit authorization.

Defaults use the documented direct endpoint, port 5432, database postgres and user postgres. Direct connections may require IPv6. If the network cannot reach it, obtain the **Session pooler** host from the Aburii dashboard Connect dialog and use user `postgres.oemwlqisfwrhfxsvuszi`, port 5432. Do not use the transaction pooler on 6543. The exporter validates both the host family and project-specific username; it never falls back to a generic database URL, service file or another project.

TLS uses `verify-full` with `ABURII_BACKUP_SSL_ROOT_CERT=system`. If the project's certificate chain is not trusted by the installed CA store, download the project's CA certificate through trusted project administration and set that variable to its local certificate file. Do not work around TLS failures with sslmode=disable or skip hostname verification.

## Exact read-only export command

Run only from this Aburii repository, after privately configuring the password:

```sh
node --env-file=.env.backup.local scripts/backup/production.mjs
```

The script pins the Aburii target and refuses missing credentials/untrusted file permissions. Its metadata query uses an explicit BEGIN READ ONLY / ROLLBACK, and pg_dump opens its own READ ONLY snapshot. The Session pooler ignores startup PGOPTIONS: relying only on default_transaction_read_only would be incorrect; this was observed and the prerequisite check was corrected without changing remote settings. It exports a native full-database custom archive and password-free role definitions, verifies the archive listing and full payload readability, and writes SHA-256 hashes plus metadata to a private manifest. Passwords travel only in the child process environment, never command arguments. Raw PostgreSQL diagnostics are suppressed to avoid logging credentials. All `.backups/` directories are owner-only and ignored by Git; files are owner-only. Failed exports are not a backup PASS.

`pg_dump` takes a consistent database snapshot. Run the checkpoint just before any approved DDL, with application writes quiesced and no notifications/schedulers active. The application is not deployed/connected to this Production database during preparation.

Artifacts:

- `.backups/production-<UTC timestamp>/database.dump`
- `.backups/production-<UTC timestamp>/roles-no-passwords.sql`
- `.backups/production-<UTC timestamp>/manifest.json`

The dump retains database schema/data/ownership/ACL information; the role export omits role passwords. Backup files may contain personal data, auth hashes or encrypted secrets. Keep them private; use an approved encrypted off-device location for the retained copy. No upload destination has been selected or used.

## Recovery procedure and evidence

**Never restore into Production as a preflight test. No remote restore mode is provided.** No additional remote project is automatically created. A restore into any new Supabase project needs explicit authorization and identity review.

1. Validate the archive and role-file SHA-256 against the private manifest. Verify project reference, timestamp, source version, command success and archive listing. `pg_restore --list` alone is not a restore test.
2. Prepare a disposable, isolated PostgreSQL 17/Supabase-compatible destination with required extensions/platform prerequisites and no network egress, API traffic, cron or delivery workers. A bare PostgreSQL install may lack Supabase-managed extensions, roles and objects; do not silently omit failed sections. The source identity and destination identity must be different and verified before any restore.
3. Review `roles-no-passwords.sql` privately. Provision/map needed roles in the isolated destination; never blindly replay managed roles over an existing Supabase project. Restore database contents using `pg_restore --exit-on-error --single-transaction` and the custom archive, with the isolated destination supplied only through a dedicated PostgreSQL environment. Owners/ACLs should be preserved or explicitly mapped and tested; do not hide errors with `--no-acl` and call security recovery verified.
4. Compare source-checkpoint and restored schema objects, table counts/data digests, settings, sequence values, indexes/constraints, function definitions/owners, RLS, effective API-role grants, original reservation intervals/holds/room assignments and outbox/audit state. Do not print rows. Source counts/digests must be captured consistently with the backup or while writes are quiesced, not from a later changing source.
5. Confirm the restored public launch flags are false, both areas remain disabled for the fresh-install checkpoint, and no notification worker is active. Document the result privately with archive checksum, destination type/version, date, operator and any unsupported object. Mark the Production archive verified only after this actual restore comparison passes.
6. Keep the tested archive and protected second copy. Clean up only the disposable restore environment. An actual Production recovery is a separately approved operation: stop application writes/workers, choose the checkpoint, review data written since the backup, restore through trusted administration, run the read-only verification SQL, and keep public booking closed. Do not drop the new schema or replay 001 as an automatic rollback.

The implemented local application recovery procedure is exercised with:

```sh
node scripts/backup/local-recovery-drill.mjs
```

It has no remote-target option, checks the existing local database identity and synthetic-only source, restores into a temporary cluster with TCP disabled, compares effective privileges/data, and removes that temporary cluster. Reports and archives remain private in `.backups/local-drill-*`. Its `productionBackupCreated=false` / `productionArchiveRestoreVerified=false` fields deliberately distinguish local validation from the pending real Production recovery drill.

## Backup scope limits

A native PostgreSQL archive is not a Supabase platform backup or PITR. It does not include Storage object bytes, Auth SMTP/email/API/dashboard configuration, database login passwords or Vault/pgsodium root encryption keys. Managed schema restoration can require Supabase-specific handling. These external settings/files/keys must be protected separately if used; no secret export or platform reconfiguration was authorized here. A migration-scoped public/aburii export must never be represented as a complete database backup.

Free-plan guidance: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [native database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Reproducing the actual Production-archive restore drill

Installed tools: Homebrew Colima 0.10.3, Lima 2.3.0 and Docker CLI 29.9.3. No Docker Desktop subscription or full Supabase Auth/API stack is needed for this database-only drill.

Start the dedicated VM without modifying the active Docker context, mounting the home directory or forwarding application ports:

```sh
colima --profile aburii-recovery start --runtime docker --cpu 2 --memory 4 --disk 20 --vm-type vz --activate=false --ssh-config=false --mount none --port-forwarder none
node --env-file=.env.backup.local scripts/backup/docker-recovery.mjs
colima --profile aburii-recovery stop
```

The script fixes the Docker socket to this recovery VM and the image to `supabase/postgres@sha256:6c056e9a0f81d423c1a81fdf4e6587c16efd3f63960897371dab8ae2694a4714`. Production credentials are used only by the host's read-only fingerprint queries; they are never passed into the container. Only the private archive and password-free role SQL are copied into the network-disabled container.

The clean database is initialized with the original supabase_admin bootstrap identity so membership grantors can be preserved. Its already-existing CREATE ROLE line is not replayed; its original ALTER ROLE attributes and all memberships are restored. Supabase's supautils privilege group/superuser settings are read from the source and matched locally. Event-trigger entries are replayed in a second local phase under original session owners, preserving Supabase's protected trigger semantics. Every archive TOC entry is restored across the two phases. No source schema/function/grant is changed.

Comparisons use a fixed pg_catalog search path, UTC and ISO dates to avoid misleading namespace/format differences. The documented empty supautils.superuser default is resolved to the actual bootstrap role for comparison; it is the same supabase_admin identity as the explicit source setting. This does not broaden database privileges.

The report marks productionArchiveRestoreVerified=true only after the full comparison succeeds. It also records the local migration rehearsal and all five false launch/area flags. Archive SQL runs only via docker exec against the local Unix socket; the Production code path contains only read-only fingerprint SELECTs. Keep the original backup immutable and rerun a fresh checkpoint if Production changes before approval/execution.

As with any logical backup, Auth/SMTP/API settings, storage object bytes, database passwords and Vault root encryption keys are outside the archive. The checked pre-migration source had zero Auth users and zero Vault secret rows. No claims are made that logical backup restores external service configuration or encryption keys.

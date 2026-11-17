# Aburii manual backup and recovery gate

Project: `oemwlqisfwrhfxsvuszi` only. No backup/restore command may target BiBiChik.

## Current result

- Native tools installed: PostgreSQL 17.11 `pg_dump`, `pg_restore`, `psql`; compatible with the observed Production major version 17 (server 17.12).
- The new local recovery drill passed: existing synthetic Aburii data was exported/restored to a disposable Unix-socket-only cluster. Reservation/configuration/staff/outbox/audit digests, RLS and effective function/table permissions matched. The source was unchanged. No new reservation requests were created.
- **No Production database backup exists yet.** The dedicated PostgreSQL password is not configured. API keys do not grant a native PostgreSQL connection. An archive of the local demo database is not a Production backup.
- A full Production archive must be exported, checked and restored in an isolated compatible environment before this gate can become PASS. The exporter explicitly leaves `productionArchiveRestoreVerified=false` after a successful dump/list check. Do not edit that flag to claim success; attach real restore evidence instead.

## Secure credential handoff

An ignored, owner-only `.env.backup.local` was prepared. Enter the existing Aburii PostgreSQL password privately in `ABURII_BACKUP_DB_PASSWORD`. Do not paste passwords, connection URLs or archive contents into chat. Do not reset a forgotten password without explicit authorization.

Defaults use the documented direct endpoint, port 5432, database postgres and user postgres. Direct connections may require IPv6. If the network cannot reach it, obtain the **Session pooler** host from the Aburii dashboard Connect dialog and use user `postgres.oemwlqisfwrhfxsvuszi`, port 5432. Do not use the transaction pooler on 6543. The exporter validates both the host family and project-specific username; it never falls back to a generic database URL, service file or another project.

TLS uses `verify-full` with `ABURII_BACKUP_SSL_ROOT_CERT=system`. If the project's certificate chain is not trusted by the installed CA store, download the project's CA certificate through trusted project administration and set that variable to its local certificate file. Do not work around TLS failures with sslmode=disable or skip hostname verification.

## Exact read-only export command

Run only from this Aburii repository, after privately configuring the password:

```sh
node --env-file=.env.backup.local scripts/backup/production.mjs
```

The script pins the Aburii target, refuses missing credentials/untrusted file permissions, and forces remote sessions to `default_transaction_read_only=on`. It exports a native full-database custom archive and password-free role definitions, verifies the archive listing, and writes SHA-256 hashes plus metadata to a private manifest. Passwords travel only in the child process environment, never command arguments. Raw PostgreSQL diagnostics are suppressed to avoid logging credentials. All `.backups/` directories are owner-only and ignored by Git; files are owner-only. Failed exports are not a backup PASS.

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

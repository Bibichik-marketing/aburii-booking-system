# Aburii manual backup and recovery gate

Project: `oemwlqisfwrhfxsvuszi` only. No backup/restore command may target BiBiChik.

## Current result

- **Production export: PASS.** A native full database archive and password-free role definitions were exported from the pinned Aburii project through the owner-supplied Session pooler. The PostgreSQL password authenticated successfully and client TLS used verify-full with the downloaded Supabase CA.
- **Archive integrity: PASS.** The table of contents, entire decompressed payload, SHA-256 hashes and owner-only file permissions were verified. The private checkpoint is `.backups/production-2026-11-17T09-40-57-358Z` (UTC timestamp in its name). No archive SQL was executed during the payload check.
- **Local synthetic recovery procedure: PASS.** The prior new drill restored existing synthetic data into a disposable Unix-socket-only cluster and matched data digests, RLS and effective permissions without changing the source.
- **Actual Production archive restoration: BLOCKED.** The archive requires `pg_stat_statements`, `pgcrypto`, `supabase_vault` and `uuid-ossp`. Local PostgreSQL lacks `supabase_vault`; Docker, Podman and Supabase CLI are absent. No sections were omitted or stubbed to claim a full restore. The actual archive still has `productionArchiveRestoreVerified=false`.
- **Migration execution: NO-GO** until a compatible isolated restore target is selected, the actual archive restore comparison passes, a protected second-copy approach is agreed, and migration-only approval is given. No Production restore/migration/Auth change or invitation occurred.

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

# Aburii GoDaddy deployment preparation

Prepared 18 November 2026. No hosting resources created, uploaded or published.
Production database migrations are COMPLETE; do not rerun them during deployment.

## Hosting target

Use a NEW, independent GoDaddy Node.js Hosting app named aburii-booking-system.
Use its assigned HTTPS URL; no aburii.com connection or DNS changes.
Do not open, replace or reuse BiBiChik's application, secrets or deployment target.
The actual app ID, runtime version and assigned production URL remain to be verified
in the owner's GoDaddy account. A preview URL must not be assumed to be the final URL.

## Build contract

- Node >=22.13.0; choose a supported Node 22 or newer runtime.
- Source ZIP has package.json at its root. Install from package-lock.json.
- Build: npm run build. Start: npm start.
- TypeScript and declaration packages are in dependencies because GoDaddy documents
  dependency-only installation before build. No automatic package installation is needed.
- Existing standalone build copies public and .next/static into .next/standalone.
- Let the platform assign PORT. Set HOSTNAME=0.0.0.0 and NODE_ENV=production.
- No database migration command, local adapter, invitation task or notification worker
  is part of build or start.

## Server-only environment (enter privately in hosting secrets)

Copy the verified values individually from the owner-only .env.production.local;
never upload that file, paste values into chat or include them in source control.

- ABURII_SUPABASE_URL=https://oemwlqisfwrhfxsvuszi.supabase.co
- ABURII_SUPABASE_PROJECT_REF=oemwlqisfwrhfxsvuszi
- ABURII_SUPABASE_PUBLISHABLE_KEY: existing verified publishable key
- ABURII_SUPABASE_SECRET_KEY: existing verified server-only secret key
- ABURII_SITE_URL: actual assigned production HTTPS origin, no trailing slash
- ABURII_RATE_LIMIT_SECRET: new cryptographically random secret, at least 32 characters
- ABURII_TRUSTED_CLIENT_IP_HEADER: leave unset until the hosting proxy's overwrite
  guarantee is verified. Never trust an arbitrary client-supplied forwarding header.

No NEXT_PUBLIC_* secrets. WhatsApp sender credentials and workers remain unconfigured
until separately approved. Preview and publish secrets must be checked separately.

## Gates and subsequent steps

All five database gates remain FALSE: publicBookingsEnabled, capacitiesConfirmed,
policiesConfirmed, counter.enabled and private.enabled. Hosting does not change them.
No reservation or capacity settings are changed by this preparation.

1. Owner opens GoDaddy Node.js Hosting and selects a new Aburii-only app flow.
2. Confirm runtime, app identity, default HTTPS URL and whether URL is preview or publish.
3. Upload the reviewed source ZIP only when proceeding with the hosting setup.
4. Configure server secrets privately; confirm production build and HTTPS health.
5. With separate approval, configure Supabase Site URL, exact staff redirect URLs,
   disable public signup, configure email, then invite/provision the first Admin.
   Follow PRODUCTION-AUTH-CHANGE-PLAN.md; do not create users during deployment prep.
6. Verify staff access, language switcher, secure cookies and booking-disabled state.
   No synthetic reservations are to be created in Production.

Do not publish automatically. Before any promotion, confirm the assigned final origin,
all server secrets and booking-disabled gates. Roll back application code via GoDaddy
history if necessary; never roll back the database by rerunning migrations.

## Package preparation

Create a source ZIP from the tracked app/, lib/, public/, scripts/build.mjs,
package.json, package-lock.json, next.config.ts, next-env.d.ts and tsconfig.json only.
Exclude .env*, .git, .next, node_modules, backups, local accounts, migrations and tools.
Build on GoDaddy Linux rather than uploading the Mac node_modules directory.

Official references checked 18 November 2026:
- https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements
- https://developer.godaddy.com/en/docs/api-users/hosting/concepts

# Launch handoff

The application builds and the database migration is integration-tested locally. It is **not yet a live production booking service**.

Required external configuration:

- New Aburii-only Supabase project, migration, backups, Auth invitations, verified staff roles and environment keys.
- Verified counter capacity, room inventory, party limits, service starts/durations, notice, horizon, pending-hold policy and private-room minimum spend. No capacities are assumed.
- Approved privacy/booking policy and retention/deletion process. Current policy is visibly marked provisional. The user-confirmed capacity policy preserves every unreleased commitment from scheduled start through original end, including after completion, cancellation or no-show. Only cancellation/rejection/expiry before scheduled start releases capacity.
- Separate Aburii WhatsApp Business sender, approved utility template, credentials and scheduled worker. Test provider acceptance and retry behavior with approved staging recipients before launch.
- Node-capable GoDaddy hosting, domain, TLS, environment variables, proxy configuration and scheduler. Confirm host account support for persistent Node processes.
- New private GitHub remote. The local repository and initial commit are prepared; no parent remote or credentials are copied.

Before opening online availability, verify on the real staging deployment: password invitation/recovery; login/refresh/logout; revoked staff access; cross-origin rejection; last-capacity parallel booking; expiry; room changes; mobile completion; WhatsApp opt-in and provider delivery. Local SQL tests validate database behavior but do not replace Supabase Auth/REST and provider testing.

Scope limits: no payments/deposits, cancellation penalties, customer self-service login, inbound WhatsApp handling, automated emails, staff outbound messages, historical reports, public floor plan or individual seat selection. Admin inventory edits are intentionally conservative while active reservations exist.

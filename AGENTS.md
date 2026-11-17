# Aburii project boundaries

This is a separate Aburii-only application. Run every command from this directory. Never edit or execute builds/migrations in the parent BiBiChik/reference project. Never copy customer data, environment files, database URLs or credentials from it. New integrations must use Aburii-prefixed variables and separate service accounts.

Capacity policy: once scheduled start is reached, any unreleased capacity commitment remains through the original scheduled end regardless of Completed, Cancelled or No-show status. Only cancellation/rejection/expiry before start releases future capacity. Never derive occupancy solely from current status. All mutations follow the settings-row transaction lock and RPC-only grants.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Aburii Auth configuration plan — not applied

Target project: `oemwlqisfwrhfxsvuszi`. This plan is for separate approval; no remote settings or users were changed.

## Staff-only access

In Authentication → Sign In / Providers:

- Turn **Allow new users to sign up** OFF.
- Keep **Email** provider ON, **Confirm email** ON and **Allow anonymous sign-ins** OFF.
- Do not disable the Email provider to disable signup; existing staff still need password login/recovery.

Authorized staff onboarding remains through trusted Supabase Auth administration (`inviteUserByEmail` or the dashboard), using the project's secret key only on trusted servers. Disabling public signup does not turn this into public self-registration. Provision the invited Auth UUID in `aburii.staff` with explicit `staff` or approved `admin` membership before link submission. Existing RPC membership and Admin checks remain authoritative; editable user metadata never grants roles. No default Admin/password is created by migration, and no invitations are sent by this plan.

Retain the current staff cookies and refresh flow. Review hosted password policy against the application's minimum 12-character setup rule. Secure-password-change, require-current-password and MFA changes require compatibility review of invite/recovery before enabling; do not blindly turn on settings that would require a forgotten old password in recovery.

## HTTPS origin and exact redirects — required before onboarding/launch

The owner must choose the actual booking application origin. Do not assume the existing marketing site hosts this Node application and do not invent a new public hostname.

Set both:

- `ABURII_SITE_URL=<APP_ORIGIN>` in the private application environment.
- Supabase Auth **Site URL** to the same HTTPS origin, without a trailing slash.

Allow only the required explicit callback destinations:

- `<APP_ORIGIN>/staff/password`
- `<APP_ORIGIN>/staff`

`<APP_ORIGIN>` is a placeholder, not a value to paste into Production. Do not allow broad wildcards. The observed `http://localhost:3000` Site URL is a default, not an approved Production origin. Keep local/synthetic testing on its separate local adapter; do not add localhost to Production merely to bypass this prerequisite. No GoDaddy deployment is included.

## Email delivery and templates

Configure an approved Aburii SMTP provider, owned sender address/name and domain SPF/DKIM (and approved DMARC policy), TLS and sender verification. Put SMTP credentials only into the approved secret store/dashboard. Do not send a test email until approved recipients/delivery are separately authorized. The observed dashboard uses default templates and requires custom SMTP to edit them.

Invite action link:

```html
<a href="{{ .SiteURL }}/staff/password#token_hash={{ .TokenHash }}&amp;type=invite">Set your Aburii staff password</a>
```

Recovery action link:

```html
<a href="{{ .SiteURL }}/staff/password#token_hash={{ .TokenHash }}&amp;type=recovery">Reset your Aburii staff password</a>
```

Use the existing `/staff/password` flow: the fragment token is removed from browser history, submitted only after an explicit password action, verified by Supabase and checked for active staff membership before setting an app session. Do not put API secrets in email links or enable request-body/credential logging. Do not send an invitation to inspect or validate these settings.

The origin, redirects and email configuration may be finalized before application launch; they are not schema-migration dependencies. Approval to run database migrations does not authorize these settings changes, invitations or opening public reservations.

References: [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration), [trusted invitations](https://supabase.com/docs/guides/auth/users), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

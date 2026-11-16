# English and Simplified Chinese

The application supports exactly `en` (English, the default) and `zh-CN` (简体中文). The compact EN / 中文 control appears in the existing shared header on booking, staff and policy pages. It retains the existing Aburii layout, logo and color palette.

`lib/messages.mjs` contains Simplified Chinese copy keyed by the English default text. `lib/i18n.mjs` handles display labels, interpolation, known server errors and native input validation messages. `lib/language.tsx` provides the client context, switcher and `aburii_language` localStorage preference. Unsupported saved language values fall back to English. The page language, title, description and displayed date/time locale follow the selection; timezone remains Asia/Kuala_Lumpur.

Switching language updates labels in place. There is no locale-based component key, route change or booking availability refetch, so selected date/time, area, guests, entered customer details and checkbox state remain intact. Staff filters and unsaved settings also remain intact. The preference survives page navigation, refresh and opening the policy page in another tab. Form contents themselves are not stored in localStorage.

Reservation requests and responses retain their original schemas and identifiers (`counter`, `private`, status codes and configuration JSON keys). No locale is sent to the booking database. Customer names, special requests, room names and stored configuration values are user data and are not automatically translated. The WhatsApp worker and approved template workflow are unchanged; this feature localizes the web interface only.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 46 passing tests — 39 isolated PostgreSQL integration tests and 7 localization tests. No production Supabase connection.
- `npm run build`: passed; standalone Node output prepared.
- Browser checks: English default; Chinese customer copy; booking data, consent, seating and selected-time preservation across switches; saved language after refresh and navigation; localized login validation, availability, receipt and pending status; staff filters, status codes, notifications, admin copy and JSON validation; unsaved settings preservation.
- Layout checked in both languages at desktop and 320px mobile width. Customer, staff and admin pages had no horizontal overflow. Existing responsive CSS breakpoints remain in place.

Authenticated staff/admin and successful receipt checks used a disposable loopback-only fixture with synthetic data. That fixture was stopped after QA; it was never connected to Supabase and sent no notifications. The normal preview remains on http://localhost:3100 with its existing unconfigured backend behavior. No GoDaddy deployment was performed.

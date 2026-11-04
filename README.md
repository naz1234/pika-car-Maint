# Pika Car Maint

A private, mobile-friendly garage for a vehicle's maintenance, purchase, loan and original PDF documents.

Production: https://pika-car-maint.pages.dev

## Features

- Overview with documented mileage, maintenance cost and original financed amount.
- Service timeline with invoice-level costs, parts and source PDF links.
- Explicit next-service date and odometer target; whichever comes first.
- Purchase breakdown separate from the bank repayment log.
- Editable lender, monthly instalment, term, payment dates and stated rate.
- Unknown terms stay unknown. Scheduled totals are tracking estimates, not bank balances.
- Private PDF library with categories, search, upload, SHA-256 deduplication and authenticated downloads.
- Installable app. Only the static shell is cached; private data and PDFs are never cached by the service worker.
- JSON export of state and document metadata.

## Cloudflare

`wrangler.jsonc` defines the existing Pages project, D1 binding `DB`, and R2 binding `DOCUMENTS`. The bucket must remain private, with public dev URLs and custom domains disabled. Set `APP_PASSWORD` as a Cloudflare Pages secret; never commit it.

Build command: `node scripts/build.mjs`. Output directory: `dist`. Only allowlisted browser assets are included, excluding source files, tests, PDFs, secrets and imports. Pages compiles `functions/` separately. GitHub `main` remains connected to the existing project.

New installation: apply `schema.sql` and `migrations/0002_garage.sql`, bind D1/R2, set the secret, import validated version-2 JSON into `app_state` under id `garage-v2` with a millisecond timestamp, then upload PDFs through the authenticated app.

The original `app_state.shared` record remains unchanged as the legacy backup. Personal records and PDFs are not in this repository.

## Security and saving

All `/api/*` routes require a server session except the login POST. Login attempts are rate limited. Cookies are Secure, HttpOnly and SameSite=Strict. Mutations require a matching Origin. State writes use a D1 revision comparison to reject stale edits. Failed saves stay visible in the form.

Locking deletes the session and clears displayed data. Private data stays in memory only. Sessions last 30 days. Rotating the password does not revoke existing sessions: clear `garage_sessions` to revoke them. Missing bindings or secrets fail closed.

## Development

Requires Node.js 24+ for SQLite-backed tests.

- `npm test`: validation, schedule and loan totals, authentication, origin checks, rate limits, stale writes, PDF validation, deduplication and retrieval.
- `npm run build`: assemble browser assets.
- `npx wrangler pages dev dist`: local runtime; use local D1/R2 and `.dev.vars`, never production bindings for test data.

New PDF uploads store documents. Log their financial or service details separately, attaching the supporting PDF.

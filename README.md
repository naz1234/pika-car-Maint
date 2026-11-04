# Pika Car Maint

A public, mobile-friendly garage for a vehicle's maintenance, purchase, loan and original PDF documents. It opens directly without a password. Anyone with the link can view and update records, upload PDFs and open the original documents.

Production: https://pika-car-maint.pages.dev

## Features

- Overview with documented mileage, maintenance cost and original financed amount.
- Compact car profile row at the top of Overview. Tap for the full model, registration, colour, VIN and recorded mileage, with editing and access to My car in the popup.
- Compact service rows show the date, mileage, title and cost. Tap a row for a popup with the full work notes, parts and source PDFs; PDF Back returns to those details.
- Explicit next-service date and odometer target; whichever comes first.
- Next service stays in a compact row on Overview and Maintenance. Tap for the full date/mileage schedule, status, workshop notes, supporting PDF and edit option in a popup.
- Purchase breakdown separate from the bank repayment log.
- Compact Loan snapshot row opens a popup with the original loan amount, lender, monthly instalment, next payment date and repayments logged, plus a link to Loan & purchase.
- Editable lender, monthly instalment, term, payment dates and stated rate.
- Unknown terms stay unknown. Scheduled totals are tracking estimates, not bank balances.
- Options tab with a public PDF library, categories, search, upload, SHA-256 deduplication and document viewing.
- In-app PDF reader with an always-visible Back button, page navigation and zoom. Closing it keeps your place in the garage, including document filters. PDFs stay on the app's origin; PDF.js is bundled locally.
- Mobile app screens stay at normal scale. PDF pinch gestures zoom the document itself, so the toolbar and the garage stay at normal size when returning. Mobile form controls use 16px text to avoid focus zoom.
- Light and dark modes, remembered on each device and applied before the first paint.
- Installable app. Only the static shell is cached; records and PDFs are never cached by the service worker.
- Automatic app updates check every minute while visible, and on returning to the app or reconnecting. Updates wait for open forms, uploads and PDF reading to finish, then restore the current tab, document filters and scroll position.
- JSON export of state and document metadata.

## Cloudflare

`wrangler.jsonc` defines the existing Pages project, D1 binding `DB`, and R2 binding `DOCUMENTS`. The R2 bucket has public dev URLs and custom domains disabled; the app serves its PDFs publicly through `/api/documents/:id`. No password or authentication secret is required.

Build command: `node scripts/build.mjs`. Output directory: `dist`. Only allowlisted browser assets are included, excluding source files, tests, PDFs, secrets and imports. Pages compiles `functions/` separately. GitHub `main` remains connected to the existing project.

The build generates a deterministic app version in the HTML, service-worker cache name and `version.json`. Client code or dependency changes automatically produce a new version, with no manual cache bump. The version endpoint is never cached. Existing versions without the updater need one initial refresh to install it; later releases apply automatically at a safe point.

New installation: apply `schema.sql` and `migrations/0002_garage.sql`, bind D1/R2, import validated version-2 JSON into `app_state` under id `garage-v2` with a millisecond timestamp, then upload PDFs through the app.

The original `app_state.shared` record remains unchanged as the legacy backup. Personal records and PDFs are not in this repository.

## Security and saving

All data and document routes are public. Mutations require a matching Origin, which prevents cross-site browser submissions but does not restrict who can edit this public app. State writes use a D1 revision comparison to reject stale edits. Failed saves stay visible in the form.

The app no longer creates or checks sessions. Historical session tables from migration 0002 and any existing `APP_PASSWORD` secret are unused. No data migration is required for existing installations. Missing storage bindings return an unavailable response; loading errors offer a retry.

## Development

Requires Node.js 24+ for SQLite-backed tests.

Install dependencies with `pnpm install --frozen-lockfile` before building. The build copies the pinned PDF.js legacy browser library, worker, font/character-map assets and decoder files into `dist/vendor/pdfjs`. Only one page is rendered at a time to limit mobile memory use. The reader renders PDF content on canvas without executing document scripts, embedding the browser's native PDF viewer or relaxing the site's Content Security Policy.

- `npm test`: validation, schedule and loan totals, public access without sessions or secrets, origin checks, stale writes, PDF validation, deduplication and retrieval.
- `npm run build`: assemble browser assets.
- `npx wrangler pages dev dist`: local runtime; use local D1/R2, never production bindings for test data.

New PDF uploads store documents. Log their financial or service details separately, attaching the supporting PDF.

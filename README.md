# Pika Car Maint

A public, mobile-friendly garage for a vehicle's maintenance, purchase, loan and original PDF documents. It opens directly without a password. Anyone with the link can view and update records, upload PDFs and open the original documents.

Production: https://pika-car-maint.pages.dev

## Features

- Compact Fuel dashboard with a month selector, spending total, fill-up count and average payment in one summary. A monthly-breakdown popup compares spending and opens a selected month; compact history rows open the full fill-up record and an edit option. Desktop places history beside the summary; mobile stacks it below.
- Receipt litres, odometer and full-tank status remain optional and saved with each fill-up. Only supplied readings appear in the record popup; unknown readings stay unknown. The dashboard focuses on spending and history, without a fuel-economy panel.
- Overview dashboard with a Red Mica vehicle picture, recorded mileage, a compact next-service row and four pictured cards for maintenance totals, this month's fuel spending, the loan snapshot and car tips. Quick actions open service, fill-up and mileage forms; recent maintenance, purchase financing and the document library remain within reach. The current-month fuel shortcut also works before the first fill-up is logged.
- All five main dashboards use a matching set of optimized automotive illustrations. Maintenance, Fuel, Loan & purchase and Car tips have compact picture headers, with separate text and controls for readable light/dark layouts. The illustrations are static app assets; personal PDFs and reference photos stay in R2. Generation prompts and asset notes are in [docs/dashboard-artwork.md](docs/dashboard-artwork.md).
- Maintenance recorded opens the total, visit count and individual service costs in a popup. Open any service for its full record/PDFs, or go to Maintenance and log a new visit.
- Compact Maintenance dashboard with the next-service date/mileage and countdown, one spend/visit summary, a mileage update shortcut and divided service-history rows. Desktop places the history beside the summary; mobile keeps it below. Totals and schedules open their full details in popups.
- Vehicle card at the top of Overview. Open Car details for the full model, registration, colour, VIN and recorded mileage, with editing and access to My car in the popup.
- Compact service rows show the date, mileage, title and cost. Tap a row for a popup with the full work notes, parts and source PDFs; PDF Back returns to those details.
- Explicit next-service date and odometer target; whichever comes first.
- Overview highlights both next-service targets, days to the date and distance from the last recorded mileage. Maintenance keeps a compact schedule row. Both open the full date/mileage schedule, status, workshop notes, supporting PDF and edit option in a popup.
- Compact Loan & purchase dashboard with the monthly instalment and term, original financing, logged repayment total and recent payments. Tap for full loan terms, purchase costs/receipts and original PDFs, or the complete repayment log. Desktop places repayments beside the summary; mobile stacks them below.
- Overview's Purchase & loan panel opens the original financing, price breakdown, receipt notes and supporting PDFs. PDF Back returns to those details, with a link to Loan & purchase.
- Overview's Repayments logged opens the loan snapshot with the original loan amount, lender, monthly instalment and repayments logged, plus a link to Loan & purchase.
- Editable lender, monthly and final instalments, term, effective annual rate, fixed/variable rate type, reference rate, margin, original agreement total and term charges. Linked loan PDFs open from the snapshot popup. Loan screens and forms omit repayment schedule dates; the payment log records the dates of actual repayments.
- Scheduled totals use the monthly amount for all but the final month, then the final instalment when supplied. Original agreement figures are shown separately; variable-rate terms may change. Dates and actual repayments are never inferred from an agreement.
- Unknown terms stay unknown. Scheduled totals are tracking estimates, not bank balances.
- My car and Options buttons on Overview open the full vehicle details and appearance/document settings. Both include Back to Overview, and the main navigation has five tabs: Overview, Maintenance, Fuel, Loan & purchase and Car tips. The public PDF library supports categories, search, upload, SHA-256 deduplication and document viewing.
- In-app PDF reader with an always-visible Back button, page navigation and zoom. Closing it keeps your place in the garage, including document filters. PDFs stay on the app's origin; PDF.js is bundled locally.
- Mobile app screens stay at normal scale. PDF pinch gestures zoom the document itself, so the toolbar and the garage stay at normal size when returning. Mobile form controls use 16px text to avoid focus zoom.
- Red Mica light and dark modes, remembered on each device and applied before the first paint. Warm page backgrounds, separate panel surfaces, bordered popup windows and shaded headers keep screens and stacked dialogs distinct. Long forms scroll beneath their visible title and Close button.
- Car tips has its own bottom tab on phones and sidebar entry on desktop, with compact rows opening saved notes and original reference photos. A full-screen photo reader has Back, pinch zoom and zoom controls; Back returns to the tip. Photo failures offer Retry and keep Back available.
- Installable app. Only the static shell is cached; records and PDFs are never cached by the service worker.
- Automatic app updates check every minute while visible, and on returning to the app or reconnecting. Updates wait for open forms, uploads and PDF reading to finish, then restore the current tab, document filters and scroll position.
- JSON export of state and document metadata.

## Cloudflare

`wrangler.jsonc` defines the existing Pages project, D1 binding `DB`, and R2 binding `DOCUMENTS`. The R2 bucket has public dev URLs and custom domains disabled; the app serves its PDFs publicly through `/api/documents/:id`. No password or authentication secret is required.

Build command: `node scripts/build.mjs`. Output directory: `dist`. Only allowlisted browser assets are included, excluding source files, tests, PDFs, secrets and imports. Pages compiles `functions/` separately. GitHub `main` remains connected to the existing project.

The build generates a deterministic app version in the HTML, service-worker cache name and `version.json`. Client code or dependency changes automatically produce a new version, with no manual cache bump. The version endpoint is never cached. Existing versions without the updater need one initial refresh to install it; later releases apply automatically at a safe point.

New installation: apply `schema.sql` and `migrations/0002_garage.sql`, bind D1/R2, import validated version-2 JSON into `app_state` under id `garage-v2` with a millisecond timestamp, then upload PDFs through the app.

The original `app_state.shared` record remains unchanged as the legacy backup. Personal records and PDFs are not in this repository.

Curated tips use a separate version-1 JSON record in `app_state` under `car-tips-v1`; no schema migration is needed. The record contains `tips` with unique slug IDs, title/category/summary/notes, an ISO `createdAt` date and image metadata (`sha256`, `contentType`, `size`, `width`, `height`). Supported photo types are PNG and JPEG, up to 10 MB. Originals live in the existing R2 bucket at `tips/<sha256>.png` or `.jpg`. `/api/tips` and `/api/tips/:id/image` are read-only; a missing tips record is an empty list. Tip availability does not block other garage screens. Photos and owner notes are imported into R2/D1, never included in the source repository or browser build.

## Security and saving

Fuel records live in the existing D1 garage state as optional `fuelEntries`; no schema migration is needed. Older state remains valid, and saves from older installed clients preserve the fuel log. Personal transaction records are added through the state API, never bundled into the app source.

Loan agreement metadata is optional within the existing version-2 `loan` object. Older clients preserve omitted agreement fields and document links; current clients can clear amounts/rates with `null` and links with an empty array. Source PDFs and imported financial records stay in R2/D1 rather than GitHub.

All data and document routes are public. Mutations require a matching Origin, which prevents cross-site browser submissions but does not restrict who can edit this public app. State writes use a D1 revision comparison to reject stale edits. Failed saves stay visible in the form.

The app no longer creates or checks sessions. Historical session tables from migration 0002 and any existing `APP_PASSWORD` secret are unused. No data migration is required for existing installations. Missing storage bindings return an unavailable response; loading errors offer a retry.

## Development

Requires Node.js 24+ for SQLite-backed tests.

Install dependencies with `pnpm install --frozen-lockfile` before building. The build copies the pinned PDF.js legacy browser library, worker, font/character-map assets and decoder files into `dist/vendor/pdfjs`. Only one page is rendered at a time to limit mobile memory use. The reader renders PDF content on canvas without executing document scripts, embedding the browser's native PDF viewer or relaxing the site's Content Security Policy.

- `npm test`: validation, schedule and loan totals, public access without sessions or secrets, origin checks, stale writes, PDF validation, deduplication and retrieval.
- `npm run build`: assemble browser assets.
- `npx wrangler pages dev dist`: local runtime; use local D1/R2, never production bindings for test data.

New PDF uploads store documents. Log their financial or service details separately, attaching the supporting PDF.

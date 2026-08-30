# Pika Car Maint

A mobile-first, installable car maintenance checklist. It has no login or PIN. Vehicle details, checklist updates, service history and costs sync automatically through Cloudflare D1, with an offline copy kept on each device.

## Features

- Mobile app-style interface matching the Pika Car Maint icon
- Vehicle profile and current mileage
- Due-soon, overdue, good and untracked maintenance states
- Ready-made maintenance checklist plus custom items
- Service history, notes and cost totals in SAR
- Automatic shared sync across devices
- Export and import backup files
- Installable PWA with offline support

## Cloudflare Pages

Connect this repository to Cloudflare Pages and use:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`

### Enable cross-device sync

1. In Cloudflare, create a D1 database named `pika-car-maint-db`.
2. Open its Console and run the SQL inside `schema.sql`.
3. In the Pages project, open **Settings → Bindings → D1 database bindings**.
4. Add the variable name `DB` and select `pika-car-maint-db`.
5. Redeploy the project.

Because the app has no login or PIN, every person or device with the site address shares the same car data.

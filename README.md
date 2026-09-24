# Peskas Management Platform

A website where survey teams check the quality of fish landing data, follow how data collectors are doing, and download the data.

Live at https://validation.peskas.org (sign-in required).

## What it is

The platform is for fisheries officers and survey coordinators in Kenya, Mozambique, Zanzibar and Timor-Leste who run landing surveys. It is available in English, Portuguese and Swahili. Accounts are created by the Peskas team or a platform administrator; you cannot sign up yourself. The first time you sign in, use "Forgot password" with the email address on your account to choose a password. Each account sees only the surveys it has been given.

## What you can do

- Review landing records that the automatic quality checks have flagged, and approve or reject them.
- See how each enumerator is doing: how many records they submit and how often those records are flagged.
- Preview and download the landing data you have access to, validated or raw, as a CSV file.
- Learn to explore that data with R, a free data analysis tool, in five short Data Academy lessons that run in the browser, with nothing to install.
- Send feedback or ask the Peskas team for help from any page.

## Where the data comes from

Enumerators record landings with KoboToolbox. Each country's Peskas data pipeline downloads those records, runs quality checks on them and sends the results here: every 2 days for Kenya, Mozambique and Timor-Leste, every 4 days for Zanzibar. When you approve or reject a record, the decision is also saved in KoboToolbox, where the pipeline reads it on its next run. Downloads and Data Academy lessons use landing data from the [Peskas Fishery Data API](https://api.peskas.org/docs). User accounts, surveys, districts and species lists are kept in Airtable and copied to the platform once a day.

- **Landing**: a boat's return to shore with its catch, recorded by an enumerator.
- **Enumerator**: a trained data collector who records landings at landing sites.
- **KoboToolbox**: the free mobile survey app enumerators use to record landings.
- **Flag (alert)**: a code the quality checks attach to a record that looks wrong. The same code can mean different things in different surveys.

## Who runs it

WorldFish runs the platform as part of Peskas. For help, write to <peskas.platform@gmail.com> or use the feedback form in the platform.

## Part of Peskas

Peskas is WorldFish's open-source platform for monitoring small-scale fisheries (https://peskas.org).

- [Peskas Zanzibar](https://zanzibar.peskas.org), [Peskas Kenya](https://peskas-dashboard-kenya.vercel.app/en), [Peskas Mozambique](https://peskas-dashboard-mozambique.vercel.app): country dashboards
- [Peskas Timor-Leste](https://timor.peskas.org): Timor-Leste portal
- [Peskas Coasts](https://coasts.peskas.org): regional comparison across countries
- [Peskas Tracks](https://tracks.peskas.org): app for fishers to see their trips and log catches
- [Peskas Kenya BMU dashboard](https://digitalfisheries.kenya.peskas.org): dashboard for Beach Management Units in Kenya
- [Peskas Fishery Data API](https://api.peskas.org/docs): programmatic access to landing data
- Data pipelines: [Kenya](https://github.com/WorldFishCenter/peskas.kenya.data.pipeline), [Zanzibar](https://github.com/WorldFishCenter/peskas.zanzibar.data.pipeline), [Mozambique](https://github.com/WorldFishCenter/peskas.mozambique.data.pipeline), [Timor-Leste](https://github.com/WorldFishCenter/peskas.timor.data.pipeline), [Coasts](https://github.com/WorldFishCenter/peskas.coasts)

## For developers

React 18 + TypeScript + Vite frontend (Tabler UI, Highcharts), Node serverless functions in `api/`, MongoDB.

### How it fits together

```
KoboToolbox -> country pipelines -> MongoDB validation-* (surveys_flags-*, enumerators_stats-*) -> api/ -> React
country pipelines -> Peskas Fishery Data API -> lib/peskas-api.js -> Data Download and Data Academy
Airtable -> scripts/sync_* (daily) -> MongoDB (countries, districts, taxa, surveys, users)
status changes -> MongoDB, optionally KoboToolbox -> read back by the pipelines on their next run
```

- MongoDB is the only store the pages read. The platform never calls KoboToolbox while a page loads.
- Each survey has its own `surveys_flags-{asset_id}` and `enumerators_stats-{asset_id}` collections, written by the country pipelines. The pipelines live in their own repos; you cannot run or fix them here.
- Airtable is where users, surveys, districts, species and countries are managed. Access is set by `permissions.surveys` on each user: an admin with an empty list sees every survey, anyone else sees only the surveys listed.

### Setup

Requirements: Node.js 18 or later, a MongoDB database written by the pipelines (`validation-dev` for development), and Quarto with R only if you edit Data Academy lessons.

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev            # frontend on :3000, API on :3001
```

[.env.example](.env.example) lists the variables. `PESKAS_API_KEY` is needed for Data Download and the Data Academy. The Airtable sync needs `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID`. Accounts come from Airtable through `npm run sync:users`; there is no sign-up.

### Main commands

- `npm run dev`: frontend (Vite) and API (`server/dev.js`) together. `npm run server` starts only the local API server; production does not use it.
- `npm run lint` and `npm run build`: the main checks.
- `npm test`: a handful of standalone checks listed in `package.json`. There is no test framework; everything else is checked with lint, build and the running app.
- `npm run render:lessons`: renders the Data Academy lessons from `data-explorer/*.qmd` into `public/data-explorer/lessons/`. Commit the rendered HTML, because Vercel has no Quarto or R. If it fails with `MissingEnvVarsError`, run `cd data-explorer && quarto render .`.
- `npm run sync:all`: copies Airtable into MongoDB in the order countries, districts, taxa, surveys, users (users last, because their permissions point at districts and surveys). Each step also runs alone: `sync:countries`, `sync:districts`, `sync:taxa`, `sync:surveys`, `sync:users`.
- `npm run ensure:indexes`: adds the indexes the pages need to each survey collection (`npm run ensure:indexes -- --dry-run` to preview).

Every user-facing string goes into all three languages under `public/locales/{en,pt,sw}/` in the same change.

### Production

Vercel builds the frontend and deploys `api/` as serverless functions from `main` ([vercel.json](vercel.json)). `server/dev.js` mounts the same handlers for local development, so a new endpoint must be added there too. The Airtable sync runs daily at 02:00 UTC in [.github/workflows/sync-airtable.yml](.github/workflows/sync-airtable.yml) and can be started by hand from the Actions tab.

### Releases

Add a `# Management Platform X.Y.Z` block at the top of [NEWS.md](NEWS.md). On a push to `main`, [.github/workflows/release.yaml](.github/workflows/release.yaml) turns that block into a GitHub release.

### AI-assisted work

[CLAUDE.md](CLAUDE.md) and `.claude/rules/` hold the conventions and known traps.

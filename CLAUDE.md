# peskas-validation

React + Express management portal for KoboToolbox landing surveys: validation, enumerator
performance, data download and the Data Academy (interactive R lessons). Users are fishery managers
and NGO staff in Kenya, Mozambique and Zanzibar. Ecosystem context (other repos, data flow,
cross-repo contracts): see PESKAS.md, loaded via CLAUDE.local.md.

Path-scoped rules load when you touch matching files: `.claude/rules/backend.md` (`api/`,
`server/`, `lib/`, `scripts/`), `frontend.md` (`src/`), `data-explorer.md` (lessons). `docs/` is
gitignored local material (`docs/ARCHITECTURE.md` for the endpoint and collection inventory,
`docs/DECISIONS.md` for past decisions, updated with `/document`); a fresh clone has none of it.

## Commands

- `npm run dev` runs frontend (Vite, :3000) and backend (`server/dev.js`, :3001) together.
- `npm run lint` (tsc for frontend and backend + ESLint) and `npm run build` are the main checks.
- **There is no test framework.** `npm test` runs a handful of standalone `assert`-based files
  (listed in `package.json`, each runnable with `node`/`tsx`). Everything else is verified with
  lint, build, and exercising the change in the running app. Say so when a change is untested.
- `npm run render:lessons` renders the Quarto lessons. If it fails with `MissingEnvVarsError`, use
  `cd data-explorer && quarto render .` (the root script validates `.env`, which a render doesn't need).
- `npm run sync:all` syncs Airtable to Mongo in the order countries -> districts -> taxa ->
  surveys -> users (`scripts/sync_all_from_airtable.js`); `.github/workflows/sync-airtable.yml`
  runs it on a schedule. Users go last because their permissions reference districts and surveys.

## Architecture

```
R pipelines -> Mongo validation-* (surveys_flags-*, enumerators_stats-*) --\
                                                                           +-> api/ -> React
country pipelines -> peskas-api-* bucket -> peskas-api (lib/peskas-api.js) /
Airtable -> scripts/sync_* -> Mongo (countries, districts, taxa, surveys, users)
```

- Validation, enumerator stats and admin screens read Mongo (`lib/db.js`,
  `MONGODB_VALIDATION_URI` / `MONGODB_VALIDATION_DB`). Data download and the Data Academy read
  landings from peskas-api through `lib/peskas-api.js` (`api/data-download/*`).
- The portal never calls KoboToolbox during page load. Status changes update Mongo, optionally push
  to KoboToolbox, and are reconciled on the pipeline's next run.
- **Multi-survey**: each survey has its own `surveys_flags-{asset_id}` and
  `enumerators_stats-{asset_id}` collections. Per-survey KoboToolbox config and alert-code meanings
  live in the `surveys` collection, so alert codes differ between surveys.
- **Permissions**: `permissions.surveys` on the user gates everything. An admin with an empty array
  has access to all surveys; a regular user sees only what is listed.
- Production is `api/` (Vercel serverless); `server/dev.js` mounts the same handlers for local dev.

## Rules

- Add every user-facing string to all three languages (en/pt/sw) under `public/locales/` in the
  same change.
- Keep files under ~400 lines; extract when one grows past that.
- Release: add a `# Management Platform X.Y.Z` block at the top of `NEWS.md`; a push to `main`
  turns it into a GitHub release (`.github/workflows/release.yaml`).

## Gotchas

- **Data Academy lesson source is base64** inside `<script type="webr-N-contents">`, so grepping
  the rendered HTML cannot tell you what a learner sees. Rendered HTML is committed (Vercel has no
  Quarto/R): re-render after editing any `.qmd`.
- `*.md` is gitignored with explicit exceptions (`CLAUDE.md`, `README.md`, `NEWS.md`,
  `.claude/rules/`, `.claude/commands/`). A new markdown file anywhere else is silently untracked.
- The `data-explorer/*.qmd` lessons hard-code landings column names, and `lib/peskas-api.js` /
  `api/data-download/*` hard-code its filter and scope parameters (`catch_taxon`, `gaul_2`,
  `trip_info`/`catch_info`). A column or parameter change in peskas-api breaks them.
- The R pipelines are external to this repo; you cannot run or fix them here.

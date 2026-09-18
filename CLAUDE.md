# CLAUDE.md

Guidance for Claude Code working in this repository. **Version 2.6.0.**

<!-- Keep this file under ~200 lines: it loads into every session, and length costs adherence.
     Detail belongs in .claude/rules/ (path-scoped, loads only for matching files), in docs/, or in
     a skill. Before adding a line, ask: "would removing this cause a mistake?" -->

## What this is

A React + Express + MongoDB platform for KoboToolbox survey data: validation, enumerator
performance tracking, data download, and an interactive Data Academy. Users are fishery managers
and NGO staff in Kenya, Mozambique and Zanzibar.

- **Reference**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — endpoints, collections, scripts, env, deployment
- **Changelog**: [NEWS.md](NEWS.md) · **Lesson authoring**: [docs/LESSON_AUTHORING_GUIDE.md](docs/LESSON_AUTHORING_GUIDE.md)
- **Path-scoped rules** load automatically when you touch matching files:
  `.claude/rules/backend.md` (`api/`, `server/`, `lib/`), `.claude/rules/frontend.md` (`src/`),
  `.claude/rules/data-explorer.md` (lessons)
- **Decision history**: [docs/DECISIONS.md](docs/DECISIONS.md) — *why* past changes were made. Add an
  entry with `/document` when a change alters a pattern.

`docs/` and `.claude/` are **gitignored working material**, present locally but not in the repo. If
a link above resolves to nothing, you are in a fresh clone — everything you strictly need is here.

## Commands

```bash
npm run dev              # frontend + backend together (use this)
npm run dev:frontend     # Vite on :3000
npm run dev:backend      # Express (server/dev.js) on $PORT, default 3001
npm run build            # tsc + vite build
npm run lint             # ESLint + type checking   (lint:fix to autofix)
npm run format           # Prettier                 (format:check to verify)
npm run render:lessons   # Quarto → public/data-explorer/lessons/
npm run sync:all         # Airtable → MongoDB (districts → surveys → users)
```

**There is no test suite.** Verify with `npm run build` and `npm run lint`, and by exercising the
change in the running app. Don't claim a change is tested when it isn't.

If `npm run render:lessons` fails with `MissingEnvVarsError`, use
`cd data-explorer && quarto render .` — the root script validates `.env`, which a render doesn't need.

## Architecture in brief

```
KoboToolbox → R pipeline (external) → MongoDB → api/ → React
```

MongoDB is the single source of truth. An **external R pipeline** writes submissions and alert
flags; the portal reads from Mongo and does not call KoboToolbox during page load.

**Multi-survey**: each survey gets its own collections, `surveys_flags-{asset_id}` and
`enumerators_stats-{asset_id}`. Per-survey KoboToolbox config and alert-code meanings live in the
`surveys` collection, so alert codes differ between surveys.

**Permissions**: `permissions.surveys` on the user gates everything. **An admin with an empty array
has access to all surveys**; a regular user sees only what is listed. Never trust a client-supplied
survey or country id — filter through `lib/filter-permissions.js`.

**Production is `api/` (Vercel serverless); `server/dev.js` mounts those same handlers for local
dev. `server/index.js` was deleted** — do not reference or recreate it.

## Rules that apply everywhere

- **Adding an `api/` endpoint means also adding `mountServerlessFunction(...)` to `server/dev.js`**,
  or it will work in production and 404 locally.
- **`await logAuditEvent(db, event)` before sending the response.** Vercel freezes the context after
  `res.json()`, so fire-and-forget audit writes are silently lost.
- **Validate `asset_id` before interpolating a collection name**, and ObjectIds before querying.
- **Use `lib/` helpers** (`response.js`, `db.js`, `middleware.js`, `helpers.js`) rather than
  re-implementing responses, connections or guards.
- **Tabler UI first.** Check <https://tabler.io/docs> for a component or utility class before
  writing custom CSS. Icons: `@tabler/icons-react` only.
- **Every user-facing string is translated into all three languages** (en/pt/sw) in the same change.
- **Never mutate state** — build new arrays/objects.
- **Keep files under ~400 lines**; extract when one grows past that.
- TypeScript strict mode is on. Don't reach for `any`.

## Working style

**Think before coding.** State assumptions; if a request has two readings, say so instead of
silently picking one. If a simpler approach exists, push back.

**Simplicity first.** The minimum code that solves the problem — no speculative abstractions, no
configurability nobody asked for, no error handling for impossible states. If 200 lines could be 50,
write 50.

**Surgical changes.** Touch only what the task requires. Don't reformat or "improve" adjacent code,
and match the existing style even where you'd choose differently. Clean up orphans *your* change
created; if you spot unrelated dead code, mention it rather than deleting it.

**Verify, don't assume.** Define what "done" looks like before starting, then check it. State what
you actually ran and what it returned. If something is unverified — a browser-only behaviour, a
flow you couldn't exercise — say so plainly instead of implying it was checked.

**Persist.** Finish the whole task, not the easy parts. If something is genuinely blocked, complete
everything else and say explicitly what was left and why.

## Gotchas

- **Data Academy lesson source is base64** inside `<script type="webr-N-contents">` — grepping the
  rendered HTML cannot tell you what a learner sees. Decode it. Rendered HTML is **committed**
  (Vercel has no Quarto/R), so re-render after editing any `.qmd`.
- **`docs/*.md` was invisible to git** until `!docs/**` was added to `.gitignore`; `*.md` still
  catches new root-level markdown, so re-check if you add a doc there.
- The R pipeline is **external to this repo** — it is not something you can run or fix here.

<!-- Note on .claude/: agents/ and commands/ are discovered by Claude Code automatically and need
     no documentation here. skills/ currently holds plain .md files with no SKILL.md, so nothing in
     it auto-loads; contexts/ is not a Claude Code feature. The hooks in ~/.cursor/settings.json are
     Cursor's, not Claude Code's — assume no automatic checks run, and verify your own work. -->

---
paths:
  - "data-explorer/**"
  - "public/data-explorer/**"
  - "src/components/DataExplorer/**"
---

# Data Academy rules (interactive R lessons)

Five numbered lessons + a printable recipe card, teaching non-coders (fishery officers in Kenya,
Mozambique, Zanzibar, Timor-Leste) to read, filter, summarise and chart their own landings data. R runs **in the
browser** via quarto-live + webR — there is no server-side R.

**Read `docs/LESSON_AUTHORING_GUIDE.md` before writing or editing a lesson.** (`docs/` is gitignored; the guide exists only in local checkouts.) It holds the audience
profile, writing rules, lesson skeleton and pre-publish checklist.

## Build

Lessons are Quarto `.qmd` in `data-explorer/`; rendered HTML is **committed** to
`public/data-explorer/lessons/` because Vercel has no Quarto or R.

```bash
npm run render:lessons                    # preferred
cd data-explorer && quarto render .       # if the above fails with MissingEnvVarsError
```

The root script validates `.env`, which a lesson render doesn't need — hence the fallback. Always
re-render and commit the HTML after editing a `.qmd`, or the site keeps serving the old lesson.

## The verification trap

**A `{webr}` cell's source is base64-encoded JSON inside `<script type="webr-N-contents">`.**
Grepping the rendered HTML tells you nothing about what a learner actually reads. Decode it:

```python
re.finditer(r'<script type="webr-(\d+)-contents">(.*?)</script>', html, re.S)  # then base64 → json
```

This is how authoring notes and `tryCatch(as.data.frame(...))` once shipped inside editable boxes.

## Learner-facing vs plumbing

- Fetches, data-frame conversion and `library()` calls use `#| include: false` and are wrapped in
  `::: {.lesson-plumbing}`. **Do not use `display:none`** — it can defer cell evaluation; the class
  zeroes margins instead.
- **Every visible code box contains only R the lesson explains.** No authoring notes, no file paths,
  no shortcodes, no jargon. Author notes go in HTML comments *above* the fence, never inside it.
- Data loads automatically on page open; the button is a **retry, not a gate**. Gating it would
  leave anyone who scrolled past hitting `object 'landings' not found` in every box below.

## Conventions

- Toy tables use the **real** column names (`gaul_2_name`, `catch_taxon`, `catch_kg`,
  `landing_date`) so practice transfers, but **placeholder species values** (`species 1`,
  `species 2`, …) — never real fish names, which can be wrong for the fishery and start arguments.
- Shared includes (`data-explorer/_*.qmd`): `_landings-panel` (user data — the only copy of the
  contract with the app), `_example-data`, `_data-dictionary`, `_before-we-start`,
  `_slow-start-notice`. Fix a definition once, in the include.
- Styling lives in `data-explorer/lesson.css`. **No per-lesson `<style>` blocks.** A doc-level
  `format:` *replaces* the project one, so `recipes.qmd` must repeat `css: lesson.css`.
- `lessons.ts` array order **is** curriculum order and drives "Lesson 3 of 5". Each `.qmd` hard-codes
  its own position and duration, so reordering means editing those strips and the "Next:" links too.
- Lesson data comes from `GET /api/data-download/explorer-data` — permission-filtered in
  `api/data-download/explorer-data.js` through `resolveDownloadRequests` (`lib/filter-permissions.js`), capped at `LESSON_ROW_CAP = 5000`.

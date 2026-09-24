---
name: document
description: Record a significant change in the decision log
---

# /document

Record a significant change in the decision log, so the reasoning survives the diff.

## When to run this

Run it after a change that alters a **pattern**: a new API or component convention, a schema or
collection change, an auth/permission change, adopting a library, or a refactor that changes how
something is done.

Do **not** run it for minor bug fixes, copy-paste of an existing pattern, UI text, or dependency
bumps. A log padded with routine entries is one nobody reads.

## What to do

1. Read the top of [docs/DECISIONS.md](../../docs/DECISIONS.md) to match the house style.
2. Add one entry **at the top of the entry list**, directly under the `---` that follows the index,
   using today's date:

```markdown
## YYYY-MM-DD: Short title

**Context**: what forced the change — the symptom, constraint or request.
**Decision**: what was done.
**Consequences**: what this now commits us to, including the trade-off accepted.
**Files**: the main files touched.
```

3. Add the matching row to the **Index** table at the top of the file.
4. If the change introduces a rule that applies to future work, put it where it will be read:
   - applies to *every* task → `CLAUDE.md`
   - applies only in one area → `.claude/rules/backend.md`, `frontend.md` or `data-explorer.md`
   - look-up material (an endpoint, a collection, a variable) → `docs/ARCHITECTURE.md`
   - user-visible → `NEWS.md`

## Writing the entry

State the **trade-off you accepted**, not only the benefit. An entry that lists nothing but wins is
the one a future reader stops trusting. If a simpler approach was rejected, say why in one line —
that is usually the most valuable sentence in the entry.

Keep it to what a reader could not reconstruct from the diff. The code shows *what* changed; this
file exists for *why*.

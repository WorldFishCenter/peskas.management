---
paths:
  - "src/**"
---

# Frontend rules (src/)

React 18 + TypeScript (strict) + Vite + React Router v7 + TanStack Table v8 + Highcharts.

## UI: framework first

- **Tabler Core** (`@tabler/core`, Bootstrap 5 based) is the design system. Check
  <https://tabler.io/docs> for an existing component or utility class **before** writing custom CSS.
- Icons come from `@tabler/icons-react` only — do not add another icon set.
- Use Tabler utility classes for spacing, colour and layout instead of ad-hoc styles.
- Match the surrounding components' structure; new screens should be indistinguishable in style
  from existing ones.

## State

- **Custom hooks for data fetching**, each exposing loading/error state: `src/api/api.ts` (app data),
  `src/api/admin.ts` (admin data). Add new fetching there rather than calling axios in a component.
- React Context for global state: `AuthContext` (`src/components/Auth/`), `SurveyContext` (`src/contexts/`), `I18nContext` (`src/i18n/`).
- **No Redux/MobX.** Hooks and context only.
- `SurveyContext` is the single source of truth for the selected survey across routes — read it,
  don't duplicate survey selection in component state.
- **Never mutate state.** Build new arrays/objects (`[...xs, x]`, `{...o, k: v}`).

## Types

TypeScript strict mode is on. No `any` as a shortcut — if a type is genuinely unknown, model it
(`unknown` + a narrowing check) rather than opting out.

## i18n

Every user-facing string goes through i18next — **English, Portuguese and Swahili**, all three, or
the UI ships half-translated. Namespaces live in `public/locales/{lang}/`: `common`, `auth`,
`navigation`, `validation`, `enumerators`, `admin`, `guide`, `download`, `dataExplorer`. Add the key to all three languages in
the same change.

## Traps that have already bitten

- **Always use `extractErrorMessage(err, fallback)`** (`src/utils/errors.ts`) in hook catch blocks. Never
  `err.response?.data?.error || ...` directly — Vercel gateway errors put an object `{code, message}`
  there, not a string, and it renders as `[object Object]`.
- **`useFetchSubmissions` / `useFetchEnumeratorStats` read `selectedSurveyId` from a `useRef`**, not
  from the `useCallback` closure, so `fetchData` stays stable and the mount effect doesn't refire on
  every survey change. An in-flight request is cancelled via `AbortController`; guard both `catch`
  and `finally` with `signal.aborted` so a cancelled request can't blank good data.
- **Every `useMemo`/`useState`/`useCallback` must sit above any conditional early return** in the
  chart components. An early return before a hook caused "Rendered fewer hooks than expected".
- **Sort dates with `new Date(x).getTime()`, not `localeCompare`** — `submission_date` may be a Date
  object rather than a string, and string comparison silently mis-orders it.
- Derived chart data belongs in `useMemo`; as a plain variable it recomputes `chartOptions` on every
  render.

## Auth

JWT in localStorage, 7-day expiry. The API base URL is published by `getApiBaseUrl()` (`src/utils/apiConfig.ts`)
and written to localStorage key `apiBaseUrl` by `src/utils/axiosConfig.ts` — the Data Academy's static lesson pages
depend on this, so don't change the key without updating `data-explorer/_landings-panel.qmd`.

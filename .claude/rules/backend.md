---
paths:
  - "api/**"
  - "server/**"
  - "lib/**"
  - "scripts/**"
---

# Backend rules (api/, server/, lib/)

Production runs Vercel serverless functions in `api/`. `server/dev.js` mounts those same
handlers for local dev via `mountServerlessFunction()`. `server/index.js` was deleted; never
reference or recreate it.

## The handler shape

`withMiddleware(handler, ...middlewares)` (`lib/middleware.js`) only runs the middleware chain
(`authenticateUser`, then `requireAdmin` for admin routes) and catches uncaught errors as a
generic 500. Everything else is the handler's job:

```js
const { withMiddleware, authenticateUser } = require('../lib/middleware');
const { getDb } = require('../lib/db');
const { sendSuccess, sendServerError, sendMethodNotAllowed, setCorsHeaders } = require('../lib/response');

async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
  try {
    const database = await getDb();
    // req.user = { id, username, role, country, permissions }, fresh from Mongo
    return sendSuccess(res, { ... });
  } catch (error) {
    return sendServerError(res, error);
  }
}
module.exports = withMiddleware(handler, authenticateUser);          // admin: add requireAdmin
```

- Call `setCorsHeaders` and answer OPTIONS inside the handler. `authenticateUser` runs first, so
  its 401s go out without CORS headers.
- The four unauthenticated `api/auth/*` routes (`login`, `forgot-password`, `reset-password`, `validate-reset-token`) export a bare handler without `withMiddleware`.

## Non-negotiable

- **Adding an `api/` endpoint means also adding `mountServerlessFunction(...)` to `server/dev.js`.**
  Skipping it produces an endpoint that works in production and 404s locally.
- **`await logAuditEvent(db, event)` BEFORE sending the response.** Vercel freezes the execution
  context after `res.json()`, so a fire-and-forget audit write is silently dropped.
- **Validate `asset_id` before building a dynamic collection name** (`surveys_flags-{asset_id}`,
  `enumerators_stats-{asset_id}`); use `getSurveyFlagsCollection` / `getEnumeratorStatsCollection`.
- **Validate ObjectIds** (`validateObjectId`) before any query that takes an id.
- **Never return password hashes or tokens**; project them out of the query.

## Use `lib/`, don't re-implement

| Need | Use |
|------|-----|
| Responses and CORS | `response.js`: `sendSuccess`, `sendBadRequest`, `sendForbidden`, `sendNotFound`, `sendServerError`, `sendDetailedError`, `sendMethodNotAllowed`, `setCorsHeaders` |
| DB connection | `db.js`: `getDb` |
| Auth / guards | `middleware.js`: `withMiddleware`, `authenticateUser`, `requireAdmin`; `jwt.js` |
| Permission filtering | `filter-permissions.js`: `getAccessibleSurveys(user, countryId)`, `getAccessibleCountries(user)`, `getAccessibleDistricts(user, countryId, surveyId)`, `getAccessibleTaxa(countries, countryId)` (takes the output of `getAccessibleCountries`), `resolveDownloadRequests(user, query)` |
| Audit | `audit-logger.js`: `logAuditEvent`, `ensureAuditIndexes` |
| Helpers | `helpers.js`: `validateObjectId`, `sanitizeCSV`, `getSurveyFlagsCollection`, `getEnumeratorStatsCollection`, `escapeRegex`, `isValidDate`, `validatePassword` |
| External APIs | `peskas-api.js` (Peskas API), `api-utils.js` (KoboToolbox), `email.js` (SES), `rate-limit.js` |

Both `server/dev.js` and `api/` import from `lib/`; put shared logic there, not in one caller.

## Permissions model

A user's `permissions.surveys` array is the gate. **Admin with an empty array = access to all
surveys**; a regular user sees only the surveys listed (`getAccessibleSurveys`). Every
data-returning endpoint filters through `filter-permissions.js` rather than trusting a
client-supplied survey/country id. Authentication is not authorization: check that the
requested `asset_id` is in the user's accessible surveys.

## Traps that have already bitten

- **`api/kobo/submissions.js` pages, sorts and filters in MongoDB.** It returns
  `{ results, count, total, page, limit, metadata }` and the table runs TanStack in manual mode
  against it. The query is built by `lib/submissions-query.js` (allowlisted sort key, escaped
  search regex, clamped limit), checked by `lib/submissions-query.test.js`. Do not reintroduce an
  unbounded `.find().toArray()`: the whole collection was a 9.8 MB response on the largest
  survey, past Vercel's 4.5 MB cap.
- **Whole-collection `metadata` (`statuses`, `date_range`) is computed only on `?meta=1`** and is
  absent otherwise. `useFetchSubmissions` re-asks only when the survey changes (`metaSurveyRef`).
  A new whole-collection field goes behind the same flag, or the client stops refreshing it.
- **`/api/enumerators-stats` returns a `$group` rollup** (one row per enumerator, day, alert
  code), not raw submissions. Keep it that way.
- **Neither endpoint repeats the survey on every row.** They serve one survey per request and
  name it once in `metadata.survey`; `src/api/api.ts` re-attaches it client-side.
- **Survey selection is signalled by message text.** When a user can see several surveys and
  sent no `survey_id`, the endpoint returns an empty page with `message: 'Please select a survey
  to view submissions'` (or `... statistics`) plus `metadata.accessible_surveys`, and
  `src/api/api.ts` compares that string verbatim. Change both sides together.
- **`vercel.json` matches the first glob that fits**: put `api/data-download/*.js` before
  `api/**/*.js`, or the specific config is ignored.
- **Check query-string sort keys against an allowlist** (`SORTABLE_FIELDS`) before `sort()`.
- **Cap password length (`MAX_PASSWORD_LENGTH`, 200) before `bcrypt.compare`**; unbounded bcrypt input
  is a cheap denial-of-service.

## Security defaults

- Password reset never reveals whether an account exists. Tokens are `crypto.randomBytes(32)`,
  one-time, expiring after `PASSWORD_RESET_TOKEN_EXPIRY` seconds (default 3600). Passwords use bcrypt.
- Validate every parameter passed to an external API against a regex (`lib/peskas-api.js`), and
  run CSV output through `sanitizeCSV()` to block formula injection.
- Rate limiting: `lib/rate-limit.js` for app endpoints, `lib/airtable-rate-limiter.js` for Airtable.

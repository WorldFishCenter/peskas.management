/**
 * GET /api/kobo/submissions
 *
 * Fetch one page of submissions from MongoDB, filtered by user permissions.
 * Supports multi-survey architecture with explicit survey selection.
 * Requires authentication.
 *
 * Paging, sorting and filtering all happen in MongoDB. Returning the whole collection put the
 * largest survey (51,912 rows) at 9.8 MB — past Vercel's 4.5 MB response cap, and growing with
 * the data. Query parameters: `page`, `limit`, `sort`, `order`, `status`, `alert`, `from`, `to`,
 * `search`; see `lib/submissions-query.js` for how each is validated.
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const { getDb } = require('../../lib/db');
const { getSurveyFlagsCollection } = require('../../lib/helpers');
const { getAccessibleSurveys } = require('../../lib/filter-permissions');
const { buildSubmissionsQuery } = require('../../lib/submissions-query');
const { sendSuccess, sendServerError, sendMethodNotAllowed, setCorsHeaders } = require('../../lib/response');

const PROJECTION = {
  submission_id: 1,
  submission_date: 1,
  submitted_by: 1,
  validation_status: 1,
  validated_at: 1,
  validated_by: 1,
  alert_flag: 1,
  // Which catch raised each alert. Sent only when there is one: most submissions store an
  // empty list, and sending it on every row would add about a megabyte to the largest survey.
  alert_catches: { $cond: [{ $eq: ['$alert_catches', []] }, '$$REMOVE', '$alert_catches'] },
  _id: 0
};

const surveyRef = s => ({ asset_id: s.asset_id, name: s.name, country_id: s.country_id });

const surveyOption = s => ({ ...surveyRef(s), alert_codes: s.alert_codes || {} });

const emptyPage = (res, extra = {}) =>
  sendSuccess(res, { count: 0, total: 0, page: 1, limit: 0, results: [], metadata: { accessible_surveys: [] }, ...extra });

async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  try {
    const database = await getDb();
    if (!database) {
      return sendServerError(res, 'Database not configured');
    }

    const user = req.user;

    let accessibleSurveys = await getAccessibleSurveys(user);

    if (accessibleSurveys.length === 0) {
      return emptyPage(res);
    }

    // Save full list before any filtering — always returned in metadata so the
    // frontend can populate the survey selector regardless of which survey is loaded
    const allAccessibleSurveys = [...accessibleSurveys];

    const surveyIdFilter = req.query.survey_id;

    if (surveyIdFilter) {
      // User selected a specific survey - filter to just that one
      accessibleSurveys = allAccessibleSurveys.filter(s => s.asset_id === surveyIdFilter);

      if (accessibleSurveys.length === 0) {
        return emptyPage(res, { message: 'Survey not found or access denied' });
      }
    } else if (accessibleSurveys.length > 1) {
      // Multiple surveys available but no selection — require explicit choice
      return emptyPage(res, {
        message: 'Please select a survey to view submissions',
        metadata: { accessible_surveys: allAccessibleSurveys.map(surveyOption) }
      });
    }

    // Enumerator restrictions
    const allowedEnumerators = user.permissions?.enumerators || [];
    const enumeratorFilter = allowedEnumerators.length > 0
      ? { submitted_by: { $in: allowedEnumerators } }
      : {};

    // Exactly one survey is loaded per request — either the client picked one, or the user has
    // only one. Both branches above guarantee it, so there is no fan-out to merge.
    const survey = accessibleSurveys[0];
    const collection = database.collection(getSurveyFlagsCollection(survey.asset_id));

    const { filter, sort, skip, limit, page } = buildSubmissionsQuery(req.query, enumeratorFilter);

    // Everything the survey as a whole implies — which statuses exist, how far the dates run —
    // has to come from the collection now that only one page of rows is loaded. The picker bounds
    // used to be derived from the rows themselves, which stops being correct at the first page
    // break.
    //
    // Only computed when the client asks (`?meta=1`), because none of it changes as you page,
    // sort or filter within a survey — `src/api/api.ts` keeps it and re-asks when the survey
    // changes. One request at a time these three cost nothing measurable; ten at once they cost
    // a third of the response time, which is where the page turns of several users collide.
    const wantMeta = req.query.meta === '1';
    const scope = { type: { $ne: 'metadata' }, ...enumeratorFilter };
    const dated = { ...scope, submission_date: { $ne: null } };
    /** @type {import('mongodb').FindOptions} */
    const bounds = { sort: { submission_date: 1 }, projection: { submission_date: 1, _id: 0 } };

    const [results, total, statuses, earliest, latest] = await Promise.all([
      collection.find(filter, { projection: PROJECTION }).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(filter),
      wantMeta ? collection.distinct('validation_status', scope) : null,
      wantMeta ? collection.findOne(dated, bounds) : null,
      wantMeta ? collection.findOne(dated, { ...bounds, sort: { submission_date: -1 } }) : null
    ]);

    // Rows are returned exactly as stored. The identity of the owning survey goes in
    // `metadata.survey` once instead of on every row, and absent fields stay absent rather than
    // being padded with '' / null. Repeating three survey fields and six empty defaults across
    // 52k rows doubled the largest response (18.5 MB measured) for no added information;
    // `src/api/api.ts` re-attaches them client-side.
    return sendSuccess(res, {
      count: results.length,
      total,
      page,
      limit,
      results,
      metadata: {
        survey: surveyRef(survey),
        // Absent rather than empty when not asked for, so the client can tell "no statuses in
        // this survey" from "you did not ask" and keeps what it already has.
        ...(wantMeta && {
          statuses: statuses.filter(Boolean).sort(),
          date_range: {
            min: earliest?.submission_date ?? null,
            max: latest?.submission_date ?? null
          }
        }),
        accessible_surveys: allAccessibleSurveys.map(surveyOption)
      }
    });

  } catch (error) {
    console.error('Error in submissions handler:', error);
    return sendServerError(res, 'Failed to fetch submissions');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

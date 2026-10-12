/**
 * GET /api/enumerators-stats
 *
 * Fetch enumerator statistics from MongoDB filtered by user permissions.
 * Supports per-survey loading — requires explicit survey selection when user
 * has access to multiple surveys (same pattern as /api/kobo/submissions).
 * Requires authentication.
 */

const { withMiddleware, authenticateUser } = require('../lib/middleware');
const { getDb } = require('../lib/db');
const { getSurveyFlagsCollection, PLACEHOLDER_ENUMERATORS } = require('../lib/helpers');
const { getAccessibleSurveys } = require('../lib/filter-permissions');
const { sendSuccess, sendServerError, sendMethodNotAllowed, setCorsHeaders } = require('../lib/response');

/** Kept local rather than shared with `api/kobo/submissions.js` — the survey shape already
 *  varies by endpoint (`api/data-download/metadata.js` carries `active` instead). */
const surveyRef = s => ({ asset_id: s.asset_id, name: s.name, country_id: s.country_id });

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

    // Permission filtering goes through filter-permissions.js. This endpoint used to inline its
    // own copy of the admin/empty-array rule, which meant the rule was written twice and could
    // drift — the surveys endpoint had already drifted the same way.
    let accessibleSurveys = await getAccessibleSurveys(user);

    if (accessibleSurveys.length === 0) {
      return sendSuccess(res, {
        count: 0,
        results: [],
        metadata: { accessible_surveys: [] }
      });
    }

    // Save full list before any filtering — always returned in metadata
    const allAccessibleSurveys = [...accessibleSurveys];

    const surveyIdFilter = req.query.survey_id;

    if (surveyIdFilter) {
      accessibleSurveys = allAccessibleSurveys.filter(s => s.asset_id === surveyIdFilter);

      if (accessibleSurveys.length === 0) {
        return sendSuccess(res, {
          count: 0,
          results: [],
          message: 'Survey not found or access denied',
          metadata: { accessible_surveys: allAccessibleSurveys.map(surveyRef) }
        });
      }
    } else if (accessibleSurveys.length > 1) {
      return sendSuccess(res, {
        count: 0,
        results: [],
        message: 'Please select a survey to view statistics',
        metadata: { accessible_surveys: allAccessibleSurveys.map(surveyRef) }
      });
    }

    // Enumerator restrictions
    const allowedEnumerators = user.permissions?.enumerators || [];
    const enumeratorFilter = allowedEnumerators.length > 0
      ? { submitted_by: { $in: allowedEnumerators } }
      : {};

    // Exactly one survey is loaded per request, same as /api/kobo/submissions.
    const survey = accessibleSurveys[0];

    // The dashboard never shows an individual submission: every chart is a count per enumerator,
    // per day, or per alert code. So the grouping happens in MongoDB rather than being shipped raw
    // and grouped in the browser — 52,102 documents collapse to 9,582 rollup rows for the largest
    // survey, measured. Every figure the UI renders is still derivable, because the rollup key is
    // the full (enumerator, day, alerts) triple.
    //
    // Read from the flags collection, one document per submission, so `count` is submissions: an
    // error rate is flagged submissions over submissions. `enumerators_stats-*` holds one row per
    // submission per alert code, so a submission with two codes counted as two flagged
    // submissions there. `alert_flag` is the submission's whole list ("3, 7"); the client splits
    // it into codes for the alert-type chart.
    //
    // `$convert` rather than a bare `$dateToString`: not every collection is guaranteed to store
    // `submission_date` as a BSON date, and a string would abort the whole pipeline. A row whose
    // date will not parse still counts toward the enumerator's total, it just has no day.
    const results = await database.collection(getSurveyFlagsCollection(survey.asset_id))
      .aggregate([
        {
          $match: {
            type: { $ne: 'metadata' },
            submitted_by: { $nin: PLACEHOLDER_ENUMERATORS },
            ...enumeratorFilter
          }
        },
        {
          $group: {
            _id: {
              submitted_by: '$submitted_by',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $convert: { input: '$submission_date', to: 'date', onError: null, onNull: null } },
                  onNull: null
                }
              },
              alert_flag: '$alert_flag'
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            count: 1,
            submitted_by: '$_id.submitted_by',
            date: '$_id.date',
            // Absent, 'NA' and '' all mean "no alert". Collapsing them to one absent field keeps
            // the client from having to know three spellings of the same thing.
            alert_flag: {
              $cond: [{ $in: ['$_id.alert_flag', [null, 'NA', '']] }, '$$REMOVE', '$_id.alert_flag']
            }
          }
        }
      ])
      .toArray();

    return sendSuccess(res, {
      count: results.length,
      results,
      metadata: {
        survey: surveyRef(survey),
        accessible_surveys: allAccessibleSurveys.map(surveyRef)
      }
    });

  } catch (error) {
    console.error('Error in enumerators-stats handler:', error);
    return sendServerError(res, 'Failed to fetch enumerator statistics');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

/**
 * GET /api/kobo/submission/:id?asset_id=
 *
 * One submission's answers, read from KoboToolbox with the survey's stored token, so a reviewer
 * needs no KoboToolbox account. Read-only.
 */

const { sendSuccess, sendDetailedError, sendForbidden, sendMethodNotAllowed, setCorsHeaders } = require('../../../lib/response');
const { withMiddleware, authenticateUser } = require('../../../lib/middleware');
const { getAccessibleSurveys } = require('../../../lib/filter-permissions');
const { isValidSubmissionId, isDefaultRetryable } = require('../../../lib/api-utils');
const { fetchSubmissionView } = require('../../../lib/kobo-submission');

const CONTEXT = 'GET /api/kobo/submission/:id';

async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);

  try {
    const id = req.query.id;
    if (!isValidSubmissionId(id)) {
      return sendDetailedError(res, CONTEXT, new Error('Invalid submission id'), req, 400);
    }

    const survey = (await getAccessibleSurveys(req.user)).find(s => s.asset_id === req.query.asset_id);
    if (!survey) {
      return sendForbidden(res, 'You do not have access to the requested survey.');
    }

    const view = await fetchSubmissionView(survey, id);
    if (!view) {
      return sendDetailedError(res, CONTEXT, new Error('This survey has no KoboToolbox connection configured'), req, 422);
    }
    return sendSuccess(res, view);
  } catch (error) {
    if (error.isAxiosError) {
      const koboStatus = error.response?.status;
      // What is worth retrying says "try again" (504); any other refusal is a configuration
      // problem (502). Neither goes out as 401/403, which would sign the reviewer out.
      const status = koboStatus === 404 ? 404 : isDefaultRetryable(error) ? 504 : 502;
      return sendDetailedError(res, `${CONTEXT} - KoboToolbox API error`,
        new Error(`KoboToolbox API error: ${koboStatus || 'no response'} - ${error.message}`), req, status);
    }
    return sendDetailedError(res, CONTEXT, error, req, 500);
  }
}

module.exports = withMiddleware(handler, authenticateUser);

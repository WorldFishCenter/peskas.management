/**
 * GET /api/kobo/edit-url/:id?asset_id=
 *
 * Generate Enketo edit URL for a KoboToolbox submission
 * Requires authentication
 */

const { sendDetailedError, sendForbidden, setCorsHeaders } = require('../../../lib/response');
const { withMiddleware, authenticateUser } = require('../../../lib/middleware');
const { getAccessibleSurveys } = require('../../../lib/filter-permissions');
const { koboSubmissionRequest, isValidSubmissionId } = require('../../../lib/api-utils');

// The function stops at 10 s; one slow KoboToolbox attempt must fit inside it.
const KOBO_TIMEOUT_MS = 8000;

async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id;
    const assetId = req.query.asset_id;

    if (!isValidSubmissionId(id)) {
      return sendDetailedError(res, 'GET /api/kobo/edit-url/:id - Invalid ID',
        new Error('Invalid submission id'), req, 400);
    }

    // Only a survey this user may see: the stored token would otherwise open any survey's records.
    const survey = (await getAccessibleSurveys(req.user)).find(s => s.asset_id === assetId);
    if (!survey) {
      return sendForbidden(res, 'You do not have access to the requested survey.');
    }

    const request = koboSubmissionRequest(survey, id, 'enketo/edit/?return_url=false', { method: 'GET' }, KOBO_TIMEOUT_MS);
    if (!request) {
      return sendDetailedError(res, 'GET /api/kobo/edit-url/:id - Missing KoboToolbox config',
        new Error('This survey has no KoboToolbox connection configured'), req, 500);
    }
    const response = await request;

    if (!response.data?.url) {
      return sendDetailedError(res, 'GET /api/kobo/edit-url/:id - Invalid KoboToolbox response',
        new Error('KoboToolbox API did not return an edit URL'), req, 502);
    }

    return res.json({ url: response.data.url });
  } catch (error) {
    if (error.isAxiosError) {
      const koboStatus = error.response?.status;
      // KoboToolbox's own 401/403 is about the stored token, not this user's session: passing
      // it on would make the browser sign the user out.
      const status = koboStatus === 404 ? 404 : 502;
      const message = error.response?.data?.detail || error.response?.statusText || error.message;
      return sendDetailedError(res, 'GET /api/kobo/edit-url/:id - KoboToolbox API error',
        new Error(`KoboToolbox API error: ${koboStatus || 'no response'} - ${message}`), req, status);
    }
    return sendDetailedError(res, 'GET /api/kobo/edit-url/:id', error, req, 500);
  }
}

module.exports = withMiddleware(handler, authenticateUser);

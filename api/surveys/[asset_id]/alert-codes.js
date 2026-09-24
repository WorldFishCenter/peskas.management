/**
 * GET /api/surveys/:asset_id/alert-codes
 *
 * Get survey-specific alert code definitions
 * Requires authentication and access to the survey
 */

const { sendDetailedError, sendForbidden, setCorsHeaders } = require('../../../lib/response');
const { withMiddleware, authenticateUser } = require('../../../lib/middleware');
const { getAccessibleSurveys } = require('../../../lib/filter-permissions');

async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(res, req);

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get asset_id from query parameter (Vercel converts [asset_id] to query.asset_id)
    const asset_id = req.query.asset_id;

    if (!asset_id) {
      return sendDetailedError(res, 'GET /api/surveys/:asset_id/alert-codes - Missing asset_id',
        new Error('asset_id parameter is required'), req, 400);
    }

    const accessibleSurveys = await getAccessibleSurveys(req.user);
    const survey = accessibleSurveys.find(s => s.asset_id === asset_id);
    if (!survey) {
      return sendForbidden(res, 'You do not have access to the requested survey.');
    }

    // Return survey-specific alert codes if available, otherwise return default codes
    const alertCodes = survey.alert_codes || {
      "1": "A catch was reported, but no taxon was specified",
      "2": "A taxon was specified, but no information was provided about the number of fish, their size, or their weight",
      "3": "Length is smaller than minimum length threshold for the selected catch taxon",
      "4": "Length exceeds maximum length threshold for the selected catch taxon",
      "5": "Bucket weight exceeds maximum (50kg)",
      "6": "Number of buckets exceeds maximum (300)",
      "7": "Number of individuals exceeds maximum (100)",
      "8": "Price per kg exceeds threshold",
      "9": "Catch per unit effort exceeds maximum (30kg per hour per fisher)",
      "10": "Revenue per unit effort exceeds threshold"
    };

    return res.json({
      asset_id,
      alert_codes: alertCodes
    });
  } catch (error) {
    return sendDetailedError(res, 'GET /api/surveys/:asset_id/alert-codes', error, req, 500);
  }
}

// Apply authentication middleware
module.exports = withMiddleware(handler, authenticateUser);

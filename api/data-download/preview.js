/**
 * GET /api/data-download/preview
 *
 * Fetch preview data (first 20 rows) from PeSKAS API with permission-based filtering.
 *
 * Admin users can select any country and GAUL codes.
 * Regular users are restricted to their assigned country and GAUL codes.
 *
 * @access Protected - Requires JWT authentication
 * @permission Filtered by user's country/survey/GAUL code permissions
 *
 * Query Parameters (all optional, snake_case format):
 * @queryparam {string} country - Country code (lowercase, e.g., "zanzibar", "mozambique")
 *                                Admin: required parameter
 *                                Regular user: uses first assigned country from user.country[0]
 * @queryparam {string} survey_id - Survey asset_id (currently NOT sent to PeSKAS API - see limitation)
 * @queryparam {string} gaul_2 - District GAUL code (single value only, e.g., "12345")
 * @queryparam {string} status - Data validation status: "validated" or "raw" (default: "validated")
 * @queryparam {string} catch_taxon - FAO ASFIS species code(s), comma-separated (e.g., "SKJ" or "SKJ,YFT")
 * @queryparam {string} scope - Data scope: "trip_info" or "catch_info" (optional)
 * @queryparam {string} dataset - "landings" (trips, default) or "district-months" (monthly figures
 *                                per district). District-months take only country and gaul_2:
 *                                validated data, every form of the country.
 *
 * Known Limitations:
 * - survey_id filtering is disabled (PeSKAS uses different survey identifiers)
 * - gaul_2 only supports single district (PeSKAS API limitation)
 *
 * Response Format:
 * {
 *   data: [{...landing records...}],
 *   total_count: number,
 *   filters_applied: {...actual filters sent to PeSKAS API...}
 * }
 *
 * @module api/data-download/preview
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const {
  resolveDownload,
  fetchPreview,
  servedScope,
  downloadAuditDetails,
  sendDownloadError
} = require('../../lib/download');
const { sendSuccess, setCorsHeaders } = require('../../lib/response');
const { logAuditEvent } = require('../../lib/audit-logger');
const { getDb } = require('../../lib/db');  // used once at handler start

/**
 * Handler function for preview endpoint
 */
async function handler(req, res) {
  setCorsHeaders(res, req);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const database = await getDb();

    // Resolve the selection into permission-safe PeSKAS requests (lib/download.js): one per
    // permitted form for trips, one per country for monthly figures, merged below.
    const download = await resolveDownload(req.user, req.query);
    const { data, total_count } = await fetchPreview(download);

    // Distinct scope actually served (for display)
    const { countries, surveyIds, districts } = servedScope(download);
    const { sharedFilters } = download;

    await logAuditEvent(database, {
      username: req.user.username,
      user_id: req.user.id,
      category: 'download',
      action: 'data_preview',
      status: 'success',
      details: downloadAuditDetails(download),
      req
    });

    // Display-only summary of what was actually served (permission-limited). The download
    // endpoint re-derives its own scope from req.user + the same query, so this is not
    // fed back as export input.
    const filters_applied = {
      dataset: download.dataset,
      status: sharedFilters.status,
      scope: sharedFilters.scope || '',
      ...(sharedFilters.catch_taxon ? { catch_taxon: sharedFilters.catch_taxon } : {}),
      ...(countries.length ? { country: countries.join(', ') } : {}),
      ...(surveyIds.length ? { survey_id: surveyIds } : {}),
      ...(districts.length ? { gaul_2: districts.join(', ') } : {}),
    };

    return sendSuccess(res, {
      data,
      total_count,
      filters_applied
    });

  } catch (error) {
    console.error('Preview error:', error);
    return sendDownloadError(res, error, 'Failed to fetch preview data. Please try again later.');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

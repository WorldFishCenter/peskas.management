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
 * @queryparam {string} catch_taxon - FAO ASFIS species code (3 letters, e.g., "SKJ", "YFT")
 * @queryparam {string} scope - Data scope: "trip_info" or "catch_info" (optional)
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
const { fetchLandingsPreviewMerged, PeskasAPIError } = require('../../lib/peskas-api');
const { resolveDownloadRequests, DownloadPermissionError } = require('../../lib/filter-permissions');
const {
  sendSuccess,
  sendError,
  sendServerError,
  setCorsHeaders
} = require('../../lib/response');
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

    // Resolve the selection into permission-safe PeSKAS requests. Each request is pinned
    // to a survey the user may access, with the country derived per-survey. A user with
    // several forms/districts fans out to multiple requests that are merged below.
    const requests = await resolveDownloadRequests(req.user, req.query);

    const {
      status = 'validated',
      catch_taxon,
      scope
    } = req.query;

    // Filters applied to every request (single-valued, shared across the fan-out)
    const sharedFilters = { status: status || 'validated' };
    if (scope && scope.trim()) {
      sharedFilters.scope = scope.trim();
    }
    if (catch_taxon && catch_taxon.trim()) {
      // Upper-cased here, not at the API boundary: this is the value the audit log and the
      // "filters applied" echo also read, and PeSKAS matches the code case-sensitively.
      sharedFilters.catch_taxon = catch_taxon.trim().toUpperCase();
    }

    // PeSKAS API requires lowercase country codes
    const normalizedRequests = requests.map(r => ({ ...r, country: r.country.toLowerCase() }));

    const { data, total_count } = await fetchLandingsPreviewMerged(normalizedRequests, sharedFilters, 20);

    // Distinct scope actually served (for display + audit)
    const countries = [...new Set(normalizedRequests.map(r => r.country))];
    const surveyIds = [...new Set(normalizedRequests.map(r => r.survey_id).filter(Boolean))];
    const districts = [...new Set(normalizedRequests.map(r => r.gaul_2).filter(Boolean))];

    await logAuditEvent(database, {
      username: req.user.username,
      user_id: req.user.id,
      category: 'download',
      action: 'data_preview',
      status: 'success',
      details: {
        country_id: countries.join(',') || null,
        survey_asset_id: surveyIds.join(',') || null,
        data_status: sharedFilters.status || null,
        scope: sharedFilters.scope || null,
        catch_taxon: sharedFilters.catch_taxon || null,
        district: districts.join(',') || null,
        request_count: normalizedRequests.length,
      },
      req
    });

    // Display-only summary of what was actually served (permission-limited). The download
    // endpoint re-derives its own scope from req.user + the same query, so this is not
    // fed back as export input.
    const filters_applied = {
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

    // Permission/selection errors → clear 400/403 for the client
    if (error instanceof DownloadPermissionError) {
      return sendError(res, error.message, error.statusCode);
    }

    // Handle PeSKAS API errors with user-friendly messages
    if (error instanceof PeskasAPIError) {
      return sendServerError(res, error.message);
    }

    // Generic error
    return sendServerError(res, 'Failed to fetch preview data. Please try again later.');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

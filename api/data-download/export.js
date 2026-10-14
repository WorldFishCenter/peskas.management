/**
 * GET /api/data-download/export
 *
 * Export full dataset as CSV from PeSKAS API with permission-based filtering.
 * Returns a downloadable CSV file (max 1,000,000 rows).
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
 * - All users share the same PESKAS_API_KEY (no per-user rate limiting)
 *
 * Security:
 * - CSV is sanitized to prevent formula injection attacks
 * - Permission filtering enforced server-side
 * - Rate limiting: 1 second delay between PeSKAS API requests
 *
 * Response Format:
 * Content-Type: text/csv; charset=utf-8
 * Content-Disposition: attachment; filename="peskas-{dataset}-{country}-{date}.csv"
 *
 * @module api/data-download/export
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const {
  resolveDownload,
  fetchDownloadCSV,
  servedScope,
  downloadAuditDetails,
  sendDownloadError
} = require('../../lib/download');
const { sanitizeCSV } = require('../../lib/helpers');
const { setCorsHeaders } = require('../../lib/response');
const { logAuditEvent } = require('../../lib/audit-logger');
const { getDb } = require('../../lib/db');

/**
 * Handler function for export endpoint
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
    // permitted form for trips, one per country for monthly figures, merged into one CSV.
    const download = await resolveDownload(req.user, req.query);
    const sanitizedCSV = sanitizeCSV(await fetchDownloadCSV(download));

    // Distinct scope actually served (for filename)
    const { countries } = servedScope(download);

    const timestamp = new Date().toISOString().split('T')[0];
    const countryLabel = countries.length === 1 ? countries[0] : 'multi-country';
    const filename = `peskas-${download.dataset}-${countryLabel}-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await logAuditEvent(database, {
      username: req.user.username,
      user_id: req.user.id,
      category: 'download',
      action: 'data_export',
      status: 'success',
      details: downloadAuditDetails(download),
      req
    });

    return res.send(sanitizedCSV);

  } catch (error) {
    console.error('Export error:', error);
    return sendDownloadError(res, error, 'Failed to export data. Please try again later.');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

/**
 * GET /api/data-download/explorer-data
 *
 * Returns a CAPPED, permission-filtered slice of the PeSKAS landings data as JSON
 * (a bare array of row objects), for the in-browser R lessons in the Data Academy tab.
 *
 * This is the Data Academy counterpart to /api/data-download/export. It reuses the
 * exact same permission gate (resolveDownloadRequests + the per-form fan-out), so a lesson
 * can only ever see the data the same user could download. Differences from export:
 *   - JSON, not CSV — the lesson's {ojs} cell hands the array to a {webr} cell via
 *     quarto-live's `input` option, where quarto-live converts the array of row objects
 *     directly into an R data.frame (types preserved, no brittle read.csv parsing).
 *   - Row count is capped at LESSON_ROW_CAP so it loads comfortably into the webR runtime.
 *
 * @access Protected - Requires JWT authentication (Bearer token)
 * @permission Filtered by user's country/survey/GAUL code permissions
 *
 * Query Parameters (all optional, snake_case - same semantics as preview.js/export.js):
 *   country, status, gaul_2, catch_taxon, scope. For admins `country` is optional and
 *   defaults to their first accessible survey's country so lessons work without a picker.
 *
 * Response: application/json — a bare array of landing-record objects.
 *   Header `X-Row-Cap` carries LESSON_ROW_CAP so the lesson can report the cap without duplicating it.
 *
 * @module api/data-download/explorer-data
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const { fetchLandingsPreviewMerged, PeskasAPIError } = require('../../lib/peskas-api');
const {
  resolveDownloadRequests,
  getAccessibleSurveys,
  DownloadPermissionError
} = require('../../lib/filter-permissions');
const {
  sendError,
  sendServerError,
  setCorsHeaders
} = require('../../lib/response');
const { logAuditEvent } = require('../../lib/audit-logger');
const { getDb } = require('../../lib/db');

// Cap rows so the dataset loads quickly into the in-browser webR runtime.
// Lessons teach techniques on a representative slice, not the full ~1M-row export.
const LESSON_ROW_CAP = 5000;

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

    // Admins must normally specify a country (resolveDownloadRequests throws without one). For the
    // Data Academy we default it to their first accessible survey's country so a
    // lesson can load data without a country picker. Regular users are always scoped
    // to user.country[0] regardless of this value.
    const queryParams = { ...req.query };
    if (req.user.role === 'admin' && !queryParams.country) {
      const surveys = await getAccessibleSurveys(req.user);
      if (surveys.length > 0) {
        queryParams.country = surveys[0].country_id;
      }
    }

    // Each request is pinned to one permitted form, with its country taken from the form
    // itself — the same gate preview.js and export.js use, so a lesson can never see data
    // the user could not download.
    const requests = await resolveDownloadRequests(req.user, queryParams);

    const {
      status = 'validated',
      catch_taxon,
      scope
    } = queryParams;

    // Filters applied to every request in the fan-out
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

    // PeSKAS accepts one (country, survey_id, gaul_2) triple per call, so a user with
    // several forms is served by one call each, merged and capped.
    const { data: rows } = await fetchLandingsPreviewMerged(
      normalizedRequests,
      sharedFilters,
      LESSON_ROW_CAP
    );

    const countries = [...new Set(normalizedRequests.map(r => r.country))];
    const surveyIds = [...new Set(normalizedRequests.map(r => r.survey_id).filter(Boolean))];
    const districts = [...new Set(normalizedRequests.map(r => r.gaul_2).filter(Boolean))];

    res.setHeader('Cache-Control', 'no-store');

    // The lesson panel tells the learner how many records it loaded, so it has to read the cap from
    // here rather than repeat the number — otherwise changing LESSON_ROW_CAP silently makes the lesson
    // lie. A header keeps the body a bare array, which is the shape quarto-live's `input` option
    // converts straight into an R data.frame. Readable cross-origin because setCorsHeaders lists this
    // header in EXPOSED_HEADERS (lessons run on :3000 against the API on :3001 in development).
    res.setHeader('X-Row-Cap', String(LESSON_ROW_CAP));

    await logAuditEvent(database, {
      username: req.user.username,
      user_id: req.user.id,
      category: 'download',
      action: 'data_explorer_load',
      status: 'success',
      details: {
        country_id: countries.join(',') || null,
        survey_asset_id: surveyIds.join(',') || null,
        data_status: sharedFilters.status || null,
        scope: sharedFilters.scope || null,
        catch_taxon: sharedFilters.catch_taxon || null,
        district: districts.join(',') || null,
        request_count: normalizedRequests.length,
        row_cap: LESSON_ROW_CAP,
        row_count: rows.length
      },
      req
    });

    return res.json(rows);

  } catch (error) {
    console.error('Data explorer load error:', error);

    // Permission/selection problems are the user's situation, not a server fault. A 500 here
    // makes the lesson panel say "connection problem", which sends the learner looking for a
    // fault that does not exist.
    if (error instanceof DownloadPermissionError) {
      return sendError(res, error.message, error.statusCode);
    }

    if (error instanceof PeskasAPIError) {
      return sendServerError(res, error.message);
    }

    return sendServerError(res, 'Failed to load explorer data. Please try again later.');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

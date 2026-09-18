/**
 * GET /api/data-download/metadata
 *
 * Unified endpoint returning all filter metadata in a single request:
 * - Countries (filtered by user permissions)
 * - Districts (filtered by user permissions and optional country)
 * - Surveys (filtered by user permissions and optional country)
 * - Taxa (FAO ASFIS species codes recorded in the countries the user can reach)
 *
 * This replaces 3 separate endpoints (/api/countries, /api/districts, /api/surveys)
 * for data download use case, reducing HTTP requests and frontend complexity.
 *
 * @access Protected - Requires JWT authentication
 * @permission Filtered by user's country/survey/GAUL code permissions
 *
 * Query Parameters (all optional, snake_case format):
 * @queryparam {string} country_id - Filter districts and surveys by country code (case-insensitive)
 * @queryparam {string} survey_id - Filter districts by survey asset_id (cascade filtering)
 * @queryparam {string} taxa - '1' to include the species list. Omitted by default because it is
 *                             the largest part of the payload and only changes with country.
 *
 * Response Format:
 * {
 *   countries: [{ code, name, active }],
 *   districts: [{ code, name, country_id, survey_label }],
 *   surveys: [{ asset_id, name, country_id, active }],
 *   taxa: [{ code, scientific_name, english_name, family }],   // only when ?taxa=1
 *   user_context: { role, country, has_survey_restrictions, has_gaul_restrictions }
 * }
 *
 * @module api/data-download/metadata
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const {
  getAccessibleCountries,
  getAccessibleDistricts,
  getAccessibleSurveys,
  getAccessibleTaxa
} = require('../../lib/filter-permissions');
const {
  sendSuccess,
  sendServerError,
  setCorsHeaders
} = require('../../lib/response');

/**
 * Handler function for metadata endpoint
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
    // 1. Extract optional filters
    // Note: req.user is populated by authenticateUser middleware with full user data
    const { country_id, survey_id } = req.query;

    // 2. Fetch all metadata in parallel using shared utilities.
    //    Taxa chain off the countries promise rather than re-resolving the user's countries
    //    from their surveys, so the two can't drift apart — but only taxa waits on it, so a
    //    request that doesn't ask for the species list keeps full concurrency.
    const countriesPromise = getAccessibleCountries(req.user);

    const [countries, districts, surveys, taxa] = await Promise.all([
      countriesPromise,
      getAccessibleDistricts(req.user, country_id, survey_id), // Pass survey_id for cascade filtering
      getAccessibleSurveys(req.user, country_id),
      // Species list only on request. It changes with country and nothing else, so the client
      // holds it and re-asks only when the country does — same contract as `?meta=1` on
      // api/kobo/submissions.js: *absent* when not asked for, never an empty array, so the
      // client can tell "no taxa for this country" from "didn't ask".
      req.query.taxa === '1'
        ? countriesPromise.then(c => getAccessibleTaxa(c, country_id))
        : null
    ]);

    // 3. Format response
    return sendSuccess(res, {
      countries: countries.map(c => ({
        code: c.code,
        name: c.name,
        active: c.active
      })),
      districts: districts.map(d => ({
        code: d.code,
        name: d.name,
        country_id: d.country_id,
        survey_label: d.survey_label
      })),
      surveys: surveys.map(s => ({
        asset_id: s.asset_id,
        name: s.name,
        country_id: s.country_id,
        active: s.active
      })),
      ...(taxa && {
        taxa: taxa.map(t => ({
          code: t.alpha3_code,
          scientific_name: t.scientific_name,
          english_name: t.english_name,
          family: t.family
        }))
      }),
      user_context: {
        role: req.user.role,
        country: req.user.country,
        has_survey_restrictions: req.user.permissions?.surveys && req.user.permissions.surveys.length > 0,
        has_gaul_restrictions: req.user.permissions?.gaul_codes && req.user.permissions.gaul_codes.length > 0
      }
    });

  } catch (error) {
    console.error('Metadata error:', error);
    return sendServerError(res, 'Failed to fetch filter metadata');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

/**
 * PeSKAS API Client for Data Downloads
 *
 * Handles API communication with the PeSKAS landings database at api.peskas.org
 * Includes rate limiting and error handling for production use. One call per function here;
 * lib/download.js resolves a user's download into calls and merges their results.
 *
 * @module lib/peskas-api
 */

// `.default`: axios's CJS build sets `module.exports.default = axios`, and it is the
// callable the type definitions describe. Plain `require('axios')` types as the module
// namespace, so `axios.get` is not visible to checkJs.
/** @type {import('axios').AxiosStatic} */
const axios = require('axios').default;

const PESKAS_API_BASE = 'https://api.peskas.org/api/v1';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

// The tables PeSKAS serves, by the name in their `/data/{dataset}` and `/metadata/{dataset}`
// paths: `landings` has one row per catch of each trip, `district-months` one row per district
// and month. District-months take `country` and `gaul_2` only (validated data, no form, scope
// or species), so callers send them no other filter.
const DATASETS = ['landings', 'district-months'];

const PREVIEW_ROWS = 20; // Rows a preview shows
const MAX_ROWS = 1000000; // The most PeSKAS returns in one request
let lastRequestTime = 0;

// PeSKAS API requires X-API-Key header for authentication
const PESKAS_API_KEY = process.env.PESKAS_API_KEY || process.env.API_SECRET_KEY;
if (!PESKAS_API_KEY) {
  console.error('WARNING: PESKAS_API_KEY not found in environment variables');
  console.error('Set PESKAS_API_KEY or API_SECRET_KEY in .env file');
}

/**
 * Custom error class for PeSKAS API errors
 */
class PeskasAPIError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'PeskasAPIError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Canonical form of a user-supplied species filter: upper-case FAO codes, comma-joined, blanks
 * dropped ("skj, yft," → "SKJ,YFT"). The endpoints call this on the way in — see validateFilters
 * for why it is not done at the API boundary.
 *
 * @param {unknown} value - Raw `catch_taxon` query value
 * @returns {string} Normalized list, or '' when nothing was asked for
 */
const normalizeTaxa = (value) =>
  String(value || '').toUpperCase().split(',').map(code => code.trim()).filter(Boolean).join(',');

/**
 * Validate API filter parameters before sending to external API.
 * Prevents injection attacks and ensures data integrity. A gate, not a normalizer: callers
 * hand it the values they will also audit and echo back, so it must not quietly change them.
 *
 * `catch_taxon` must already be upper-case, because PeSKAS matches it case-sensitively:
 * verified against api.peskas.org, `catch_taxon=MZZ` returns 2511 Zanzibar rows while
 * `catch_taxon=mzz` returns 0 rows with a 200 — a silent empty download. Upper-casing it here
 * instead would fix only the outbound request and leave the audit log and the "filters applied"
 * box showing a value that was never queried, so the endpoints normalize on the way in and a
 * lower-case code that reaches this point is a caller bug, reported as one.
 *
 * @param {object} filters - Filter parameters, already normalized by the caller
 */
function validateFilters(filters) {
  const errors = [];

  // Validate country (lowercase letters, hyphens, underscores only)
  if (filters.country && !/^[a-z_-]+$/i.test(filters.country)) {
    errors.push('Invalid country format');
  }

  // Validate status (only allowed values)
  if (filters.status && !['validated', 'raw'].includes(filters.status)) {
    errors.push('Invalid status value (must be "validated" or "raw")');
  }

  // Validate scope (only allowed values)
  if (filters.scope && !['trip_info', 'catch_info'].includes(filters.scope)) {
    errors.push('Invalid scope value (must be "trip_info" or "catch_info")');
  }

  // Validate catch_taxon (3-letter FAO ASFIS codes, comma-separated, upper-case — see above)
  if (filters.catch_taxon && !/^[A-Z]{3}(,[A-Z]{3})*$/.test(filters.catch_taxon)) {
    errors.push('Invalid catch_taxon format (must be 3-letter FAO codes, e.g., SKJ or SKJ,MZZ)');
  }

  // Validate survey_id (alphanumeric with underscores/hyphens)
  if (filters.survey_id && !/^[a-zA-Z0-9_-]+$/.test(filters.survey_id)) {
    errors.push('Invalid survey_id format');
  }

  // Validate gaul_2 (numeric codes, comma-separated: a user's district list)
  if (filters.gaul_2 && !/^\d+(,\d+)*$/.test(filters.gaul_2)) {
    errors.push('Invalid gaul_2 format (must be numeric codes, e.g., 12345 or 12345,12346)');
  }

  if (errors.length > 0) {
    throw new PeskasAPIError(
      `Validation failed: ${errors.join('; ')}`,
      'VALIDATION_ERROR',
      400
    );
  }
}

/**
 * Gate for the dataset name, which becomes part of the request path.
 *
 * @param {string} dataset - One of DATASETS
 */
function validateDataset(dataset) {
  if (!DATASETS.includes(dataset)) {
    throw new PeskasAPIError(
      `Validation failed: Invalid dataset (must be one of ${DATASETS.join(', ')})`,
      'VALIDATION_ERROR',
      400
    );
  }
}

/**
 * Rate-limited API request wrapper
 *
 * Ensures requests are spaced at least RATE_LIMIT_DELAY ms apart
 * to avoid overwhelming the PeSKAS API.
 *
 * @param {string} endpoint - API endpoint path (e.g., '/data/landings')
 * @param {object} params - Query parameters
 * @returns {Promise<any>} API response data
 * @throws {PeskasAPIError} On API errors
 */
async function makeRateLimitedRequest(endpoint, params) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  // Apply rate limiting
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  try {
    const response = await axios.get(`${PESKAS_API_BASE}${endpoint}`, {
      params,
      headers: {
        'X-API-Key': PESKAS_API_KEY
      },
      timeout: 60000, // 60 second timeout
      validateStatus: (status) => status < 500 // Don't reject on 4xx errors
    });

    // Handle authentication errors
    if (response.status === 401) {
      throw new PeskasAPIError(
        'Authentication failed. Please check your API key configuration.',
        'AUTHENTICATION_ERROR',
        401
      );
    }

    // Handle specific error status codes
    if (response.status === 429) {
      throw new PeskasAPIError(
        'Rate limit exceeded. Please try again in a few minutes.',
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    if (response.status === 404) {
      throw new PeskasAPIError(
        'No data found for the specified filters. Try adjusting your search criteria.',
        'NO_DATA_FOUND',
        404
      );
    }

    if (response.status === 400) {
      const errorDetail = response.data?.detail || response.data?.message || response.data?.error || 'Unknown error';

      throw new PeskasAPIError(
        `Invalid request parameters: ${errorDetail}`,
        'INVALID_PARAMETERS',
        400
      );
    }

    if (response.status >= 400) {
      throw new PeskasAPIError(
        `API request failed with status ${response.status}`,
        'API_ERROR',
        response.status
      );
    }

    return response.data;

  } catch (error) {
    // Re-throw PeskasAPIError instances
    if (error instanceof PeskasAPIError) {
      throw error;
    }

    // Handle network/timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new PeskasAPIError(
        'Request timed out. The dataset may be too large. Try narrowing your date range.',
        'TIMEOUT',
        504
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new PeskasAPIError(
        'Unable to connect to PeSKAS API. Please check your internet connection.',
        'CONNECTION_ERROR',
        503
      );
    }

    // Generic error
    throw new PeskasAPIError(
      'Failed to fetch data from PeSKAS API. Please try again later.',
      'API_ERROR',
      500
    );
  }
}

/**
 * Fetch rows of a dataset with filters
 *
 * Returns data in JSON format (for preview or processing)
 *
 * @param {string} dataset - Table to read, one of DATASETS
 * @param {object} filters - Filter parameters. District-months take `country` and `gaul_2` only.
 * @param {string} filters.country - Country identifier (e.g., 'zanzibar')
 * @param {string} [filters.survey_id] - Survey ID(s) - comma-separated (e.g., 'asset123,asset456')
 * @param {string} [filters.status='validated'] - Data status ('validated' or 'raw')
 * @param {string} [filters.date_from] - Start date (YYYY-MM-DD)
 * @param {string} [filters.date_to] - End date (YYYY-MM-DD)
 * @param {string} [filters.gaul_1] - GAUL level 1 code
 * @param {string} [filters.gaul_2] - GAUL level 2 code(s) - comma-separated (PeSKAS >= 1.8.0)
 * @param {string} [filters.catch_taxon] - FAO ASFIS species code(s) - comma-separated, as
 *        normalizeTaxa returns them (e.g., 'SKJ,YFT'); rows matching any of them are returned.
 * @param {string} [filters.scope='trip_info'] - Data scope ('trip_info' or 'catch_info')
 * @param {number} [limit=PREVIEW_ROWS] - Maximum number of rows to return
 * @returns {Promise<object>} API response with data array
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const data = await fetchRows('landings', {
 *   country: 'zanzibar',
 *   status: 'validated',
 *   date_from: '2024-01-01',
 *   date_to: '2024-12-31'
 * }, 20);
 */
async function fetchRows(dataset, filters, limit = PREVIEW_ROWS) {
  // Validate before sending to external API
  validateDataset(dataset);
  validateFilters(filters);

  const params = {
    format: 'json', // Always JSON for preview/processing
    limit: limit,
    ...filters
  };

  return makeRateLimitedRequest(`/data/${dataset}`, params);
}

/**
 * Fetch a dataset as CSV (for full dataset export)
 *
 * Returns raw CSV data as text string suitable for browser download.
 * Sets format=csv and limit to maximum (MAX_ROWS).
 *
 * @param {string} dataset - Table to read, one of DATASETS
 * @param {object} filters - Filter parameters (same as fetchRows)
 * @returns {Promise<string>} CSV data as text
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const csvData = await fetchCSV('landings', {
 *   country: 'zanzibar',
 *   status: 'validated'
 * });
 * // csvData is a CSV string ready for download
 */
async function fetchCSV(dataset, filters) {
  // Validate before sending to external API
  validateDataset(dataset);
  validateFilters(filters);

  const params = {
    format: 'csv',
    limit: MAX_ROWS,
    ...filters
  };

  return makeRateLimitedRequest(`/data/${dataset}`, params);
}

/**
 * Fetch the field metadata of a dataset
 *
 * Returns comprehensive field documentation including descriptions, data types,
 * units, examples, and categorical values. Used for enhancing UX with field
 * descriptions in the Data Download feature.
 *
 * @param {string} dataset - Table to describe, one of DATASETS
 * @param {string} [scope] - Optional scope filter ('trip_info' or 'catch_info'). Only landings
 *        have scopes, so it is ignored for any other dataset.
 * @returns {Promise<object>} Metadata object with field descriptions
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const metadata = await fetchFieldMetadata('landings', 'trip_info');
 * // Returns: { fields: { field_name: { description, type, unit, ... } } }
 */
async function fetchFieldMetadata(dataset, scope) {
  validateDataset(dataset);
  const params = {};

  // Validate scope if provided
  if (dataset === 'landings' && scope && scope.trim()) {
    if (!['trip_info', 'catch_info'].includes(scope.trim())) {
      throw new PeskasAPIError(
        'Invalid scope value (must be "trip_info" or "catch_info")',
        'VALIDATION_ERROR',
        400
      );
    }
    params.scope = scope.trim();
  }

  return makeRateLimitedRequest(`/metadata/${dataset}`, params);
}

module.exports = {
  PREVIEW_ROWS,
  MAX_ROWS,
  normalizeTaxa,
  validateFilters,
  validateDataset,
  fetchRows,
  fetchCSV,
  fetchFieldMetadata,
  PeskasAPIError
};

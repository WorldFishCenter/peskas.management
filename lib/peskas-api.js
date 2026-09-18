/**
 * PeSKAS API Client for Data Downloads
 *
 * Handles API communication with the PeSKAS landings database at api.peskas.org
 * Includes rate limiting and error handling for production use.
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

  // Validate catch_taxon (3-letter FAO ASFIS code, upper-case — see above)
  if (filters.catch_taxon && !/^[A-Z]{3}$/.test(filters.catch_taxon)) {
    errors.push('Invalid catch_taxon format (must be 3-letter FAO code, e.g., SKJ, MZZ)');
  }

  // Validate survey_id (alphanumeric with underscores/hyphens)
  if (filters.survey_id && !/^[a-zA-Z0-9_-]+$/.test(filters.survey_id)) {
    errors.push('Invalid survey_id format');
  }

  // Validate gaul_2 (numeric code)
  if (filters.gaul_2 && !/^\d+$/.test(filters.gaul_2)) {
    errors.push('Invalid gaul_2 format (must be numeric code)');
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
 * Fetch landings data with filters
 *
 * Returns data in JSON format (for preview or processing)
 *
 * @param {object} filters - Filter parameters
 * @param {string} filters.country - Country identifier (e.g., 'zanzibar')
 * @param {string} [filters.survey_id] - Survey ID(s) - comma-separated (e.g., 'asset123,asset456')
 * @param {string} [filters.status='validated'] - Data status ('validated' or 'raw')
 * @param {string} [filters.date_from] - Start date (YYYY-MM-DD)
 * @param {string} [filters.date_to] - End date (YYYY-MM-DD)
 * @param {string} [filters.gaul_1] - GAUL level 1 code
 * @param {string} [filters.gaul_2] - GAUL level 2 code(s) - comma-separated
 * @param {string} [filters.catch_taxon] - FAO ASFIS species code. Exactly one: PeSKAS matches
 *        this field exactly, so a comma-separated list returns zero rows with a 200.
 * @param {string} [filters.scope='trip_info'] - Data scope ('trip_info' or 'catch_info')
 * @param {number} [limit=20] - Maximum number of rows to return
 * @returns {Promise<object>} API response with data array
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const data = await fetchLandingsData({
 *   country: 'zanzibar',
 *   status: 'validated',
 *   date_from: '2024-01-01',
 *   date_to: '2024-12-31'
 * }, 20);
 */
async function fetchLandingsData(filters, limit = 20) {
  // Validate filters before sending to external API
  validateFilters(filters);

  const params = {
    format: 'json', // Always JSON for preview/processing
    limit: limit,
    ...filters
  };

  return makeRateLimitedRequest('/data/landings', params);
}

/**
 * Get CSV download stream (for full dataset export)
 *
 * Returns raw CSV data as text string suitable for browser download.
 * Sets format=csv and limit to maximum (1,000,000 rows).
 *
 * @param {object} filters - Filter parameters (same as fetchLandingsData)
 * @returns {Promise<string>} CSV data as text
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const csvData = await getLandingsCSVStream({
 *   country: 'zanzibar',
 *   status: 'validated'
 * });
 * // csvData is a CSV string ready for download
 */
async function getLandingsCSVStream(filters) {
  // Validate filters before sending to external API
  validateFilters(filters);

  const params = {
    format: 'csv',
    limit: 1000000, // Max limit
    ...filters
  };

  return makeRateLimitedRequest('/data/landings', params);
}

/**
 * Run an async request, treating a PeSKAS "no data" (404) as an empty result rather
 * than an error. Used when merging several scoped requests, so that one form/district
 * with no rows does not fail the whole download.
 *
 * @param {Function} requestFn - Zero-arg function returning a Promise
 * @returns {Promise<any|null>} The result, or null when the scope has no data
 */
async function tolerateNoData(requestFn) {
  try {
    return await requestFn();
  } catch (error) {
    if (error instanceof PeskasAPIError && error.statusCode === 404) {
      return null; // No data for this scope — treat as empty, not fatal
    }
    throw error;
  }
}

/**
 * Fetch landings preview data across multiple permission-scoped requests and merge.
 *
 * PeSKAS accepts a single (country, survey_id, gaul_2) triple per call, so a user with
 * several forms/districts is served by issuing one call per request and combining the
 * results. Requests are issued concurrently.
 *
 * @param {Array<object>} requests - Per-call filter sets (e.g. { country, survey_id, gaul_2 })
 * @param {object} sharedFilters - Filters applied to every request (status, scope, catch_taxon)
 * @param {number} [limit=20] - Maximum preview rows to return overall
 * @returns {Promise<{data: Array, total_count: number}>}
 * @throws {PeskasAPIError} On non-404 API errors
 */
async function fetchLandingsPreviewMerged(requests, sharedFilters, limit = 20) {
  const responses = await Promise.all(
    requests.map(request =>
      tolerateNoData(() => fetchLandingsData({ ...sharedFilters, ...request }, limit))
    )
  );

  let data = [];
  let totalCount = 0;

  for (const response of responses) {
    if (!response) continue; // null = no data for that scope
    if (Array.isArray(response)) {
      data = data.concat(response);
      totalCount += response.length;
    } else if (Array.isArray(response.data)) {
      data = data.concat(response.data);
      totalCount += response.count || response.total || response.data.length;
    }
  }

  return { data: data.slice(0, limit), total_count: totalCount };
}

/**
 * Merge multiple CSV strings that share the same header into one CSV.
 *
 * Keeps the header row from the first non-empty chunk and appends only the data rows of
 * the remaining chunks. Only the leading header line of each chunk is stripped, so quoted
 * fields containing embedded newlines in data rows are preserved verbatim.
 *
 * @param {Array<string|null>} chunks - CSV payloads (null/empty entries are skipped)
 * @returns {string} Merged CSV text (empty string if every chunk was empty)
 */
function mergeCSVChunks(chunks) {
  let header = null;
  const bodies = [];

  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'string') continue;

    const text = chunk.replace(/^\uFEFF/, ''); // strip UTF-8 BOM if present
    const newlineIndex = text.indexOf('\n');

    if (newlineIndex === -1) {
      // Single line = header only, no data rows
      if (header === null && text.trim() !== '') header = text.trim();
      continue;
    }

    const chunkHeader = text.slice(0, newlineIndex).replace(/\r$/, '');
    const chunkBody = text.slice(newlineIndex + 1).replace(/\s+$/, '');

    if (header === null && chunkHeader.trim() !== '') header = chunkHeader;
    if (chunkBody !== '') bodies.push(chunkBody);
  }

  if (header === null) return '';
  if (bodies.length === 0) return `${header}\n`;
  return `${header}\n${bodies.join('\n')}\n`;
}

/**
 * Fetch full CSV exports across multiple permission-scoped requests and merge into a
 * single CSV (header retained once). Requests are issued concurrently.
 *
 * @param {Array<object>} requests - Per-call filter sets (e.g. { country, survey_id, gaul_2 })
 * @param {object} sharedFilters - Filters applied to every request (status, scope, catch_taxon)
 * @returns {Promise<string>} Merged CSV text
 * @throws {PeskasAPIError} On non-404 API errors, or NO_DATA_FOUND if every scope was empty
 */
async function getLandingsCSVMerged(requests, sharedFilters) {
  const chunks = await Promise.all(
    requests.map(request =>
      tolerateNoData(() => getLandingsCSVStream({ ...sharedFilters, ...request }))
    )
  );

  const merged = mergeCSVChunks(chunks);

  if (merged === '') {
    throw new PeskasAPIError(
      'No data found for the specified filters. Try adjusting your search criteria.',
      'NO_DATA_FOUND',
      404
    );
  }

  return merged;
}

/**
 * Fetch metadata for landings dataset
 *
 * Returns comprehensive field documentation including descriptions, data types,
 * units, examples, and categorical values. Used for enhancing UX with field
 * descriptions in the Data Download feature.
 *
 * @param {string} [scope] - Optional scope filter ('trip_info' or 'catch_info')
 * @returns {Promise<object>} Metadata object with field descriptions
 * @throws {PeskasAPIError} On API errors
 *
 * @example
 * const metadata = await fetchLandingsMetadata('trip_info');
 * // Returns: { fields: { field_name: { description, type, unit, ... } } }
 */
async function fetchLandingsMetadata(scope) {
  const params = {};

  // Validate scope if provided
  if (scope && scope.trim()) {
    if (!['trip_info', 'catch_info'].includes(scope.trim())) {
      throw new PeskasAPIError(
        'Invalid scope value (must be "trip_info" or "catch_info")',
        'VALIDATION_ERROR',
        400
      );
    }
    params.scope = scope.trim();
  }

  return makeRateLimitedRequest('/metadata/landings', params);
}

module.exports = {
  fetchLandingsData,
  getLandingsCSVStream,
  fetchLandingsPreviewMerged,
  getLandingsCSVMerged,
  mergeCSVChunks,
  fetchLandingsMetadata,
  PeskasAPIError
};

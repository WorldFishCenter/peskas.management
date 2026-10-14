/**
 * One download, from query string to merged PeSKAS result.
 *
 * Shared by the Data Download preview and export and by the Data Academy, so the three cannot
 * drift apart. A download reads one dataset: `landings` (trips, the default) or
 * `district-months` (monthly figures per district). It is resolved once into a `download`
 * object, `{ dataset, requests, sharedFilters }`, which every function below takes whole: the
 * requests resolved for one dataset can then never be sent to the other.
 *
 * @module lib/download
 */

const {
  PREVIEW_ROWS,
  MAX_ROWS,
  normalizeTaxa,
  validateDataset,
  fetchRows,
  fetchCSV,
  PeskasAPIError
} = require('./peskas-api');
const { resolveDownloadRequests, DownloadPermissionError } = require('./filter-permissions');
const { sendError, sendBadRequest, sendServerError } = require('./response');

/**
 * The dataset a request asks for. None, or an empty value, means trips.
 *
 * @param {object} query - Request query parameters
 * @returns {string} Dataset name, not yet validated
 */
const datasetOf = (query) => query.dataset || 'landings';

/**
 * Resolve a download of monthly district figures into requests: one per country.
 *
 * These rows add up every form of a country, so there is no `survey_id` to pin. A user may read
 * a country's figures when at least one of their permitted forms is in it: the same countries
 * `resolveDownloadRequests` serves them trips from. The district stays a user-chosen filter,
 * checked there against the user's permitted districts.
 *
 * Kept private on purpose: sent to the landings endpoint, a request with no `survey_id` returns
 * every form of the country.
 *
 * @param {object} user - Authenticated user (req.user)
 * @param {object} query - Request query parameters (country, gaul_2)
 * @returns {Promise<Array<{country: string, survey_id?: string, gaul_2?: string}>>}
 * @throws {DownloadPermissionError} As resolveDownloadRequests
 */
async function resolveDistrictMonthRequests(user, query) {
  // The MAX_DOWNLOAD_REQUESTS cap counts forms before they collapse to countries. No user has
  // that many forms; resolve countries directly if one ever does.
  const requests = await resolveDownloadRequests(user, { ...query, survey_id: undefined });
  const byCountry = new Map(requests.map(({ country, gaul_2 }) => [country, gaul_2 ? { country, gaul_2 } : { country }]));
  return [...byCountry.values()];
}

/**
 * Resolve a user's download selection into the PeSKAS requests that serve it.
 *
 * Trips are pinned to the user's permitted forms (resolveDownloadRequests) and take status,
 * scope and species filters. Monthly figures are validated data with no form, scope or
 * species: one request per country, with no shared filters.
 *
 * @param {object} user - Authenticated user (req.user)
 * @param {object} query - Request query parameters
 * @returns {Promise<{dataset: string, requests: Array<object>, sharedFilters: object}>}
 * @throws {PeskasAPIError} On an unknown dataset (VALIDATION_ERROR)
 * @throws {DownloadPermissionError} When the selection is empty, unauthorized or too broad
 */
async function resolveDownload(user, query) {
  const dataset = datasetOf(query);
  validateDataset(dataset);

  const monthly = dataset === 'district-months';
  const requests = monthly
    ? await resolveDistrictMonthRequests(user, query)
    : await resolveDownloadRequests(user, query);

  // Filters applied to every request (single-valued, shared across the fan-out)
  const sharedFilters = {};
  if (!monthly) {
    const { status, scope, catch_taxon } = query;
    sharedFilters.status = status || 'validated';
    if (scope && scope.trim()) {
      sharedFilters.scope = scope.trim();
    }
    const taxa = normalizeTaxa(catch_taxon);
    if (taxa) {
      // Normalized here, not at the API boundary: this is the value the audit log and the
      // "filters applied" echo also read, and PeSKAS matches the code case-sensitively.
      sharedFilters.catch_taxon = taxa;
    }
  }

  return {
    dataset,
    // PeSKAS API requires lowercase country codes
    requests: requests.map(r => ({ ...r, country: r.country.toLowerCase() })),
    sharedFilters
  };
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
 * Fetch the rows of a download across its requests and merge them.
 *
 * One PeSKAS call per request (per form for trips, per country for monthly figures), issued
 * concurrently and combined.
 *
 * @param {{dataset: string, requests: Array<object>, sharedFilters: object}} download
 * @param {number} limit - Maximum rows to return overall
 * @returns {Promise<{data: Array, total_count: number}>}
 * @throws {PeskasAPIError} On non-404 API errors
 */
async function fetchDownloadRows({ dataset, requests, sharedFilters }, limit) {
  const responses = await Promise.all(
    requests.map(request =>
      tolerateNoData(() => fetchRows(dataset, { ...sharedFilters, ...request }, limit))
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
 * Fetch the preview of a download: its first PREVIEW_ROWS rows and a row count.
 *
 * PeSKAS does not say how many rows a filter matches, so a trip preview reads PREVIEW_ROWS rows
 * and can only count those. A monthly table is small (a few hundred to a few thousand rows), so
 * it is read whole: the preview then states how many rows the download will have.
 *
 * @param {{dataset: string, requests: Array<object>, sharedFilters: object}} download
 * @returns {Promise<{data: Array, total_count: number}>}
 */
async function fetchPreview(download) {
  const wholeTable = download.dataset === 'district-months';
  const { data, total_count } = await fetchDownloadRows(download, wholeTable ? MAX_ROWS : PREVIEW_ROWS);
  return { data: data.slice(0, PREVIEW_ROWS), total_count };
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
 * Fetch a whole download as one CSV (header retained once). Requests are issued concurrently.
 *
 * @param {{dataset: string, requests: Array<object>, sharedFilters: object}} download
 * @returns {Promise<string>} Merged CSV text
 * @throws {PeskasAPIError} On non-404 API errors, or NO_DATA_FOUND if every scope was empty
 */
async function fetchDownloadCSV({ dataset, requests, sharedFilters }) {
  const chunks = await Promise.all(
    requests.map(request =>
      tolerateNoData(() => fetchCSV(dataset, { ...sharedFilters, ...request }))
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
 * The distinct countries, forms and districts a download was served from (for display,
 * file names and the audit log).
 *
 * @param {{requests: Array<object>}} download
 * @returns {{countries: string[], surveyIds: string[], districts: string[]}}
 */
function servedScope({ requests }) {
  return {
    countries: [...new Set(requests.map(r => r.country))],
    surveyIds: [...new Set(requests.map(r => r.survey_id).filter(Boolean))],
    districts: [...new Set(requests.map(r => r.gaul_2).filter(Boolean))]
  };
}

/**
 * The `details` of a download's audit event, as the admin Audit Log renders them.
 *
 * @param {{dataset: string, requests: Array<object>, sharedFilters: object}} download
 * @returns {object}
 */
function downloadAuditDetails(download) {
  const { countries, surveyIds, districts } = servedScope(download);
  const { sharedFilters } = download;
  return {
    dataset: download.dataset,
    country_id: countries.join(',') || null,
    survey_asset_id: surveyIds.join(',') || null,
    data_status: sharedFilters.status || null,
    scope: sharedFilters.scope || null,
    catch_taxon: sharedFilters.catch_taxon || null,
    district: districts.join(',') || null,
    request_count: download.requests.length,
  };
}

/**
 * Send the error of a failed download request.
 *
 * A selection the user may not make, and a request the PeSKAS gate refuses (an unknown dataset,
 * a malformed filter), are the client's to fix: they go out as a 4xx with their message. Any
 * other failure is a 500.
 *
 * @param {object} res - Response object
 * @param {Error} error - What was thrown
 * @param {string} fallback - Message logged for an unexpected error
 */
function sendDownloadError(res, error, fallback) {
  if (error instanceof DownloadPermissionError) {
    return sendError(res, error.message, error.statusCode);
  }
  if (error instanceof PeskasAPIError && error.code === 'VALIDATION_ERROR') {
    return sendBadRequest(res, error.message);
  }
  return sendServerError(res, error instanceof PeskasAPIError ? error.message : fallback);
}

module.exports = {
  datasetOf,
  resolveDownload,
  fetchDownloadRows,
  fetchPreview,
  fetchDownloadCSV,
  servedScope,
  downloadAuditDetails,
  sendDownloadError
};

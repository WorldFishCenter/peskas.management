/**
 * Permission Filtering Utilities
 *
 * Centralized logic for filtering entities (surveys, districts, countries)
 * based on user permissions. Used across multiple endpoints to ensure
 * consistent permission enforcement.
 *
 * @module lib/filter-permissions
 */

const { getDb } = require('./db');
const { toCanonicalCountry } = require('./country-codes');

/**
 * Normalize a country value into the canonical lowercase slug (`zanzibar`, `kenya`, …).
 *
 * Casing is not consistent between collections (values observed in the production database):
 *   - `surveys.country_id`  — "Kenya", "Mozambique", "Timor", "Zanzibar" (capitalized; synced
 *     verbatim from Airtable's "Associated Countries", which can also yield a 1-element array)
 *   - `countries.code`      — "Kenya", "Mozambique", "Zanzibar" (capitalized)
 *   - `districts.country_id` — "kenya", "mozambique", "zanzibar" (lowercase)
 *   - the PeSKAS download API and the frontend's COUNTRY_METADATA — lowercase
 *
 * Because two of these disagree, every cross-collection country comparison normalizes *both*
 * sides through this function rather than assuming either casing.
 *
 * @param {string|Array<string>} countryId
 * @returns {string} Lowercase country code, or '' if it cannot be resolved
 */
function normalizeCountryCode(countryId) {
  return toCanonicalCountry(countryId);
}

/**
 * Error raised when a download selection is empty, unauthorized, or too broad.
 * Carries an HTTP status so endpoints can return a clear client-facing message
 * (400/403) instead of a generic 500.
 */
class DownloadPermissionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DownloadPermissionError';
    this.statusCode = statusCode;
  }
}

/**
 * Get accessible surveys for a user based on permissions
 *
 * @param {Object} user - User object from MongoDB
 * @param {String} countryId - Optional country filter
 * @returns {Promise<Array>} Array of accessible survey objects
 */
async function getAccessibleSurveys(user, countryId = null) {
  const database = await getDb();

  let query = { active: true };

  // Apply permission filtering
  if (user.role === 'admin') {
    // Admin with empty permissions.surveys = full access
    if (!user.permissions?.surveys || user.permissions.surveys.length === 0) {
      // No additional filtering - get all active surveys
    } else {
      // Admin with specific survey assignments
      query.asset_id = { $in: user.permissions.surveys };
    }
  } else {
    // Regular users - only their assigned surveys
    query.asset_id = { $in: user.permissions?.surveys || [] };
  }

  const surveys = await database.collection('surveys')
    .find(query)
    .sort({ country_id: 1, name: 1 })
    .toArray();

  // The country filter is applied here rather than in the query: `country_id` is stored
  // capitalized and sometimes wrapped in an array, which no single MongoDB predicate matches
  // reliably. The collection holds a handful of surveys, so filtering in memory is cheap and
  // removes the need to interpolate user input into a RegExp.
  if (countryId) {
    const wanted = normalizeCountryCode(countryId);
    return surveys.filter(s => normalizeCountryCode(s.country_id) === wanted);
  }

  return surveys;
}

/**
 * Get accessible countries for a user based on survey permissions
 *
 * @param {Object} user - User object from MongoDB
 * @returns {Promise<Array>} Array of accessible country objects
 */
async function getAccessibleCountries(user) {
  const database = await getDb();

  if (user.role === 'admin' && (!user.permissions?.surveys || user.permissions.surveys.length === 0)) {
    // Admin with full access - all active countries
    const countries = await database.collection('countries')
      .find({ active: true })
      .sort({ name: 1 })
      .toArray();

    return countries;
  } else {
    // Regular user or admin with specific permissions - countries via surveys.
    // Matched on normalized codes and filtered in memory: `countries.code` is capitalized and
    // `districts.country_id` is not, so a `$in` against either raw form is casing-dependent.
    const accessibleSurveys = await getAccessibleSurveys(user);
    const countryCodes = new Set(
      accessibleSurveys.map(s => normalizeCountryCode(s.country_id)).filter(Boolean)
    );

    const countries = await database.collection('countries')
      .find({ active: true })
      .sort({ name: 1 })
      .toArray();

    const matched = countries.filter(c => countryCodes.has(normalizeCountryCode(c.code)));

    // A survey whose country has no active `countries` row silently vanishes from the user's
    // country list, which looks to them like missing data rather than missing configuration.
    // Onboarding a new country is exactly when this bites — e.g. Timor surveys exist while no
    // Timor country row does. Log it so it is diagnosable instead of invisible.
    const resolved = new Set(matched.map(c => normalizeCountryCode(c.code)));
    const unresolved = [...countryCodes].filter(code => !resolved.has(code));
    if (unresolved.length > 0) {
      console.warn(
        `[PERMISSIONS] User '${user.username}' has surveys in countries with no active ` +
        `'countries' row: ${unresolved.join(', ')}. Those countries will not appear in the UI.`
      );
    }

    return matched;
  }
}

/**
 * Get accessible districts for a user based on GAUL code permissions
 *
 * @param {Object} user - User object from MongoDB
 * @param {String} countryId - Optional country filter
 * @param {String} surveyId - Optional survey filter (asset_id)
 * @returns {Promise<Array>} Array of accessible district objects
 */
async function getAccessibleDistricts(user, countryId = null, surveyId = null) {
  const database = await getDb();

  let query = { active: true };

  // `districts.country_id` is already stored as the canonical lowercase slug, so this is an
  // exact match rather than an interpolated RegExp.
  if (countryId) {
    query.country_id = normalizeCountryCode(countryId);
  }

  // Apply survey filter if provided (CASCADE: Survey → Districts)
  // District can belong to multiple surveys, so check if surveyId is in asset_ids array
  if (surveyId) {
    query.asset_ids = surveyId;
  }

  // Apply GAUL code permission filtering
  if (user.role === 'admin') {
    // Admin users - all districts (no GAUL code restrictions)
  } else {
    // Regular users - filter by their assigned GAUL codes
    const allowedGaulCodes = user.permissions?.gaul_codes || [];

    if (allowedGaulCodes.length > 0) {
      query.code = { $in: allowedGaulCodes };
    }
    // If no GAUL code restrictions (empty array), show all districts
  }

  const districts = await database.collection('districts')
    .find(query)
    .sort({ code: 1 })
    .toArray();

  return districts;
}

/**
 * Get the FAO ASFIS taxa a user may filter by, scoped to the countries they can reach.
 *
 * Reference data for the download "Species Filter", which takes a 3-letter code nobody
 * remembers. Scoped by country rather than by survey because ~60 of the Airtable rows carry
 * no form link — a survey-level scope would silently drop those species. Kenya has 644 codes,
 * Mozambique 562, Zanzibar 164, Timor 56; the unscoped list is 947.
 *
 * Takes the countries `getAccessibleCountries()` already resolved rather than re-deriving them
 * from the user's surveys. Keeping that derivation in one place is the point: the two copies
 * had already disagreed, because `getAccessibleCountries` drops a country with no active
 * `countries` row (and warns about it), so re-deriving here offered species for a country the
 * selector above could not even pick.
 *
 * @param {Array} countries - Country documents the user may reach, from getAccessibleCountries
 * @param {String} countryId - Optional narrowing. Intersected with `countries`, so a
 *                             client-supplied value can only narrow, never widen.
 * @returns {Promise<Array>} Array of taxon documents, sorted by code
 */
async function getAccessibleTaxa(countries, countryId = null) {
  const database = await getDb();

  // normalizeCountryCode returns '' for a null/absent id, so no country filter means no narrowing.
  const wanted = normalizeCountryCode(countryId);
  const scope = countries
    .map(c => normalizeCountryCode(c.code))
    .filter(code => code && (!wanted || code === wanted));

  if (scope.length === 0) {
    // Same reasoning as the warning in getAccessibleCountries: an empty species picker reads
    // to the user as missing data rather than as a country with no taxa configured.
    console.warn(
      `[PERMISSIONS] No countries in scope for the species filter ` +
      `(country_id=${countryId || 'none'}); it will render empty.`
    );
    return [];
  }

  // Project to the four fields the picker renders. `order` is stored but never sent, and
  // fetching whole documents for ~950 codes to throw most of each away is pure transfer.
  return database.collection('taxa')
    .find({ active: true, country_ids: { $in: scope } })
    .project({ _id: 0, alpha3_code: 1, scientific_name: 1, english_name: 1, family: 1 })
    .sort({ alpha3_code: 1 })
    .toArray();
}

/**
 * Maximum number of individual PeSKAS API calls a single download may fan out to.
 *
 * PeSKAS accepts one (country, survey_id, gaul_2) triple per request, so a user with
 * several forms is served by merging one call per form. This cap protects the serverless
 * time/memory budget; beyond it, the user is asked to narrow their selection instead of
 * the request being silently truncated.
 */
const MAX_DOWNLOAD_REQUESTS = 15;

/**
 * Resolve a user's download selection into concrete, permission-safe PeSKAS request
 * filter sets.
 *
 * Every returned request is pinned to a specific `survey_id` the user is authorized for
 * (the only exception being full-access admins who may request an entire country), and
 * the `country` is derived per-survey from the `surveys` collection rather than from
 * `user.country[0]`. This guarantees a download can never return data from a form the
 * user cannot access, and that survey selection actually scopes the data.
 *
 * The PeSKAS `survey_id` equals the KoboToolbox `asset_id`, so it can be sent directly.
 *
 * @param {Object} user - Authenticated user (req.user), incl. role, country, permissions
 * @param {Object} queryParams - Request query parameters (country, survey_id, gaul_2)
 * @returns {Promise<Array<{country: string, survey_id?: string, gaul_2?: string}>>}
 *          One filter set per PeSKAS call required to satisfy the (permission-limited) selection.
 * @throws {Error} If the selection is empty, unauthorized, or too broad to serve in one download
 */
async function resolveDownloadRequests(user, queryParams) {
  const { country, survey_id, gaul_2 } = queryParams;

  const requestedSurveyIds = survey_id
    ? survey_id.split(',').map(id => id.trim()).filter(Boolean)
    : [];
  const requestedGaul = gaul_2 && gaul_2.trim() ? gaul_2.trim() : null;

  // ---- Admin: explicit country, optional single survey/district, full access ----
  if (user.role === 'admin') {
    if (!country) {
      throw new DownloadPermissionError('Country parameter is required for admin users', 400);
    }

    // Normalized for the same reason the per-survey path is: PeSKAS expects the lowercase
    // slug, and an admin passing "Zanzibar" would otherwise reach the API capitalized.
    const request = { country: normalizeCountryCode(country) };
    if (!request.country) {
      throw new DownloadPermissionError('Country parameter is required for admin users', 400);
    }

    if (requestedSurveyIds.length > 0) {
      // Validate the requested survey is accessible to this admin (empty perms = all)
      const accessibleSurveys = await getAccessibleSurveys(user, country);
      const allowed = new Set(accessibleSurveys.map(s => s.asset_id));
      const picked = requestedSurveyIds.find(id => allowed.has(id));
      if (!picked) {
        throw new DownloadPermissionError('The requested survey is not accessible.', 403);
      }
      request.survey_id = picked;
    }

    if (requestedGaul) {
      request.gaul_2 = requestedGaul;
    }

    return [request];
  }

  // ---- Regular user: strictly scoped to permitted forms (and districts) ----
  // All accessible surveys across every country the user is assigned to. Country is
  // taken from each survey, so multi-country users are handled correctly.
  const accessibleSurveys = await getAccessibleSurveys(user);
  if (accessibleSurveys.length === 0) {
    throw new DownloadPermissionError(
      'No surveys assigned to your user account. Please contact an administrator.', 403
    );
  }

  // Narrow to the explicitly requested survey(s), if any. Deny (never widen) on mismatch.
  let selectedSurveys = accessibleSurveys;
  if (requestedSurveyIds.length > 0) {
    selectedSurveys = accessibleSurveys.filter(s => requestedSurveyIds.includes(s.asset_id));
    if (selectedSurveys.length === 0) {
      throw new DownloadPermissionError('You do not have access to the requested survey.', 403);
    }
  }

  const allowedGaulCodes = user.permissions?.gaul_codes || [];

  // The district (gaul_2) is a user-chosen filter, not an auto-restriction:
  //   - no district selected            → whole form (all districts)
  //   - district selected               → filter by that district
  // A district-restricted user may only filter by a district within their permitted set
  // (the dropdown only offers those; this guards a crafted request).
  if (requestedGaul && allowedGaulCodes.length > 0 && !allowedGaulCodes.includes(requestedGaul)) {
    throw new DownloadPermissionError('You do not have access to the requested district.', 403);
  }

  const requests = [];

  for (const survey of selectedSurveys) {
    const surveyCountry = normalizeCountryCode(survey.country_id);
    if (!surveyCountry) {
      // A survey without a resolvable country cannot be queried against PeSKAS.
      throw new DownloadPermissionError(
        `Survey "${survey.name || survey.asset_id}" has no associated country configured. ` +
        `Please contact an administrator.`, 400
      );
    }

    const request = { country: surveyCountry, survey_id: survey.asset_id };
    if (requestedGaul) {
      // Filter by the selected district (validated above).
      request.gaul_2 = requestedGaul;
    }
    requests.push(request);
  }

  if (requests.length === 0) {
    throw new DownloadPermissionError(
      'No accessible data matches your permissions for the selected filters.', 400
    );
  }

  if (requests.length > MAX_DOWNLOAD_REQUESTS) {
    throw new DownloadPermissionError(
      `Your selection spans ${requests.length} forms, which is too many to download at once. ` +
      `Please select a specific survey to narrow your download.`, 400
    );
  }

  return requests;
}

module.exports = {
  getAccessibleSurveys,
  getAccessibleCountries,
  getAccessibleDistricts,
  getAccessibleTaxa,
  resolveDownloadRequests,
  normalizeCountryCode,
  DownloadPermissionError,
  MAX_DOWNLOAD_REQUESTS
};

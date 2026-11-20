/**
 * Canonical country codes, and the Airtable spellings that map onto them.
 *
 * Country identifiers enter this system as free text typed into Airtable, and that text has
 * already been renamed once: the Airtable `countries` table and the `forms` table's
 * "Associated Countries" field now read **"Timor-Leste"**, while `surveys.country_id` in MongoDB
 * still holds **"Timor"** from an earlier sync. The next survey sync will rewrite it.
 *
 * A plain trim+lowercase would turn that rename into four simultaneous breakages, because three
 * derived vocabularies key off the result:
 *   - `COUNTRY_METADATA` in the frontend is keyed `timor` → flag and name would disappear
 *   - `districts.country_id` is `timor` → the district filter would match nothing
 *   - a `countries` row would no longer match its own surveys
 *   - the PeSKAS download API would receive `timor-leste`
 *
 * Mapping aliases onto one canonical code makes such a rename a non-event. Unknown values fall
 * through as trim+lowercase, so onboarding a genuinely new country needs no code change — only
 * a country that acquires a *second* spelling needs an entry here.
 *
 * Keep this in sync with `src/utils/countryMetadata.ts`, which needs the same table in the
 * browser bundle (the frontend cannot import from `lib/`).
 *
 * @module lib/country-codes
 */

/**
 * Alternative spellings → canonical code. Keys must be lowercase and trimmed.
 */
const COUNTRY_ALIASES = {
  'timor-leste': 'timor',
  'timor leste': 'timor',
  'timorleste': 'timor',
  'east timor': 'timor',
  'tls': 'timor',
  'zanzibar': 'zanzibar',
  'mozambique': 'mozambique',
  'kenya': 'kenya'
};

/**
 * Resolve any country identifier to its canonical lowercase code.
 *
 * Handles the single-element array Airtable sometimes returns for a linked-record field.
 *
 * @param {string|Array<string>|undefined} countryId
 * @returns {string} Canonical code, or '' if it cannot be resolved
 */
function toCanonicalCountry(countryId) {
  const raw = Array.isArray(countryId) ? countryId[0] : countryId;
  if (typeof raw !== 'string') return '';
  const key = raw.trim().toLowerCase();
  if (!key) return '';
  return COUNTRY_ALIASES[key] || key;
}

/**
 * Name and ISO 4217 currency of each canonical country, and what it calls a GAUL level 2 area
 * where that is not "Districts", for the Excel report's Start sheet. Names and currencies mirror
 * `COUNTRY_METADATA` in `src/utils/countryMetadata.ts`: change both.
 */
const COUNTRIES = {
  kenya: { name: 'Kenya', currency: 'KES', districts: 'Sub-counties' },
  zanzibar: { name: 'Zanzibar', currency: 'TZS' },
  mozambique: { name: 'Mozambique', currency: 'MZN' },
  timor: { name: 'Timor-Leste', currency: 'USD' }
};

module.exports = { toCanonicalCountry, COUNTRY_ALIASES, COUNTRIES };

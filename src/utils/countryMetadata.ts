// Country metadata for multi-country support

export interface CountryMetadata {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
}

// Country metadata mapping, keyed by the lowercase country slug used across the
// platform (`countries.code`, `districts.country_id`). `surveys.country_id` is the
// Airtable display name ("Zanzibar"), which normalizes onto these keys. Names and
// currencies are mirrored by `COUNTRIES` in `lib/country-codes.js` (the Excel report).
export const COUNTRY_METADATA: Record<string, CountryMetadata> = {
  'zanzibar': {
    code: 'zanzibar',
    name: 'Zanzibar',
    flag: '🇹🇿',
    currency: 'TZS',
    currencySymbol: 'TSh',
  },
  'mozambique': {
    code: 'mozambique',
    name: 'Mozambique',
    flag: '🇲🇿',
    currency: 'MZN',
    currencySymbol: 'MT',
  },
  'timor': {
    code: 'timor',
    name: 'Timor-Leste',
    flag: '🇹🇱',
    currency: 'USD',
    currencySymbol: '$',
  },
  'kenya': {
    code: 'kenya',
    name: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    currencySymbol: 'KSh',
  },
};

/**
 * Alternative Airtable spellings → canonical COUNTRY_METADATA key.
 *
 * Mirrors `lib/country-codes.js`, which the browser bundle cannot import. Keep the two in sync.
 *
 * This exists because the identifier is free text in Airtable and has already been renamed
 * once: Airtable now says "Timor-Leste" where `surveys.country_id` still says "Timor". Without
 * the alias, the next survey sync would leave Timor with no flag and its name rendered as the
 * uppercased slug "TIMOR-LESTE".
 */
const COUNTRY_ALIASES: Record<string, string> = {
  'timor-leste': 'timor',
  'timor leste': 'timor',
  'timorleste': 'timor',
  'east timor': 'timor',
  'tls': 'timor',
};

/**
 * Normalize a country identifier onto a COUNTRY_METADATA key.
 * `surveys.country_id` comes from Airtable verbatim, so it may be a capitalized
 * display name or a single-element array.
 */
const normalizeCountryCode = (countryCode: string | string[] | undefined): string => {
  const raw = Array.isArray(countryCode) ? countryCode[0] : countryCode;
  if (typeof raw !== 'string') return '';
  const key = raw.trim().toLowerCase();
  return COUNTRY_ALIASES[key] || key;
};

/**
 * Get country metadata by country code
 */
export const getCountryMetadata = (countryCode: string | undefined): CountryMetadata | null => {
  const key = normalizeCountryCode(countryCode);
  if (!key) return null;
  return COUNTRY_METADATA[key] || null;
};

/**
 * Get country flag emoji
 */
export const getCountryFlag = (countryCode: string | undefined): string => {
  const metadata = getCountryMetadata(countryCode);
  return metadata?.flag || '';
};

/**
 * Get country name
 */
export const getCountryName = (countryCode: string | undefined): string => {
  const metadata = getCountryMetadata(countryCode);
  return metadata?.name || normalizeCountryCode(countryCode).toUpperCase();
};


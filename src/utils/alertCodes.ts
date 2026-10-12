import type { i18n as I18n } from 'i18next';

/**
 * Describe one alert code in the reader's language.
 *
 * Priority: `surveys.{assetId}.{code}` > `alertCodes.{code}` > the text stored with the survey in
 * the database. Checked with `exists` rather than by comparing `t()` to its key, so a code with
 * no translation does not log a missing-key warning for every badge on the page.
 */
export const describeAlertCode = (
  i18n: I18n,
  assetId: string,
  code: string,
  stored: Record<string, string>
): string | undefined => {
  const stem = storedAlertCode(code);
  for (const key of [`surveys.${assetId}.${stem}`, `alertCodes.${stem}`]) {
    if (i18n.exists(key, { ns: 'validation' })) return i18n.t(key, { ns: 'validation' });
  }
  return stored[stem];
};

/**
 * Sub-codes are written "5.2" in `alert_flag` but stored as "5_2" wherever they are a key: a
 * MongoDB field name cannot hold a dot, and i18next reads one as a nesting separator.
 */
const storedAlertCode = (code: string): string => code.replace(/\./g, '_');

/** A stored code as the badges write it: "5_2" becomes "5.2". */
export const displayAlertCode = (code: string): string => code.replace(/_/g, '.');

/**
 * The codes in an `alert_flag` string, each once. Rows written before the pipelines removed
 * repeats can hold one per catch ("4,11, 4,11, 11") and mix "," with ", ".
 */
export const splitAlertCodes = (alertFlag: string): string[] => [
  ...new Set(alertFlag.split(',').map(code => code.trim()).filter(Boolean))
];

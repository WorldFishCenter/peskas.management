import { getCountryMetadata } from '../utils/countryMetadata';

/** Public support inbox for the login page (mailto). Not a secret. */
export const SUPPORT_EMAIL = 'peskas.platform@gmail.com' as const;

/**
 * Embed URL of the Airtable "Send feedback" form (base appMMEJYlJdfSJEjm, table `feedback`).
 * Public by design, not a secret. While this is empty the navbar hides the feedback entry, so
 * the menu never points at a form that does not exist yet.
 *
 * May also hold Airtable's whole copied `<iframe>` snippet — see `getFeedbackFormUrl`.
 */
export const FEEDBACK_FORM_EMBED_URL =
  'https://airtable.com/embed/appMMEJYlJdfSJEjm/pagcUwI98jkso09FR/form';

export function getSupportMailtoHref(): string {
  const query = new URLSearchParams({
    subject: 'Peskas Management Platform – support request'
  });
  return `mailto:${SUPPORT_EMAIL}?${query.toString()}`;
}

/**
 * Feedback form URL with what the session already knows filled in, so the user answers
 * fewer questions. A field is only hidden once it is actually prefilled — hiding an empty
 * one would leave the submitter no way to answer it.
 *
 * Country is prefilled only for users scoped to exactly one: admins carry every country and
 * multi-country users would get an arbitrary pick, so both choose on the form.
 *
 * `getCountryMetadata` (not `getCountryName`) because Airtable's `Country` is a singleSelect
 * and silently drops a prefill matching no choice. `getCountryName` falls back to the
 * uppercased slug, which would hide the field on a value Airtable then discards — the portal
 * knows four countries, the select offers twelve.
 */
export function getFeedbackFormUrl(name?: string, countries?: string[]): string {
  // Tolerate a full `<iframe …>` snippet, which is what Airtable's Share dialog copies. Left
  // whole it becomes a relative iframe src, and the `%` in `width="100%"` makes Vite's
  // decodeURI throw "URI malformed" instead of showing anything useful.
  const base = FEEDBACK_FORM_EMBED_URL.match(/src="([^"]+)"/)?.[1] ?? FEEDBACK_FORM_EMBED_URL;
  const params = new URLSearchParams();

  // `field` must match the Airtable question label byte for byte; renaming it in the Airtable
  // UI silently stops the prefill. Hiding happens here and only here, so a field can never be
  // hidden without a value behind it.
  const prefill = (field: string, value?: string) => {
    if (!value) return;
    params.set(`prefill_${field}`, value);
    params.set(`hide_${field}`, 'true');
  };

  prefill('Your name', name);
  prefill('Country', countries?.length === 1 ? getCountryMetadata(countries[0])?.name : undefined);

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

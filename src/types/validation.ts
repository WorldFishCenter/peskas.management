/**
 * One catch that raised an alert, as the pipeline stores it: the catch's position in the form
 * (1 for the first species entered), the alert code, the species and the value recorded.
 */
export interface AlertCatch {
  catch_number: number;
  code: string;
  species?: string;
  value?: string;
}

export interface Submission {
  submission_id: string;
  submission_date: string;
  submitted_by?: string;
  submittedBy?: string;
  alert_number?: string;
  validation_status: string;
  /** Null until the submission has been validated — the pipeline omits the field entirely. */
  validated_at: string | null;
  alert_flag?: string;
  /** Where each catch-level alert was raised. Absent when no catch was flagged. */
  alert_catches?: AlertCatch[];
  asset_id?: string;
  survey_name?: string;
  survey_country?: string;
}

/**
 * One row from `/enumerators-stats`: a count of submissions sharing an enumerator, a day and an
 * alert list. The endpoint groups in MongoDB rather than returning raw submissions — the
 * dashboard only ever renders counts.
 */
export interface EnumeratorDailyStat {
  submitted_by: string;
  /** `YYYY-MM-DD` (UTC), or null when the stored date could not be parsed. */
  date: string | null;
  /**
   * The submissions' alert codes as stored ("3, 7"); absent means no alert — the endpoint folds
   * missing, `"NA"` and `""` into one absent field.
   */
  alert_flag?: string;
  /** Submissions, each counted once whatever its number of alert codes. */
  count: number;
}

/**
 * A survey the signed-in user may read, as returned in `metadata.accessible_surveys`
 * by the submissions and enumerator-stats endpoints.
 */
export interface AccessibleSurvey {
  asset_id: string;
  name: string;
  country_id: string;
  /** Alert code → description. Only the submissions endpoint sends these. */
  alert_codes?: Record<string, string>;
}

export type ValidationStatus =
  | 'validation_status_approved'
  | 'validation_status_not_approved'
  | 'default';

/**
 * The `common:status.*` translation key for a stored validation status.
 *
 * One rule, used by both the badge and the filter dropdown, because the statuses in the data are
 * not a closed set: KoboToolbox writes `validation_status_*`, while the R pipeline writes bare
 * `not_validated` on surveys it has not validated yet.
 *
 * Returns i18next's key-fallback list rather than one key, so a value the pipeline starts writing
 * tomorrow degrades to "Pending" instead of rendering the literal string `status.whatever` —
 * `src/i18n/config.ts` sets `returnEmptyString: false`, which means a missing key renders as
 * itself.
 */
export const statusLabelKey = (status: string | undefined): string[] =>
  status
    ? [`status.${status.replace('validation_status_', '')}`, 'status.default']
    : ['status.default'];
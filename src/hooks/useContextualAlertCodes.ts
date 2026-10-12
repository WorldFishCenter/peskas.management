import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiConfig';
import { describeAlertCode } from '../utils/alertCodes';
import { AccessibleSurvey } from '../types/validation';

const API_BASE_URL = getApiBaseUrl();

interface SurveyAlertCodes {
  surveyName: string;
  surveyCountry: string;
  assetId: string;
  alertCodes: Record<string, string>;
}

interface AlertCodesResult {
  surveyAlertCodes: SurveyAlertCodes[];
  /** One code's description in the reader's language; undefined when it has none. */
  describeAlert: (code: string) => string | undefined;
  isLoading: boolean;
}

/**
 * Alert-code definitions for the survey whose data is currently loaded.
 *
 * Takes the survey directly: both `/kobo/submissions` and `/enumerators-stats` serve exactly one
 * survey per request and name it in `metadata.survey`. This used to derive the survey by scanning
 * every returned row — twice, in two separate `useMemo`s — which on the largest survey meant two
 * 52,000-element passes to produce a single asset id.
 *
 * The result is still an array because `AlertGuideModal` renders a list.
 */
export const useContextualAlertCodes = (
  survey: AccessibleSurvey | null | undefined
): AlertCodesResult => {
  const [alertCodes, setAlertCodes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { i18n } = useTranslation('validation');
  const assetId = survey?.asset_id;

  useEffect(() => {
    if (!assetId) {
      setAlertCodes({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    axios
      .get(`${API_BASE_URL}/surveys/${assetId}/alert-codes`)
      .then(response => {
        if (!cancelled) setAlertCodes(response.data.alert_codes || {});
      })
      .catch(error => {
        if (cancelled) return;
        console.error(`Failed to fetch alert codes for survey ${assetId}:`, error);
        setAlertCodes({});
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetId]);

  const surveyAlertCodes = useMemo<SurveyAlertCodes[]>(() => {
    if (!survey || Object.keys(alertCodes).length === 0) return [];
    return [{
      surveyName: survey.name || 'Unknown Survey',
      surveyCountry: survey.country_id || '',
      assetId: survey.asset_id,
      alertCodes
    }];
  }, [survey, alertCodes]);

  // Called when a popover opens or a tooltip shows, so it reads the language current then.
  const describeAlert = useCallback(
    (code: string) => (assetId ? describeAlertCode(i18n, assetId, code, alertCodes) : undefined),
    [i18n, assetId, alertCodes]
  );

  return { surveyAlertCodes, describeAlert, isLoading };
};

export type { SurveyAlertCodes };

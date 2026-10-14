import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiConfig';
import { extractErrorMessage } from '../utils/errors';
import { useSurveyContext } from '../contexts/SurveyContext';

// Get the appropriate API base URL based on environment
const API_BASE_URL = getApiBaseUrl();

import { Submission, EnumeratorDailyStat, AccessibleSurvey } from '../types/validation';

/**
 * Expand a stored submission row into the shape the table and its filters expect.
 *
 * `/kobo/submissions` returns rows exactly as MongoDB holds them and names the owning survey
 * once in `metadata.survey`. Re-attaching the survey fields and the empty-value defaults here
 * rather than on the wire is what keeps the largest survey's response from doubling in size —
 * three survey fields and six defaults repeated across 52,000 rows was 9 MB of the 18.5 MB
 * measured before. Defaults are reproduced exactly so column filters behave as they did.
 */
const normalizeSubmissionData = (
  item: Record<string, unknown>,
  survey: AccessibleSurvey | undefined
): Submission => {
  return {
    ...(item as unknown as Submission),
    submitted_by: item.submitted_by ? String(item.submitted_by) : '',
    validation_status: (item.validation_status as string) || 'validation_status_on_hold',
    validated_at: (item.validated_at as string) ?? null,
    alert_flag: typeof item.alert_flag === 'string' ? item.alert_flag : '',
    asset_id: survey?.asset_id,
    survey_name: survey?.name,
    survey_country: survey?.country_id,
  };
};

/**
 * One page of the validation table, as the server understands it.
 *
 * Every field is a primitive so the fetching `useCallback` can list them individually and stay
 * honest about its dependencies — an object here would either lie to `exhaustive-deps` or force
 * every caller to memoize.
 */
export interface SubmissionQuery {
  /** 1-based, matching the API. */
  page: number;
  limit: number;
  /** Checked against an allowlist server-side; anything else falls back to `submission_date`. */
  sort: string;
  order: 'asc' | 'desc';
  status?: string;
  /** `'with-alerts'` | `'no-alerts'`; omitted means all. */
  alert?: string;
  /** `YYYY-MM-DD`, inclusive. */
  from?: string;
  to?: string;
  /** Prefix match on `submitted_by` / `submission_id`. Debounce before passing it in. */
  search?: string;
}

/** Bounds for the date pickers, from the whole collection rather than the loaded page. */
export interface SubmissionDateRange {
  min: string | null;
  max: string | null;
}

// Hook to fetch one page of submissions
export const useFetchSubmissions = (query: SubmissionQuery) => {
  const { page, limit, sort, order, status, alert, from, to, search } = query;
  const { selectedSurveyId, setSelectedSurveyId } = useSurveyContext();
  const [data, setData] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  // Derived from the whole collection by the API — the table can no longer work these out from
  // the rows it holds, because it only holds one page of them.
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<SubmissionDateRange>({ min: null, max: null });
  const [accessibleSurveys, setAccessibleSurveys] = useState<AccessibleSurvey[]>([]);
  // The one survey these rows belong to, as named by the API. Consumers read it instead of
  // deriving it from the rows.
  const [loadedSurvey, setLoadedSurvey] = useState<AccessibleSurvey | null>(null);
  const [alertCodes, setAlertCodes] = useState<Record<string, Record<string, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read selectedSurveyId via a ref so fetchData never needs to be recreated
  // when the context value changes. Calling setSelectedSurveyId inside fetchData
  // is therefore safe — it won't trigger a second useEffect-driven fetch.
  const selectedSurveyRef = useRef<string | null>(selectedSurveyId);
  useEffect(() => { selectedSurveyRef.current = selectedSurveyId; }, [selectedSurveyId]);

  // Track the AbortController for the current in-flight request so that
  // a new call (or StrictMode remount) can cancel the previous one.
  const abortRef = useRef<AbortController | null>(null);

  // The survey whose `statuses` / `date_range` we already hold. Those describe the whole
  // collection, so they survive every page turn, sort and filter — only a different survey
  // invalidates them. `?meta=1` asks the API to compute them; without it, it skips three
  // queries per request.
  const metaSurveyRef = useRef<string | null>(null);

  const fetchData = useCallback(async (forcedSurveyId?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      setError(null);

      const surveyToFetch = forcedSurveyId !== undefined ? forcedSurveyId : selectedSurveyRef.current;

      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
        sort,
        order,
      };
      if (surveyToFetch) params.survey_id = surveyToFetch;
      if (!surveyToFetch || surveyToFetch !== metaSurveyRef.current) params.meta = '1';
      if (status) params.status = status;
      if (alert) params.alert = alert;
      if (from) params.from = from;
      if (to) params.to = to;
      if (search) params.search = search;

      const response = await axios.get(`${API_BASE_URL}/kobo/submissions`, {
        params,
        signal: controller.signal,
      });

      // Handle case where backend requires survey selection
      if (response.data.message === 'Please select a survey to view submissions') {
        setData([]);
        setTotal(0);
        setLoadedSurvey(null);
        if (response.data.metadata?.accessible_surveys) {
          const surveys = response.data.metadata.accessible_surveys;
          setAccessibleSurveys(surveys);

          if (surveys.length > 0 && !surveyToFetch) {
            const firstSurvey = surveys[0].asset_id;
            // Update ref immediately so the recursive call uses the right id.
            // setSelectedSurveyId is safe here — fetchData is stable and won't
            // be recreated, so this won't trigger an extra useEffect run.
            selectedSurveyRef.current = firstSurvey;
            setSelectedSurveyId(firstSurvey);
            return await fetchData(firstSurvey);
          }
        }
        return;
      }

      if (!Array.isArray(response.data.results)) {
        setData([]);
        setTotal(0);
        setLoadedSurvey(null);
        return;
      }

      const survey: AccessibleSurvey | undefined = response.data.metadata?.survey;
      setLoadedSurvey(survey ?? null);
      setData(
        response.data.results.map((row: Record<string, unknown>) =>
          normalizeSubmissionData(row, survey)
        )
      );
      setTotal(response.data.total ?? 0);
      // Present only on a `meta=1` request; otherwise keep what we have for this survey.
      if (response.data.metadata?.statuses) {
        setStatuses(response.data.metadata.statuses);
        setDateRange(response.data.metadata.date_range ?? { min: null, max: null });
        metaSurveyRef.current = survey?.asset_id ?? null;
      }

      if (response.data.metadata?.accessible_surveys) {
        const surveys = response.data.metadata.accessible_surveys;
        setAccessibleSurveys(surveys);

        const codesMap: Record<string, Record<string, string>> = {};
        surveys.forEach((survey: AccessibleSurvey) => {
          if (survey.alert_codes) {
            codesMap[survey.asset_id] = survey.alert_codes;
          }
        });
        setAlertCodes(codesMap);

        // For single-survey users: sync the context so other pages know which
        // survey is active. Safe — fetchData is stable, so this won't retrigger
        // the useEffect below.
        if (!surveyToFetch && surveys.length === 1) {
          selectedSurveyRef.current = surveys[0].asset_id;
          setSelectedSurveyId(surveys[0].asset_id);
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(extractErrorMessage(err, 'Failed to load submissions'));
      setData([]);
      setTotal(0);
      setAccessibleSurveys([]);
      setLoadedSurvey(null);
      // Whatever we held is no longer known to match a loaded survey — ask again next time.
      metaSurveyRef.current = null;
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  // setSelectedSurveyId from useState is always stable. The query fields are listed individually
  // so that changing a page, sort or filter recreates fetchData and the effect below refetches.
  }, [setSelectedSurveyId, page, limit, sort, order, status, alert, from, to, search]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  return {
    data,
    total,
    statuses,
    dateRange,
    accessibleSurveys,
    loadedSurvey,
    alertCodes,
    selectedSurvey: selectedSurveyId,
    setSelectedSurvey: setSelectedSurveyId,
    isLoading,
    error,
    refetch: fetchData
  };
};

// Hook to fetch enumerator statistics from the new MongoDB collection
export const useFetchEnumeratorStats = () => {
  const { selectedSurveyId, setSelectedSurveyId } = useSurveyContext();
  const [data, setData] = useState<EnumeratorDailyStat[]>([]);
  const [accessibleSurveys, setAccessibleSurveys] = useState<AccessibleSurvey[]>([]);
  const [loadedSurvey, setLoadedSurvey] = useState<AccessibleSurvey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSurveyRef = useRef<string | null>(selectedSurveyId);
  useEffect(() => { selectedSurveyRef.current = selectedSurveyId; }, [selectedSurveyId]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (forcedSurveyId?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      setError(null);

      const surveyToFetch = forcedSurveyId !== undefined ? forcedSurveyId : selectedSurveyRef.current;

      const params: Record<string, string> = {};
      if (surveyToFetch) {
        params.survey_id = surveyToFetch;
      }

      const response = await axios.get(`${API_BASE_URL}/enumerators-stats`, {
        params,
        signal: controller.signal,
      });

      if (response.data.message === 'Please select a survey to view statistics') {
        setData([]);
        setLoadedSurvey(null);
        if (response.data.metadata?.accessible_surveys) {
          const surveys = response.data.metadata.accessible_surveys;
          setAccessibleSurveys(surveys);

          if (surveys.length > 0 && !surveyToFetch) {
            const firstSurvey = surveys[0].asset_id;
            selectedSurveyRef.current = firstSurvey;
            setSelectedSurveyId(firstSurvey);
            return await fetchData(firstSurvey);
          }
        }
        return;
      }

      if (!Array.isArray(response.data.results)) {
        setData([]);
        setLoadedSurvey(null);
        return;
      }
      setLoadedSurvey(response.data.metadata?.survey ?? null);
      setData(response.data.results);

      if (response.data.metadata?.accessible_surveys) {
        const surveys = response.data.metadata.accessible_surveys;
        setAccessibleSurveys(surveys);
        if (!surveyToFetch && surveys.length === 1) {
          selectedSurveyRef.current = surveys[0].asset_id;
          setSelectedSurveyId(surveys[0].asset_id);
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(extractErrorMessage(err, 'Failed to load enumerator statistics'));
      setData([]);
      setAccessibleSurveys([]);
      setLoadedSurvey(null);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  // setSelectedSurveyId from useState is always stable — no other deps needed.
  }, [setSelectedSurveyId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  return {
    data,
    accessibleSurveys,
    loadedSurvey,
    selectedSurvey: selectedSurveyId,
    setSelectedSurvey: setSelectedSurveyId,
    isLoading,
    error,
    refetch: fetchData
  };
};

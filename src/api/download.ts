import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiConfig';
import { extractErrorMessage } from '../utils/errors';
import {
  AppliedFilters,
  DownloadDataset,
  DownloadFilters,
  PreviewResponse,
  FieldMetadata,
  DataRow,
  CountryOption,
  District,
  Survey,
  Taxon
} from '../types/download';

// Data Download hooks: filter metadata, preview, CSV export and field descriptions.

const API_BASE_URL = getApiBaseUrl();

/**
 * Serialize download filters into a query string.
 *
 * Empty values are dropped and arrays are joined with commas, which is what the
 * data-download endpoints expect. Shared by the preview hook and the CSV export so the
 * two cannot drift apart.
 */
const buildDownloadQuery = (filters: DownloadFilters): string => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length > 0) params.append(key, value.join(','));
    } else {
      params.append(key, String(value));
    }
  });
  return params.toString();
};


/**
 * Hook to fetch download preview data
 *
 * Fetches the first 20 rows of data based on selected filters
 * to preview before downloading the full dataset.
 */
export const useFetchDownloadPreview = () => {
  const [data, setData] = useState<DataRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async (filters: DownloadFilters) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get<PreviewResponse>(
        `${API_BASE_URL}/data-download/preview?${buildDownloadQuery(filters)}`
      );

      setData(response.data.data);
      setTotalCount(response.data.total_count);
      setAppliedFilters(response.data.filters_applied);
    } catch (err: unknown) {
      console.error('Error fetching preview:', err);
      setError(extractErrorMessage(err, 'Failed to fetch preview'));
      setData([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, totalCount, appliedFilters, isLoading, error, fetchPreview };
};

/**
 * Function to trigger CSV download
 *
 * Downloads the full dataset as CSV based on selected filters.
 * Triggers browser download with appropriate filename.
 *
 * @param filters - Download filters to apply
 * @returns Promise<boolean> - true if download succeeded, false otherwise
 */
export const downloadCSV = async (filters: DownloadFilters): Promise<boolean> => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/data-download/export?${buildDownloadQuery(filters)}`,
      {
        responseType: 'blob' // Important for file download
      }
    );

    // Create blob and trigger download
    const blob = new Blob([response.data], { type: 'text/csv; charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Extract filename from Content-Disposition header (exposed by lib/response.js) or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = `peskas-${filters.dataset}-${new Date().toISOString().split('T')[0]}.csv`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/"/g, '');
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return true;
  } catch (err) {
    console.error('Error downloading CSV:', err);
    return false;
  }
};

/**
 * Unified hook to fetch all download metadata in one request
 * Replaces useFetchCountries, useFetchDistricts, useFetchSurveys for better performance
 *
 * @param countryId - Optional country filter for districts/surveys
 * @param surveyId - Optional survey filter for districts (cascade filtering)
 */
export const useFetchDownloadMetadata = (countryId?: string, surveyId?: string, withTaxa = true) => {
  const [metadata, setMetadata] = useState<{
    countries: CountryOption[];
    districts: District[];
    surveys: Survey[];
    taxa: Taxon[];
  }>({
    countries: [],
    districts: [],
    surveys: [],
    taxa: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The species list is the bulk of this payload and only changes with country, so ask for it
  // when the country changes and hold it across survey changes — same shape as `metaSurveyRef`
  // in useFetchSubmissions. Updated only after a successful response, so a failed request
  // re-asks next time instead of leaving the picker permanently empty.
  const taxaCountryRef = useRef<string | null>(null);

  const fetchMetadata = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (countryId) params.append('country_id', countryId);
      if (surveyId) params.append('survey_id', surveyId);

      const wantsTaxa = withTaxa && taxaCountryRef.current !== (countryId || '');
      if (wantsTaxa) params.append('taxa', '1');

      const queryString = params.toString();
      const url = `${API_BASE_URL}/data-download/metadata${queryString ? `?${queryString}` : ''}`;
      const response = await axios.get(url);

      setMetadata((prev) => ({
        countries: response.data.countries || [],
        districts: response.data.districts || [],
        surveys: response.data.surveys || [],
        // Absent (not empty) when we didn't ask — keep what we already have.
        taxa: response.data.taxa ?? prev.taxa
      }));

      if (wantsTaxa) taxaCountryRef.current = countryId || '';
    } catch (err: unknown) {
      console.error('Error fetching download metadata:', err);
      setError(extractErrorMessage(err, 'Failed to load filter metadata'));
    } finally {
      setIsLoading(false);
    }
  }, [countryId, surveyId, withTaxa]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  return {
    metadata,
    isLoading,
    error,
    refetch: fetchMetadata
  };
};

/**
 * Hook to fetch field metadata from Peskas API
 *
 * Fetches comprehensive field documentation including descriptions, data types,
 * units, examples, and categorical values. Used to enhance UX with field
 * descriptions in the Data Download feature.
 *
 * Features:
 * - Lazy loading: Only fetches when fetchMetadata() is called
 * - Session caching: Stores in sessionStorage to avoid repeated requests
 * - Scope filtering: Optional scope parameter to filter by trip_info or catch_info
 *
 * @param scope - Optional scope filter ('trip_info' or 'catch_info'), landings only
 * @param dataset - Table the fields belong to
 * @returns Object with metadata, loading/error states, and fetch function
 */
export const useFetchFieldMetadata = (scope?: string, dataset: DownloadDataset = 'landings') => {
  const [metadata, setMetadata] = useState<FieldMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate cache key based on dataset and scope
  const cacheKey = `peskas_metadata_${dataset}_${scope || 'all'}`;

  // Another table or scope has other columns: drop what was loaded for the previous one, so
  // the next click fetches again instead of looking a field up in the wrong dictionary.
  useEffect(() => {
    setMetadata(null);
    setError(null);
  }, [cacheKey]);

  const fetchMetadata = useCallback(async () => {
    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setMetadata(JSON.parse(cached));
        return;
      }
    } catch (err) {
      console.warn('Failed to read metadata from cache:', err);
      // Continue to fetch from API
    }

    // Fetch from API
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ dataset });
      if (scope) params.append('scope', scope);

      const response = await axios.get<FieldMetadata>(
        `${API_BASE_URL}/data-download/metadata-fields?${params.toString()}`
      );

      setMetadata(response.data);

      // Cache in sessionStorage
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(response.data));
      } catch (err) {
        console.warn('Failed to cache metadata:', err);
        // Continue even if caching fails
      }
    } catch (err: unknown) {
      console.error('Error fetching field metadata:', err);
      setError(extractErrorMessage(err, 'Failed to load field descriptions'));
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, [scope, dataset, cacheKey]);

  return { metadata, isLoading, error, fetchMetadata };
};

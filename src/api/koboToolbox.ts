import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiConfig';
import { errorStatus } from '../utils/errors';

// Get the appropriate API base URL based on environment
const API_BASE_URL = getApiBaseUrl();

/** Thrown by {@link generateEditUrl}; `key` is a `validation:form.*` message. */
export class EditUrlError extends Error {
  key: string;

  constructor(key: string) {
    super(key);
    this.key = key;
  }
}

/**
 * Get the KoboToolbox (Enketo) edit link for a submission.
 * @throws EditUrlError
 */
export const generateEditUrl = async (submissionId: string, assetId?: string): Promise<string> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/kobo/edit-url/${submissionId}`, { params: { asset_id: assetId } });
    if (response.data?.url) return response.data.url;
  } catch (error) {
    console.error('Failed to get edit URL:', error);
    const httpStatus = errorStatus(error);
    if (httpStatus === 403) throw new EditUrlError('form.editForbidden');
    if (httpStatus === 404) throw new EditUrlError('form.editNotFound');
  }
  throw new EditUrlError('form.editUrlError');
};

/** A submission's decision fields, as the server holds them after a save or a refused save. */
export interface DecisionState {
  validation_status: string | null;
  validated_by: string | null;
  validated_at: string | null;
}

export type StatusUpdateResult =
  | { outcome: 'saved'; kobo: 'updated' | 'failed' | 'skipped'; current: DecisionState }
  | { outcome: 'conflict'; current: DecisionState }
  | { outcome: 'forbidden' | 'notFound' | 'failed' };

/**
 * Record a reviewer's decision. The server writes MongoDB first (what the pipelines read),
 * then KoboToolbox; `seen` is the decision the reviewer saw, so one someone else made meanwhile
 * is not overwritten.
 */
export const updateValidationStatus = async (
  submissionId: string,
  status: string,
  assetId: string | undefined,
  seen: { status: string | null; validatedAt: string | null }
): Promise<StatusUpdateResult> => {
  try {
    const { data } = await axios.patch(`${API_BASE_URL}/submissions/${submissionId}/validation-status`, {
      validation_status: status,
      asset_id: assetId,
      expected_status: seen.status,
      expected_validated_at: seen.validatedAt
    });
    return { outcome: 'saved', kobo: data.kobo, current: data.current };
  } catch (error) {
    console.error('Failed to update status:', error);
    const httpStatus = errorStatus(error);
    if (httpStatus === 409 && axios.isAxiosError(error) && error.response?.data?.current) {
      return { outcome: 'conflict', current: error.response.data.current };
    }
    if (httpStatus === 403) return { outcome: 'forbidden' };
    if (httpStatus === 404) return { outcome: 'notFound' };
    return { outcome: 'failed' };
  }
};

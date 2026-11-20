import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiConfig';
import { extractErrorMessage, errorStatus } from '../utils/errors';

const API_BASE_URL = getApiBaseUrl();

/** Why a sign-in failed: a key under `auth:errors`. */
export type LoginErrorKey =
  | 'invalidCredentials'
  | 'accountDisabled'
  | 'tooManyAttempts'
  | 'networkError'
  | 'serverUnavailable';

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    username: string;
    role: string;
    name?: string;
    country?: string[];
    language?: string;
  };
  expiresIn?: string;
  errorKey?: LoginErrorKey;
  /** Seconds until a locked account may try again. */
  retryAfter?: number;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password });
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error) || !error.response) {
      return { success: false, errorKey: 'networkError' };
    }
    const { status, data } = error.response;
    if (status === 401) {
      return { success: false, errorKey: data?.code === 'ACCOUNT_DISABLED' ? 'accountDisabled' : 'invalidCredentials' };
    }
    if (status === 429) {
      return { success: false, errorKey: 'tooManyAttempts', retryAfter: Number(data?.retryAfter) || undefined };
    }
    return { success: false, errorKey: 'serverUnavailable' };
  }
};

/**
 * Request a password reset email
 * @param identifier - Username or email address
 */
export const requestPasswordReset = async (identifier: string): Promise<void> => {
  try {
    await axios.post(`${API_BASE_URL}/auth/forgot-password`, { identifier });
  } catch (error: unknown) {
    if (errorStatus(error) === 429) {
      throw new Error(extractErrorMessage(error, 'Too many requests'));
    }
    throw new Error(extractErrorMessage(error, 'Failed to send reset email'));
  }
};

/**
 * Validate a password reset token
 * @param token - Reset token from email link
 * @returns Object with validation result
 */
export const validateResetToken = async (token: string): Promise<{
  valid: boolean;
  username?: string;
  reason?: string;
}> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/validate-reset-token`, {
      params: { token }
    });
    return response.data;
  } catch (error: unknown) {
    throw new Error(extractErrorMessage(error, 'Failed to validate token'));
  }
};

/**
 * Reset password using a valid token
 * @param token - Reset token from email link
 * @param newPassword - New password
 * @param confirmPassword - Password confirmation
 */
export const resetPassword = async (
  token: string,
  newPassword: string,
  confirmPassword: string
): Promise<void> => {
  try {
    await axios.post(`${API_BASE_URL}/auth/reset-password`, {
      token,
      newPassword,
      confirmPassword
    });
  } catch (error: unknown) {
    throw new Error(extractErrorMessage(error, 'Failed to reset password'));
  }
};

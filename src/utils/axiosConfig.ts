import axios from 'axios';
import { getApiBaseUrl } from './apiConfig';

/** sessionStorage key: the sign-in page says the session ended instead of showing nothing. */
export const SESSION_ENDED_KEY = 'sessionEnded';

// Publish the resolved API base URL so same-origin static pages — specifically the
// Data Academy lesson HTML, which is NOT part of the React bundle and can't import
// apiConfig — can call the API exactly like the app does, in dev and prod alike.
try {
  localStorage.setItem('apiBaseUrl', getApiBaseUrl());
} catch {
  // localStorage may be unavailable in rare contexts; non-fatal.
}

// Add request interceptor to include JWT authentication token
axios.interceptors.request.use(
  (config) => {
    // Get JWT token from localStorage
    const token = localStorage.getItem('authToken');

    if (token) {
      // Add Authorization header with JWT token
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle authentication errors
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A download asks for a blob, so its JSON error arrives as one too: read it, as every other error is.
    const body = error.response?.data;
    if (body instanceof Blob && body.type.includes('json')) {
      try {
        error.response.data = JSON.parse(await body.text());
      } catch {
        // Not JSON after all: leave it as it came.
      }
    }
    // Only the session check (lib/middleware.js) ends a session: a 401 passed on from another
    // service, or the sign-in page's answer to a wrong password, does not.
    if (error.response?.status === 401 && error.response.data?.sessionEnded) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      try {
        sessionStorage.setItem(SESSION_ENDED_KEY, '1');
      } catch {
        // Without sessionStorage the sign-in page just shows no note.
      }
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default axios;

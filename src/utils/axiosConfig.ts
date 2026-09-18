import axios from 'axios';
import { getApiBaseUrl } from './apiConfig';

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
  (error) => {
    if (error.response?.status === 401) {
      // Check if it's a token expiry
      const errorCode = error.response?.data?.code;

      if (errorCode === 'TOKEN_EXPIRED') {
        console.warn('JWT token expired. Please log in again.');
      }

      // Clear authentication data and redirect to login on any 401 error
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default axios;

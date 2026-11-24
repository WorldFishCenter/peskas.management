/**
 * API Utilities - Rate Limiting, Retry Logic, and Request Handling
 *
 * Provides robust utilities for external API calls with:
 * - Rate limiting (Airtable: 5 req/s, KoboToolbox: configurable)
 * - Exponential backoff retry logic
 * - Request timeouts
 * - Error handling and logging
 */

// `.default`: axios's CJS build sets `module.exports.default = axios`, and it is the
// callable the type definitions describe. Plain `require('axios')` types as the module
// namespace, so `axios.get` is not visible to checkJs.
/** @type {import('axios').AxiosStatic} */
const axios = require('axios').default;

/**
 * Rate Limiter using Token Bucket algorithm
 */
class RateLimiter {
  constructor(requestsPerSecond, burstSize = null) {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize || requestsPerSecond;
    this.tokens = this.burstSize;
    this.lastRefill = Date.now();
    this.queue = [];
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.requestsPerSecond;
    this.tokens = Math.min(this.burstSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire a token (wait if none available)
   */
  async acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          // Wait until next token is available
          const waitTime = ((1 - this.tokens) / this.requestsPerSecond) * 1000;
          setTimeout(tryAcquire, Math.max(waitTime, 100));
        }
      };
      tryAcquire();
    });
  }
}

// Global rate limiters for different services
const rateLimiters = {
  airtable: new RateLimiter(5), // 5 requests per second (Airtable limit)
  kobo: new RateLimiter(10), // 10 requests per second (conservative for KoboToolbox)
};

/**
 * Sleep utility for delays
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} maxDelay - Maximum delay in milliseconds (default: 30000)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Make HTTP request with retry logic and exponential backoff
 *
 * @param {Object} config - Axios request configuration
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries] - Maximum number of retries (default: 3)
 * @param {number} [options.timeout] - Request timeout in milliseconds (default: 30000)
 * @param {string} [options.service] - Service name for rate limiting ('airtable', 'kobo', or null)
 * @param {Function} [options.shouldRetry] - Custom function to determine if request should be retried
 * @returns {Promise<Object>} Axios response
 */
async function makeRequestWithRetry(config, options = {}) {
  const {
    maxRetries = 3,
    timeout = 30000,
    service = null,
    shouldRetry = null,
  } = options;

  // Add timeout to config
  const requestConfig = {
    ...config,
    timeout,
  };

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Apply rate limiting if service is specified
      if (service && rateLimiters[service]) {
        await rateLimiters[service].acquire();
      }

      // Make the request
      const response = await axios(requestConfig);
      return response;
    } catch (error) {
      lastError = error;

      // Determine if we should retry
      const isLastAttempt = attempt === maxRetries;
      const isRetryableError = shouldRetry
        ? shouldRetry(error)
        : isDefaultRetryable(error);

      if (isLastAttempt || !isRetryableError) {
        // Log final failure
        console.error(`Request failed after ${attempt + 1} attempt(s):`, {
          url: config.url,
          method: config.method,
          error: error.message,
          status: error.response?.status,
        });
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt);

      // Log retry
      console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`, {
        url: config.url,
        error: error.message,
        status: error.response?.status,
      });

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable by default
 *
 * Retries on:
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - 429 (Rate limit exceeded)
 * - 500, 502, 503, 504 (Server errors)
 *
 * Does NOT retry on:
 * - 400, 401, 403, 404 (Client errors)
 * - Request timeouts (these are already handled by timeout setting)
 *
 * @param {import('axios').AxiosError} error - Axios error object
 * @returns {boolean} True if error is retryable
 */
function isDefaultRetryable(error) {
  // Network errors (no response)
  if (!error.response) {
    return true;
  }

  const status = error.response.status;

  // Rate limit errors
  if (status === 429) {
    return true;
  }

  // Server errors
  if (status >= 500 && status < 600) {
    return true;
  }

  // Don't retry client errors
  return false;
}

/**
 * Make request to Airtable API with rate limiting and retries
 *
 * @param {string} url - Full Airtable API URL
 * @param {Object} config - Axios request configuration
 * @param {Object} retryOptions - Retry options (optional)
 * @returns {Promise<Object>} Axios response
 */
async function makeAirtableRequest(url, config = {}, retryOptions = {}) {
  const requestConfig = {
    url,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
      ...config.headers,
    },
    ...config,
  };

  return makeRequestWithRetry(requestConfig, {
    service: 'airtable',
    timeout: 10000, // Airtable requests should be fast
    maxRetries: 3,
    ...retryOptions,
  });
}

/**
 * Make request to KoboToolbox API with rate limiting and retries
 *
 * @param {string} url - Full KoboToolbox API URL
 * @param {string} token - KoboToolbox API token
 * @param {Object} config - Axios request configuration
 * @param {Object} retryOptions - Retry options (optional)
 * @returns {Promise<Object>} Axios response
 */
async function makeKoboRequest(url, token, config = {}, retryOptions = {}) {
  const requestConfig = {
    url,
    method: config.method || 'GET',
    ...config,
    headers: {
      'Authorization': `Token ${token}`,
      ...(config.headers || {}),
    },
  };

  return makeRequestWithRetry(requestConfig, {
    service: 'kobo',
    timeout: 30000, // KoboToolbox exports can be slow
    maxRetries: 3,
    ...retryOptions,
    // Custom retry logic for KoboToolbox
    shouldRetry: (error) => {
      // Don't retry on authentication errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        return false;
      }
      // Use default retryable logic for other errors
      return isDefaultRetryable(error);
    },
  });
}

/**
 * Validate and sanitize MongoDB ObjectId
 *
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId
 */
function isValidObjectId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // MongoDB ObjectId is 24 hex characters
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Validate and sanitize asset ID (KoboToolbox format)
 *
 * @param {string} assetId - Asset ID to validate
 * @returns {boolean} True if valid asset ID
 */
function isValidAssetId(assetId) {
  if (!assetId || typeof assetId !== 'string') {
    return false;
  }
  // KoboToolbox asset IDs are alphanumeric strings
  return /^[a-zA-Z0-9]{20,30}$/.test(assetId);
}

/** KoboToolbox submission ids are integers; anything else could steer a request URL elsewhere. */
function isValidSubmissionId(id) {
  return typeof id === 'string' && /^\d+$/.test(id);
}

/**
 * One request about a survey's form or data, with the survey's stored credentials and a single
 * try: the calling function has 10 s in all.
 *
 * @returns {Promise<Object>|null} The response, or null when the survey has no KoboToolbox credentials
 */
function koboAssetRequest(survey, path, config, timeoutMs) {
  const { api_url: apiUrl, token } = survey.kobo_config || {};
  if (!apiUrl || !token) return null;
  return makeKoboRequest(`${apiUrl}/assets/${survey.asset_id}/${path}`, token, config, { timeout: timeoutMs, maxRetries: 0 });
}

/** {@link koboAssetRequest} about one submission. */
function koboSubmissionRequest(survey, id, path, config, timeoutMs) {
  return koboAssetRequest(survey, `data/${id}/${path}`, config, timeoutMs);
}

/**
 * Sanitize string input (remove potentially dangerous characters)
 *
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum length (default: 1000)
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters (intentional for security)
  // eslint-disable-next-line no-control-regex
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Trim and limit length
  sanitized = sanitized.trim().substring(0, maxLength);

  return sanitized;
}

/**
 * Validate email format
 *
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email validation (not RFC 5322 compliant, but sufficient for most cases)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate username format
 *
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid username
 */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') {
    return false;
  }
  // Allow alphanumeric, underscore, hyphen (3-50 chars)
  return /^[a-zA-Z0-9_-]{3,50}$/.test(username);
}

module.exports = {
  RateLimiter,
  sleep,
  calculateBackoff,
  makeRequestWithRetry,
  makeAirtableRequest,
  makeKoboRequest,
  isValidObjectId,
  isValidAssetId,
  isValidSubmissionId,
  koboAssetRequest,
  koboSubmissionRequest,
  sanitizeString,
  isValidEmail,
  isValidUsername,
  isDefaultRetryable,
};

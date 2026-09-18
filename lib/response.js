/**
 * Standardized Response Helpers for Vercel Serverless Functions
 *
 * This module provides consistent response formatting and error handling
 * for all API endpoints.
 */

/**
 * Send a successful JSON response
 *
 * @param {Object} res - Response object
 * @param {*} data - Data to send
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Response object
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json(data);
}

/**
 * Send an error JSON response
 *
 * @param {Object} res - Response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @returns {Object} Response object
 */
function sendError(res, message, statusCode = 500) {
  console.error(`Error ${statusCode}: ${message}`);
  return res.status(statusCode).json({ error: message });
}

/**
 * Send a 400 Bad Request error
 *
 * @param {Object} res - Response object
 * @param {string} message - Error message
 * @returns {Object} Response object
 */
function sendBadRequest(res, message) {
  return sendError(res, message, 400);
}

/**
 * Send a 401 Unauthorized error
 *
 * @param {Object} res - Response object
 * @param {string} message - Error message (default: 'Authentication required')
 * @returns {Object} Response object
 */
function sendUnauthorized(res, message = 'Authentication required') {
  return sendError(res, message, 401);
}

/**
 * Send a 403 Forbidden error
 *
 * @param {Object} res - Response object
 * @param {string} message - Error message (default: 'Access forbidden')
 * @returns {Object} Response object
 */
function sendForbidden(res, message = 'Access forbidden') {
  return sendError(res, message, 403);
}

/**
 * Send a 404 Not Found error
 *
 * @param {Object} res - Response object
 * @param {string} message - Error message (default: 'Resource not found')
 * @returns {Object} Response object
 */
function sendNotFound(res, message = 'Resource not found') {
  return sendError(res, message, 404);
}

/**
 * Send a 500 Internal Server Error
 *
 * @param {Object} res - Response object
 * @param {Error|string} error - Error object or message
 * @returns {Object} Response object
 */
function sendServerError(res, error) {
  console.error('Server error:', error);
  return sendError(res, 'Internal server error', 500);
}

/**
 * Send detailed error response with structured logging
 * Use this for better debugging in development and production
 *
 * @param {Object} res - Response object
 * @param {string} context - Context where the error occurred (e.g., endpoint name)
 * @param {Error} error - Error object
 * @param {Object} req - Request object (optional) for logging request details
 * @param {number} statusCode - HTTP status code (default: 500)
 * @returns {Object} Response object
 */
function sendDetailedError(res, context, error, req = null, statusCode = 500) {
  // Structured error logging
  const errorLog = {
    timestamp: new Date().toISOString(),
    context,
    error: error?.message || String(error),
    stack: error?.stack,
  };

  // Add request details if provided
  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      user: req.user?.username,
    };

    // Only log body for non-sensitive operations (avoid logging passwords)
    if (req.method !== 'POST' || !req.url.includes('/login')) {
      errorLog.request.body = req.body;
    }
  }

  // Log full error details server-side
  console.error('API Error:', JSON.stringify(errorLog, null, 2));

  // Send sanitized error to client
  const response = {
    success: false,
    error: error?.message || 'Internal server error',
  };

  // Include details only in development mode
  if (process.env.NODE_ENV === 'development') {
    response.details = {
      context,
      stack: error?.stack,
    };
  }

  return res.status(statusCode).json(response);
}

/**
 * Handle method not allowed
 *
 * @param {Object} res - Response object
 * @param {string[]} allowedMethods - Array of allowed HTTP methods
 * @returns {Object} Response object
 */
function sendMethodNotAllowed(res, allowedMethods = []) {
  res.setHeader('Allow', allowedMethods.join(', '));
  return sendError(res, `Method not allowed. Allowed methods: ${allowedMethods.join(', ')}`, 405);
}

/**
 * Custom response headers browser JavaScript is allowed to read cross-origin.
 *
 * A response header is invisible to fetch() across origins unless it is named here — the default
 * safelist covers only a handful of standard headers. Keep every such header in this one list so the
 * CORS contract stays in this file: an endpoint that adds a custom header adds its name here rather
 * than setting Access-Control-Expose-Headers itself.
 *
 * - X-Row-Cap: /api/data-download/explorer-data reports the row cap it applied, so the Data Academy
 *   lesson can tell the learner how many records it loaded without hardcoding the number.
 */
const EXPOSED_HEADERS = ['X-Row-Cap'];

/**
 * Set CORS headers for response
 * Auto-configured for development and Vercel deployments
 *
 * @param {Object} res - Response object
 * @param {Object} req - Request object (optional, for origin checking)
 * @returns {Object} Response object
 */
function setCorsHeaders(res, req = null) {
  const origin = req?.headers?.origin;

  // Development mode: allow all origins
  if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Production mode: allow this project's own deployments plus any configured custom domains.
  else if (origin) {
    // Previously this matched /^https:\/\/.*\.vercel\.app$/ — i.e. ANY vercel.app subdomain,
    // so anyone could deploy a site and have it treated as same-origin. Scoped to deployments
    // of this project: Vercel URLs are `<project>-<hash>-<scope>.vercel.app`, so requiring the
    // project name as a prefix keeps preview deployments working without admitting the world.
    // VERCEL_PROJECT_NAME is provided by Vercel; ALLOWED_ORIGINS covers production domains.
    const projectName = process.env.VERCEL_PROJECT_NAME || process.env.VERCEL_PROJECT_PRODUCTION_URL?.split('.')[0];
    const isOwnVercelDeployment = Boolean(projectName)
      && new RegExp(`^https://${projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]*\\.vercel\\.app$`).test(origin);

    const customOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : [];
    const isCustomDomain = customOrigins.includes(origin);

    if (isOwnVercelDeployment || isCustomDomain) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      console.warn('CORS: Origin not allowed:', origin);
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  return res;
}

/**
 * Handle OPTIONS request for CORS preflight
 *
 * @param {Object} res - Response object
 * @returns {Object} Response object
 */
function handleCorsPreflightRequest(res) {
  setCorsHeaders(res);
  return res.status(200).end();
}

module.exports = {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendServerError,
  sendDetailedError,
  sendMethodNotAllowed,
  setCorsHeaders,
  handleCorsPreflightRequest
};

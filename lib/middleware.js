/**
 * Authentication and Authorization Middleware for Vercel Serverless Functions
 *
 * This module provides middleware functions for authenticating users and
 * authorizing admin-only operations. Works with both Express and Vercel handlers.
 */

const { getDb } = require('./db');
const { verifyToken } = require('./jwt');

/**
 * Authenticate user based on JWT Bearer token
 *
 * This middleware validates the JWT token, fetches the complete user object from MongoDB,
 * and attaches user information to req.user. This eliminates the need for individual
 * endpoints to fetch the user again, improving performance and consistency.
 *
 * The token is verified using the JWT_SECRET environment variable.
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 * @returns {Promise<void>}
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        sessionEnded: true
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid authentication',
        code: error.message.includes('expired') ? 'TOKEN_EXPIRED' : 'AUTH_INVALID',
        sessionEnded: true,
        message: error.message
      });
    }

    // Fetch complete user object from MongoDB
    // This ensures we have fresh permissions and all user fields (including country)
    // JWT payload is minimal (id, username, role, permissions at login time)
    const database = await getDb();
    const user = await database.collection('users').findOne(
      { username: decoded.username },
      {
        projection: {
          password_hash: 0 // Exclude sensitive fields
        }
      }
    );

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        sessionEnded: true
      });
    }

    // Login refuses disabled accounts, but tokens live for 7 days — without this check,
    // deactivating a user left their existing token working for the rest of its lifetime.
    if (!user.active) {
      return res.status(401).json({
        error: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
        sessionEnded: true
      });
    }

    // Attach complete user information to request
    // Endpoints can use req.user directly without additional DB queries
    req.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      country: user.country, // Needed by data download endpoints
      permissions: user.permissions // Fresh permissions (not stale from JWT)
    };

    next();
  } catch (error) {
    // A 401 makes the browser sign the user out, so a database outage must not answer one.
    console.error('Authentication error:', error);
    res.status(503).json({
      error: 'Authentication temporarily unavailable',
      code: 'AUTH_UNAVAILABLE'
    });
  }
}

/**
 * Require admin role (must be used after authenticateUser)
 *
 * This middleware checks if the authenticated user has admin role.
 * Returns 403 Forbidden if user is not an admin.
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 * @returns {void}
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Wrapper for serverless functions to apply middleware
 *
 * This helper allows using Express-style middleware with Vercel serverless functions.
 *
 * @param {Function} handler - The main handler function
 * @param {...Function} middlewares - Middleware functions to apply
 * @returns {Function} Wrapped handler function
 */
function withMiddleware(handler, ...middlewares) {
  return async (req, res) => {
    try {
      // Apply middleware chain
      for (const middleware of middlewares) {
        await new Promise((resolve, reject) => {
          // A middleware that rejects the request (every 401 from authenticateUser, every 403
          // from requireAdmin) responds and returns without calling next(). Waiting only on
          // next() left that promise permanently unsettled, so the invocation never finished
          // even though the client had its response. Settling on a sent response fixes it.
          const done = (error) => (error ? reject(error) : resolve());
          const result = middleware(req, res, done);
          Promise.resolve(result)
            .then(() => { if (res.headersSent) resolve(); })
            .catch(reject);
        });

        // Middleware short-circuited the request - stop, don't run the handler.
        if (res.headersSent) return;
      }

      // Execute main handler
      return await handler(req, res);
    } catch (error) {
      console.error('Middleware error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

module.exports = {
  authenticateUser,
  requireAdmin,
  withMiddleware
};

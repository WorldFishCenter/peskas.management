/**
 * POST /api/auth/login
 *
 * Authenticate user with username and password
 * Returns user object on successful login
 */

const bcrypt = require('bcryptjs');
const { getDb } = require('../../lib/db');
const { generateToken } = require('../../lib/jwt');
const { sendBadRequest, sendServerError, setCorsHeaders } = require('../../lib/response');
const { sanitizeString } = require('../../lib/api-utils');
const { logAuditEvent } = require('../../lib/audit-logger');
const { isWithinLimit, recordFailure, clearLimit } = require('../../lib/rate-limit');

/**
 * Brute-force protection for login.
 *
 * Keyed on the submitted identifier rather than the client IP on purpose: field offices in
 * Kenya, Mozambique and Zanzibar share outbound addresses, so an IP-keyed limit would lock out
 * a whole office when one person fumbles a password. Only *failed* attempts count, and a
 * successful login clears the counter, so a user who eventually gets it right is never blocked.
 *
 * The limiter fails open — see lib/rate-limit.js. It is defence-in-depth, not the security
 * boundary, and must not become a way to take the portal down.
 */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_TYPE = 'login_failures';

module.exports = async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(res, req);

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username: rawIdentifier, password } = req.body;

    // Validate input types
    if (!rawIdentifier || typeof rawIdentifier !== 'string' || !password || typeof password !== 'string') {
      return sendBadRequest(res, 'Username/email and password required');
    }

    // Sanitize identifier (username or email)
    const identifier = sanitizeString(rawIdentifier, 100).toLowerCase();

    // Validate identifier length
    if (identifier.length < 1 || identifier.length > 100) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Validate password length (don't sanitize passwords!)
    if (password.length < 1 || password.length > 200) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Checked before the database lookup and before bcrypt, so a flood of guesses is cheap to
    // reject.
    const limit = await isWithinLimit(identifier, LOGIN_LIMIT_TYPE, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed login attempts. Please try again later.',
        retryAfter: limit.retryAfter
      });
    }

    // Get database connection
    const database = await getDb();
    if (!database) {
      console.error('Database not configured');
      return sendServerError(res, 'Authentication system not configured');
    }

    // Find user by username OR email
    const user = await database.collection('users').findOne({
      $or: [
        { username: identifier },
        { email: identifier }
      ]
    });

    if (!user) {
      await logAuditEvent(database, { username: identifier, user_id: null, category: 'auth', action: 'login_failure', status: 'failure', details: { attempted_username: identifier, reason: 'user_not_found' }, req });
      await recordFailure(identifier, LOGIN_LIMIT_TYPE, LOGIN_WINDOW_MS);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Check if user is active
    if (!user.active) {
      await logAuditEvent(database, { username: user.username, user_id: user._id.toString(), category: 'auth', action: 'login_failure', status: 'failure', details: { reason: 'account_disabled' }, req });
      await recordFailure(identifier, LOGIN_LIMIT_TYPE, LOGIN_WINDOW_MS);
      return res.status(401).json({ success: false, code: 'ACCOUNT_DISABLED', error: 'Account is disabled' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      await logAuditEvent(database, { username: user.username, user_id: user._id.toString(), category: 'auth', action: 'login_failure', status: 'failure', details: { reason: 'wrong_password' }, req });
      await recordFailure(identifier, LOGIN_LIMIT_TYPE, LOGIN_WINDOW_MS);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Password verified - drop any accumulated failure count so a user who eventually
    // gets it right is never left throttled.
    await clearLimit(identifier, LOGIN_LIMIT_TYPE);

    // Generate JWT token
    const token = generateToken(user);

    // Update last_login timestamp
    await database.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    // Return user object (exclude password_hash) and JWT token
    const userResponse = {
      id: user._id.toString(),
      username: user.username,
      name: user.name,
      country: user.country,
      role: user.role,
      active: user.active,
      permissions: user.permissions,
      language: user.language || 'en', // Include language preference (default to 'en')
      created_at: user.created_at,
      last_login: new Date()
    };

    await logAuditEvent(database, { username: user.username, user_id: user._id.toString(), category: 'auth', action: 'login_success', status: 'success', details: {}, req });

    return res.status(200).json({
      success: true,
      token,
      user: userResponse,
      expiresIn: process.env.JWT_EXPIRY || '7d'
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
};

/**
 * Helper Utilities for Multi-Survey Architecture
 *
 * This module provides utility functions for working with dynamic collection names
 * and survey-specific data in the management platform.
 */

const { ObjectId } = require('mongodb');
const { isValidAssetId } = require('./api-utils');

/**
 * Get the survey flags collection name for a specific survey
 *
 * The asset ID is interpolated into a collection name, so it is validated here rather than
 * relying on every caller to do it. Callers are permission-checked as well; this is the
 * backstop that makes the injection vector structurally impossible.
 *
 * @param {string} assetId - KoboToolbox asset ID
 * @returns {string} Collection name in format: surveys_flags-{assetId}
 * @throws {Error} If assetId is missing or not a well-formed asset ID
 */
const getSurveyFlagsCollection = (assetId) => {
  if (!isValidAssetId(assetId)) {
    throw new Error('Asset ID is required for survey flags collection');
  }
  return `surveys_flags-${assetId}`;
};

/**
 * Validate and convert string to ObjectId
 * Prevents server crashes from invalid ObjectId formats
 *
 * @param {string} id - The ID string to validate and convert
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {ObjectId} Valid MongoDB ObjectId
 * @throws {Error} If ID is missing or invalid format
 */
function validateObjectId(id, fieldName = 'ID') {
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} is required`);
  }

  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${fieldName} format`);
  }

  return new ObjectId(id);
}

/**
 * Sanitize CSV data to prevent formula injection attacks
 * Neutralizes cells starting with a dangerous character: `=` `+` `-` `at-sign` tab or CR
 *
 * @param {string} csvData - Raw CSV data string
 * @returns {string} Sanitized CSV data
 */
function sanitizeCSV(csvData) {
  if (!csvData || typeof csvData !== 'string') {
    return csvData;
  }

  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  const lines = csvData.split('\n');

  return lines.map(line => {
    // Parse CSV line handling quoted values
    const cells = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
        currentCell += char;
      } else if (char === ',' && !insideQuotes) {
        cells.push(currentCell);
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell); // Add last cell

    // Sanitize each cell
    const sanitizedCells = cells.map(cell => {
      const trimmed = cell.trim();

      // Check if cell starts with a dangerous character
      if (dangerousChars.some(char => trimmed.startsWith(char))) {
        // If already quoted, add single quote inside quotes
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return '"' + "'" + trimmed.substring(1);
        }
        // Otherwise, prefix with single quote and quote the whole value
        return '"' + "'" + trimmed + '"';
      }

      return cell;
    });

    return sanitizedCells.join(',');
  }).join('\n');
}

/**
 * Escape a string for safe use as a MongoDB $regex pattern (prevents ReDoS)
 *
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return true if the string parses to a valid date
 *
 * @param {string} str - The date string to validate
 * @returns {boolean}
 */
function isValidDate(str) {
  return !isNaN(new Date(str).getTime());
}

/**
 * The validation statuses a submission may be set to.
 *
 * These are KoboToolbox's own status uids, and they are the single list for both write paths:
 * `api/submissions/[id]/validation-status.js` (MongoDB) and
 * `api/kobo/validation-status/[id].js` (KoboToolbox). The two previously kept separate lists
 * that disagreed — the Mongo side accepted `on_hold` and the Kobo side rejected it — so a
 * status the first endpoint stored happily was refused by the second, leaving the two systems
 * holding different values.
 *
 * `validation_status_on_hold` is also what `api/kobo/submissions.js` reports for a submission
 * that has never been validated, so it must be a legal value here.
 */
const VALIDATION_STATUSES = [
  'validation_status_approved',
  'validation_status_not_approved',
  'validation_status_on_hold'
];

/**
 * Values the R pipeline writes into `submitted_by` when it could not identify the enumerator.
 *
 * A row carrying one of these is not a person and must never become a row in the performance
 * ranking. `"undefined"` — the literal string — is the one that actually occurs: 4,479 rows in
 * `enumerators_stats-aNKjDfXDKyW3JLtaCdxDp5` and 382 in the Mozambique collection, verified
 * against production. `"Unknown"` appears in no collection but was what the original client-side
 * guard checked for, which is why that guard never fired.
 */
const PLACEHOLDER_ENUMERATORS = ['Unknown', 'undefined', 'null', 'NA', ''];

/**
 * Return true if the value is a well-formed password-reset token.
 *
 * Tokens are generated as `crypto.randomBytes(32).toString('hex')`, so a valid one is
 * always exactly 64 lowercase hex characters. The type check is load-bearing: a JSON body
 * can supply an object such as `{"$gt": ""}`, which MongoDB would treat as a query operator
 * and match an arbitrary user's token.
 *
 * @param {*} token - Untrusted value from a request body or query string
 * @returns {boolean}
 */
function isValidResetToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

/**
 * Maximum accepted password length.
 *
 * bcrypt only consumes the first 72 bytes, so anything beyond this adds no security while
 * letting a caller hand the hasher an unbounded string. Every endpoint that hashes or
 * compares a password enforces this same bound.
 */
const MAX_PASSWORD_LENGTH = 200;

/**
 * Validate a user-supplied password against the shared length policy.
 *
 * @param {*} password - Untrusted value from a request body
 * @returns {string|null} An error message, or null if the password is acceptable
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return 'Password must be a string';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

module.exports = {
  getSurveyFlagsCollection,
  validateObjectId,
  sanitizeCSV,
  escapeRegex,
  isValidDate,
  isValidResetToken,
  validatePassword,
  MAX_PASSWORD_LENGTH,
  VALIDATION_STATUSES,
  PLACEHOLDER_ENUMERATORS,
};

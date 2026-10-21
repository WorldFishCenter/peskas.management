/**
 * POST /api/admin/sync-users
 *
 * Sync users from Airtable (Admin only)
 * Requires authentication + admin role
 *
 * Can be used:
 * 1. Via API endpoint (this file) - works locally and in Vercel
 * 2. Via CLI: node scripts/sync_users_from_airtable.cjs
 */

const { withMiddleware, authenticateUser, requireAdmin } = require('../../lib/middleware');
const { setCorsHeaders } = require('../../lib/response');
const { syncUsersFromAirtable } = require('../../lib/airtable-sync');

async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await syncUsersFromAirtable();

    return res.json({
      success: true,
      message: 'Users synced successfully from Airtable',
      created: result.created,
      updated: result.updated,
      deleted: result.deleted,
      skipped: result.skipped,
      total: result.total,
      // Don't return passwords in API response for security
      passwordsGenerated: result.generatedPasswords ? result.generatedPasswords.length : 0
    });
  } catch (error) {
    console.error('Sync users error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to sync users from Airtable: ${error.message}`,
      message: error.message
    });
  }
}

module.exports = withMiddleware(handler, authenticateUser, requireAdmin);

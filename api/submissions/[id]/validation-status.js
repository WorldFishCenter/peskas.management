/**
 * PATCH /api/submissions/:id/validation-status
 *
 * Record a reviewer's decision: MongoDB first, then KoboToolbox.
 * Body: { validation_status, asset_id, expected_status?, expected_validated_at? }
 * Requires authentication
 */

const { withMiddleware, authenticateUser } = require('../../../lib/middleware');
const { getDb } = require('../../../lib/db');
const { getSurveyFlagsCollection, VALIDATION_STATUSES } = require('../../../lib/helpers');
const { getAccessibleSurveys } = require('../../../lib/filter-permissions');
const { koboSubmissionRequest, isValidSubmissionId } = require('../../../lib/api-utils');
const { sendBadRequest, sendForbidden, sendNotFound, sendServerError, setCorsHeaders } = require('../../../lib/response');
const { logAuditEvent } = require('../../../lib/audit-logger');

// One short attempt: the function stops at 10 s, and the decision already counts once in MongoDB.
const KOBO_TIMEOUT_MS = 4000;

/**
 * Copy the decision to KoboToolbox. Never throws.
 *
 * @returns {Promise<'updated'|'failed'|'skipped'>}
 */
async function pushToKobo(survey, id, validationStatus) {
  const request = koboSubmissionRequest(survey, id, 'validation_status/', {
    method: 'PATCH',
    data: { 'validation_status.uid': validationStatus },
    headers: { 'Content-Type': 'application/json' }
  }, KOBO_TIMEOUT_MS);
  if (!request) return 'skipped';
  try {
    await request;
    return 'updated';
  } catch (error) {
    console.error('KoboToolbox validation status push failed:', error.response?.status || error.message);
    return 'failed';
  }
}

async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let database;
  try {
    const id = req.query.id;
    const { validation_status, asset_id } = req.body;

    if (!isValidSubmissionId(id)) {
      return sendBadRequest(res, 'Invalid submission id');
    }

    if (!asset_id) {
      return sendBadRequest(res, 'asset_id is required');
    }

    if (!VALIDATION_STATUSES.includes(validation_status)) {
      return sendBadRequest(res, 'Invalid validation_status value');
    }

    database = await getDb();

    // The asset_id names the collection that gets written to, so it must be one of the
    // surveys this user may touch.
    const accessibleSurveys = await getAccessibleSurveys(req.user);
    const survey = accessibleSurveys.find(s => s.asset_id === asset_id);
    if (!survey) {
      return sendForbidden(res, 'You do not have access to the requested survey.');
    }

    const collection = database.collection(getSurveyFlagsCollection(asset_id));

    // The R pipeline writes `submission_id` as a number in some surveys and a string in others.
    const idFilter = { submission_id: { $in: [id, Number(id)] } };

    // The decision the reviewer saw (status and when it was made): if someone decided since,
    // refuse rather than overwrite. The table shows a missing or empty status as on hold.
    let guard = {};
    if ('expected_status' in req.body) {
      const expected = req.body.expected_status ?? null;
      const seenAt = req.body.expected_validated_at ?? null;
      guard = {
        validation_status: { $in: expected === 'validation_status_on_hold' ? [expected, null, ''] : [expected] },
        validated_at: { $in: typeof seenAt === 'string' && !Number.isNaN(Date.parse(seenAt)) ? [new Date(seenAt), seenAt] : [seenAt] }
      };
    }

    const validatedAt = new Date();
    const before = await collection.findOneAndUpdate(
      { ...idFilter, ...guard },
      { $set: { validation_status, validated_at: validatedAt, validated_by: req.user.username } },
      { returnDocument: 'before' }
    );

    if (!before) {
      const current = await collection.findOne(idFilter, { projection: { validation_status: 1, validated_by: 1, validated_at: 1 } });
      if (!current) {
        return sendNotFound(res, `Submission ${id} not found in the selected survey`);
      }
      return res.status(409).json({
        success: false,
        code: 'STATUS_CHANGED',
        error: 'This submission was changed by someone else after you opened it.',
        current: {
          validation_status: current.validation_status ?? null,
          validated_by: current.validated_by ?? null,
          validated_at: current.validated_at ?? null
        }
      });
    }

    const kobo = await pushToKobo(survey, id, validation_status);

    await logAuditEvent(database, {
      username: req.user.username,
      user_id: req.user.id,
      category: 'validation',
      action: 'validation_status_changed',
      status: 'success',
      details: { submission_id: id, survey_asset_id: asset_id, from_status: before.validation_status || null, to_status: validation_status, kobo },
      req
    });

    return res.json({
      success: true,
      kobo,
      current: { validation_status, validated_by: req.user.username, validated_at: validatedAt }
    });
  } catch (error) {
    if (database) {
      await logAuditEvent(database, {
        username: req.user?.username || null,
        user_id: req.user?.id || null,
        category: 'validation',
        action: 'validation_status_changed',
        status: 'failure',
        details: { submission_id: req.query.id, survey_asset_id: req.body?.asset_id || null },
        req
      }).catch(() => {});
    }
    console.error('Error updating validation status:', error);
    return sendServerError(res, 'Failed to update validation status');
  }
}

module.exports = withMiddleware(handler, authenticateUser);

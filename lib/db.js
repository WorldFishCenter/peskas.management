/**
 * MongoDB Connection Singleton for Vercel Serverless Functions
 *
 * One client per function instance, reused across warm invocations.
 */

const { MongoClient } = require('mongodb');
const { ensureAuditIndexes } = require('./audit-logger');

// The connection attempt, not its result: requests arriving together on a fresh instance share
// one client instead of each opening its own.
let connecting = null;

/**
 * Connect to MongoDB with connection caching for serverless environments
 *
 * @returns {Promise<{db: import('mongodb').Db, client: MongoClient}>} database and client
 */
function connectToDatabase() {
  if (!connecting) {
    connecting = openConnection().catch(error => {
      connecting = null; // let the next request try again
      throw error;
    });
  }
  return connecting;
}

async function openConnection() {
  const uri = process.env.MONGODB_VALIDATION_URI;
  const dbName = process.env.MONGODB_VALIDATION_DB;

  if (!uri) {
    throw new Error('MONGODB_VALIDATION_URI environment variable is not set');
  }

  if (!dbName) {
    throw new Error('MONGODB_VALIDATION_DB environment variable is not set. Please set it in your .env file.');
  }

  try {
    // Vercel freezes an instance between requests, and a connection idle across a freeze may be
    // dead when it thaws. A short idle limit makes the driver open a fresh one instead, and the
    // other limits make a hung call fail and retry well inside the 10 s function limit.
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      maxIdleTimeMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
      w: 'majority', // Write concern: wait for majority acknowledgement
    });

    await client.connect();
    const db = client.db(dbName);

    // Audit indexes are declared once, in lib/audit-logger.js. Kept non-blocking: production has
    // no startup hook, so a cold connection is the only chance to create them.
    ensureAuditIndexes(db).catch(() => {});

    console.log(`✓ Connected to MongoDB: ${dbName}`);

    return { db, client };
  } catch (error) {
    console.error('MongoDB connection error:', error);

    // `cause` keeps the driver's original error (and its stack) reachable — the friendlier
    // message is for the operator, not a replacement for the diagnosis.
    if (error.message.includes('authentication')) {
      throw new Error('MongoDB authentication failed. Check MONGODB_VALIDATION_URI credentials.', { cause: error });
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      throw new Error('MongoDB server not reachable. Check network connection and MONGODB_VALIDATION_URI.', { cause: error });
    } else if (error.message.includes('timeout')) {
      throw new Error('MongoDB connection timeout. Server may be overloaded or unreachable.', { cause: error });
    }

    throw error;
  }
}

/**
 * Helper to get database instance (compatibility with existing code)
 *
 * @returns {Promise<import('mongodb').Db>} MongoDB database instance
 */
async function getDb() {
  const { db } = await connectToDatabase();
  return db;
}

module.exports = {
  connectToDatabase,
  getDb
};

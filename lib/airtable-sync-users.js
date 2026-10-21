/**
 * Airtable User Sync - Shared Implementation
 *
 * Centralized user sync logic used by CLI scripts and API endpoints.
 * Syncs users from Airtable 'validation' table to MongoDB 'users' collection.
 *
 * Features:
 * - GAUL codes (district permissions) support
 * - Email field support
 * - Survey permissions
 * - Enumerator permissions
 * - Auto-generated passwords for new users
 *
 * @module lib/airtable-sync-users
 */

// `.default`: axios's CJS build sets `module.exports.default = axios`, and it is the
// callable the type definitions describe. Plain `require('axios')` types as the module
// namespace, so `axios.get` is not visible to checkJs.
/** @type {import('axios').AxiosStatic} */
const axios = require('axios').default;
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { rateLimiter, fetchWithRetry } = require('./airtable-rate-limiter');

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

/**
 * Generate a random password
 */
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Fetch all records from an Airtable table with pagination
 * Includes rate limiting and automatic retry on errors
 */
async function fetchAirtableTable(tableName) {
  const allRecords = [];
  let offset = null;

  try {
    do {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}${offset ? `?offset=${offset}` : ''}`;

      // Wrap API call with rate limiting and retry logic
      const response = await fetchWithRetry(async () => {
        await rateLimiter.wait();
        return await axios.get(url, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
        });
      });

      allRecords.push(...response.data.records);
      offset = response.data.offset;
    } while (offset);

    return allRecords;
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Build mapping from Airtable form record IDs to KoboToolbox asset IDs
 */
async function buildFormIdMapping() {
  const formsRecords = await fetchAirtableTable('forms');

  const mapping = {};
  formsRecords.forEach(record => {
    const airtableRecordId = record.id;
    const koboFormId = record.fields['Form ID'];

    if (koboFormId) {
      mapping[airtableRecordId] = koboFormId;
    }
  });

  return mapping;
}

/**
 * Build mapping from Airtable country record IDs to country codes
 */
async function buildCountryMapping() {
  const countriesRecords = await fetchAirtableTable('countries');

  const mapping = {};
  countriesRecords.forEach(record => {
    const airtableRecordId = record.id;
    const countryCode = record.fields['Country'];

    if (countryCode) {
      mapping[airtableRecordId] = countryCode;
    }
  });

  return mapping;
}

/**
 * Build mapping from Airtable enumerator record IDs to Kobo usernames
 */
async function buildEnumeratorMapping() {
  const enumeratorsRecords = await fetchAirtableTable('enumerators');

  const mapping = {};
  enumeratorsRecords.forEach(record => {
    const airtableRecordId = record.id;
    const koboUsername = record.fields['Kobo Username'];

    if (koboUsername) {
      mapping[airtableRecordId] = koboUsername.trim();
    }
  });

  return mapping;
}

/**
 * Build mapping from Airtable validation record IDs to GAUL codes
 *
 * This requires:
 * 1. Fetching districts table to map district record IDs to GAUL codes
 * 2. Fetching validation table to map user record IDs to district IDs
 * 3. Combining to get user record ID → GAUL codes array
 */
async function buildGaulCodeMapping() {
  // First, fetch districts table to map record IDs to GAUL codes
  const districtRecords = await fetchAirtableTable('districts');
  const districtIdToGaulCode = {};

  districtRecords.forEach(record => {
    const districtId = record.id;
    const gaulCode = record.fields['Gaul 2 Code'] || record.fields['gaul_2'] || record.fields['Gaul 2'];
    if (gaulCode) {
      districtIdToGaulCode[districtId] = String(gaulCode);
    }
  });

  // Now fetch validation table and map user record IDs to GAUL codes
  const validationRecords = await fetchAirtableTable('validation');
  const mapping = {};

  validationRecords.forEach(record => {
    const airtableRecordId = record.id;
    const districtIds = record.fields['gaul 2'] || [];

    // Map district IDs to actual GAUL codes
    const gaulCodes = districtIds
      .map(districtId => districtIdToGaulCode[districtId])
      .filter(code => code !== undefined);

    if (gaulCodes.length > 0) {
      mapping[airtableRecordId] = gaulCodes;
    }
  });

  return mapping;
}

/**
 * Map Airtable record to user object
 */
function mapAirtableToUser(record, formIdMapping, countryMapping, enumeratorMapping, gaulCodeMapping) {
  const fields = record.fields;

  // Map permission to role
  let role = 'user';
  if (fields.permission === 'Admin') {
    role = 'admin';
  } else if (fields.permission === 'Manager') {
    role = 'user';
  }

  // Extract asset IDs from Airtable and convert to KoboToolbox Form IDs
  const airtableAssetIds = fields.asset || [];
  const koboAssetIds = airtableAssetIds
    .map(airtableId => formIdMapping[airtableId])
    .filter(id => id !== undefined);

  // Map country record IDs to country codes
  const airtableCountryIds = fields.country || [];
  const countryCodes = airtableCountryIds
    .map(countryId => countryMapping[countryId])
    .filter(code => code !== undefined);

  // Map enumerator record IDs to enumerator names
  const airtableEnumeratorIds = fields.enumerators || [];
  const enumeratorNames = airtableEnumeratorIds
    .map(enumeratorId => enumeratorMapping[enumeratorId])
    .filter(name => name !== undefined);

  // Extract and validate email
  const email = fields.email || fields.Email;
  const normalizedEmail = email ? email.toLowerCase().trim() : null;

  // Extract GAUL codes for data download permissions
  const airtableRecordId = record.id;
  const gaulCodes = gaulCodeMapping[airtableRecordId] || [];

  return {
    username: fields.username ? fields.username.toLowerCase().trim() : '',
    email: normalizedEmail,
    name: fields.user || fields.username,
    country: countryCodes,
    role: role,
    permissions: {
      surveys: koboAssetIds,
      enumerators: enumeratorNames,
      gaul_codes: gaulCodes
    }
  };
}

/**
 * Sync users from Airtable to MongoDB
 *
 * @param {Object} [options] - Sync options
 * @param {boolean} [options.verbose] - Enable verbose logging (default: true)
 * @returns {Promise<Object>} Result object with created, updated, deleted, skipped counts
 *
 * @example
 * const results = await syncUsersFromAirtable({ verbose: true });
 * console.log(`Created: ${results.created}, Updated: ${results.updated}`);
 */
async function syncUsersFromAirtable(options = {}) {
  const { verbose = true } = options;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
    throw new Error('AIRTABLE_BASE_ID and AIRTABLE_TOKEN must be set in environment variables');
  }

  try {
    // Build mappings from related tables
    if (verbose) console.log('\nBuilding form ID mapping...');
    const formIdMapping = await buildFormIdMapping();

    if (verbose) console.log('Building country mapping...');
    const countryMapping = await buildCountryMapping();

    if (verbose) console.log('Building enumerator mapping...');
    const enumeratorMapping = await buildEnumeratorMapping();

    if (verbose) console.log('Building GAUL code mapping...');
    const gaulCodeMapping = await buildGaulCodeMapping();

    // Get MongoDB database connection
    const db = await getDb();
    const usersCollection = db.collection('users');

    // Fetch validation records from Airtable
    if (verbose) console.log('Fetching validation records from Airtable...');
    const airtableRecords = await fetchAirtableTable('validation');

    // Two rows with one username would both write to one account (or clash on the unique email
    // index halfway through). Stop before writing anything and name them so Airtable gets fixed.
    const usernames = airtableRecords
      .map(record => record.fields.username?.toLowerCase().trim())
      .filter(Boolean);
    const duplicates = [...new Set(usernames.filter((username, i) => usernames.indexOf(username) !== i))];
    if (duplicates.length > 0) {
      throw new Error(`Duplicate usernames in Airtable 'validation' table: ${duplicates.join(', ')}`);
    }

    if (verbose) console.log(`\n=== Starting User Sync ===`);
    if (verbose) console.log(`Found ${airtableRecords.length} records in Airtable\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const generatedPasswords = [];

    for (const record of airtableRecords) {
      const userData = mapAirtableToUser(record, formIdMapping, countryMapping, enumeratorMapping, gaulCodeMapping);

      if (!userData.username) {
        if (verbose) console.log(`⚠️  Skipping record ${record.id} - missing username`);
        skipped++;
        continue;
      }

      // Check if user already exists
      const existingUser = await usersCollection.findOne({
        username: userData.username
      });

      if (existingUser) {
        // Update existing user - preserve password, update role, permissions, name, country, and email
        await usersCollection.updateOne(
          { username: userData.username },
          {
            $set: {
              email: userData.email,
              name: userData.name,
              country: userData.country,
              role: userData.role,
              permissions: userData.permissions,
              updated_at: new Date(),
              updated_by: 'airtable_sync'
            }
          }
        );

        if (verbose) {
          console.log(`✓ Updated: ${userData.username} (${userData.name}, ${userData.email || 'no email'}, ${userData.role}, ${userData.permissions.surveys.length} surveys, ${userData.permissions.enumerators.length} enumerators, ${userData.permissions.gaul_codes.length} GAUL codes)`);
        }
        updated++;
      } else {
        // Create new user with auto-generated password
        const password = generatePassword();
        const password_hash = await bcrypt.hash(password, 10);

        const newUser = {
          username: userData.username,
          email: userData.email,
          name: userData.name,
          country: userData.country,
          role: userData.role,
          password_hash: password_hash,
          permissions: userData.permissions,
          active: true,
          created_at: new Date(),
          created_by: 'airtable_sync'
        };

        await usersCollection.insertOne(newUser);

        if (verbose) {
          console.log(`✓ Created: ${userData.username} (${userData.name}, ${userData.email || 'no email'}, ${userData.role}, ${userData.permissions.surveys.length} surveys, ${userData.permissions.enumerators.length} enumerators, ${userData.permissions.gaul_codes.length} GAUL codes)`);
          console.log(`  Temporary password generated (securely stored)`);
        }
        generatedPasswords.push({ username: userData.username, password });
        created++;
      }
    }

    // Delete users that exist in MongoDB but not in Airtable
    const airtableUsernames = airtableRecords
      .map(record => record.fields.username)
      .filter(username => username)
      .map(username => username.toLowerCase().trim());

    const usersToDelete = await usersCollection.find({
      username: { $nin: airtableUsernames },
      created_by: 'airtable_sync'
    }).toArray();

    let deleted = 0;
    if (usersToDelete.length > 0) {
      if (verbose) console.log('\n=== Removing users not in Airtable ===');
      for (const user of usersToDelete) {
        await usersCollection.deleteOne({ _id: user._id });
        if (verbose) console.log(`✗ Deleted: ${user.username} (no longer in Airtable)`);
        deleted++;
      }
    }

    if (verbose) {
      console.log('\n=== Sync Complete ===');
      console.log(`Created: ${created} users`);
      console.log(`Updated: ${updated} users`);
      console.log(`Deleted: ${deleted} users`);
      console.log(`Skipped: ${skipped} records`);
      console.log(`Total processed: ${airtableRecords.length}`);
    }

    return {
      created,
      updated,
      deleted,
      skipped,
      failed: 0,
      total: airtableRecords.length,
      generatedPasswords
    };

  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}

module.exports = {
  syncUsersFromAirtable,
  generatePassword,
  fetchAirtableTable,
  buildFormIdMapping,
  buildCountryMapping,
  buildEnumeratorMapping,
  buildGaulCodeMapping,
  mapAirtableToUser
};

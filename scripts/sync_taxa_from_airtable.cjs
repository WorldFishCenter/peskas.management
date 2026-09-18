/**
 * Sync Taxa (FAO ASFIS species codes) from Airtable to MongoDB
 *
 * Usage: node scripts/sync_taxa_from_airtable.cjs
 *
 * Why this script exists
 * ----------------------
 * The Data Download "Species Filter" takes a 3-letter FAO ASFIS code (`catch_taxon`), which
 * nobody remembers. The Airtable `taxa` table already holds the code → name mapping used to
 * build the forms, so this mirrors it into a `taxa` collection that
 * `/api/data-download/metadata` serves as picker options.
 *
 * Deduplication
 * -------------
 * Airtable stores one row per (form, species): ~1600 rows for ~950 distinct codes. Rows are
 * collapsed to one document per `alpha3_code`, unioning the countries the code appears in.
 * Where two rows disagree on the names (only ever capitalisation — "Wolf-herrings nei" vs
 * "…NEI"), the first row wins; picking a winner matters only for display. Family and order are
 * normalised to Title Case rather than left to that coin flip, because family is displayed and
 * three spellings of one family would read as three families.
 *
 * Never deletes. A code that disappears from Airtable is marked `active: false`, which drops
 * it from the picker without losing the row.
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const { toCanonicalCountry } = require('../lib/country-codes');

// Before the next require: lib/airtable-sync-users reads AIRTABLE_BASE_ID/AIRTABLE_TOKEN into
// module-scope consts at load time. scripts/sync_users_from_airtable.js orders it the same way.
dotenv.config();

// The shared paginator, which also rate-limits and retries — three other sync scripts each grew
// their own copy of this loop and only the shared one backs off on a 429.
const { fetchAirtableTable } = require('../lib/airtable-sync-users');

const MONGODB_URI = process.env.MONGODB_VALIDATION_URI;
const MONGODB_DB = process.env.MONGODB_VALIDATION_DB;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Airtable spells "no value" as the literal string "NA" in all four name columns (35 families,
// 37 English names). Left alone it reaches the picker as a family called "Na".
const text = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.toUpperCase() === 'NA' ? '' : trimmed;
};

/**
 * Family and order arrive in three capitalisations across rows ("SERRANIDAE", "Serranidae",
 * "chirocentridae"). Normalise to the taxonomic convention so the species picker does not
 * shout, and so first-row-wins dedup cannot give two codes different spellings of one family.
 */
const taxonCase = (value) =>
  value.toLowerCase().replace(/[a-z]+/g, (word) => word[0].toUpperCase() + word.slice(1));

/**
 * Collapse Airtable taxa rows into one document per FAO code.
 *
 * Pure so it can be tested without Airtable or MongoDB — see sync_taxa_from_airtable.test.cjs.
 *
 * @param {Array<{fields: Object}>} records - Raw Airtable records
 * @returns {Array<Object>} Taxon documents, sorted by code
 */
function buildTaxonDocs(records) {
  const byCode = new Map();

  for (const record of records) {
    const fields = record.fields || {};
    const code = text(fields.alpha3_code).toUpperCase();
    // The download API rejects anything that is not a 3-letter code, so a malformed row here
    // would only ever produce an unusable picker entry.
    if (!/^[A-Z]{3}$/.test(code)) continue;

    const country = toCanonicalCountry(fields.country);
    const existing = byCode.get(code);

    if (existing) {
      if (country && !existing.country_ids.includes(country)) {
        existing.country_ids.push(country);
      }
      continue;
    }

    byCode.set(code, {
      alpha3_code: code,
      scientific_name: text(fields.scientific_name),
      english_name: text(fields.english_name),
      family: taxonCase(text(fields.family)),
      order: taxonCase(text(fields.order)),
      country_ids: country ? [country] : []
    });
  }

  const docs = [...byCode.values()];
  for (const doc of docs) doc.country_ids.sort();
  return docs.sort((a, b) => a.alpha3_code.localeCompare(b.alpha3_code));
}

async function main() {
  if (!MONGODB_URI || !MONGODB_DB) {
    console.error('❌ ERROR: MONGODB_VALIDATION_URI and MONGODB_VALIDATION_DB must be set');
    process.exit(1);
  }

  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
    console.error('❌ ERROR: AIRTABLE_BASE_ID and AIRTABLE_TOKEN must be set');
    process.exit(1);
  }

  console.log('🐟 Syncing taxa from Airtable...\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    console.log(`✓ Connected to MongoDB: ${MONGODB_DB}\n`);

    console.log('Fetching taxa from Airtable...');
    const records = await fetchAirtableTable('taxa');
    console.log(`✓ Found ${records.length} records in taxa`);

    const docs = buildTaxonDocs(records);

    if (docs.length === 0) {
      throw new Error('Airtable returned no usable taxa — refusing to deactivate the collection');
    }

    console.log(`\n${records.length} rows → ${docs.length} distinct FAO codes\n`);

    const taxa = db.collection('taxa');
    await taxa.createIndex({ alpha3_code: 1 }, { unique: true });
    // Matches getAccessibleTaxa: {active, country_ids: $in} sorted by alpha3_code.
    await taxa.createIndex({ active: 1, country_ids: 1, alpha3_code: 1 });

    const now = new Date();
    const result = await taxa.bulkWrite(
      docs.map((doc) => ({
        updateOne: {
          filter: { alpha3_code: doc.alpha3_code },
          update: {
            $set: { ...doc, active: true, updated_at: now, updated_by: 'sync_taxa_script' }
          },
          upsert: true
        }
      }))
    );

    const retired = await taxa.updateMany(
      { alpha3_code: { $nin: docs.map((d) => d.alpha3_code) }, active: true },
      { $set: { active: false, updated_at: now, updated_by: 'sync_taxa_script' } }
    );

    const byCountry = {};
    for (const doc of docs) {
      for (const country of doc.country_ids) {
        byCountry[country] = (byCountry[country] || 0) + 1;
      }
    }

    console.log(`  + ${result.upsertedCount} created`);
    console.log(`  ~ ${result.modifiedCount} updated`);
    console.log(`  - ${retired.modifiedCount} deactivated (no longer in Airtable)`);
    console.log('\nCodes per country:');
    for (const [country, count] of Object.entries(byCountry).sort()) {
      console.log(`  ${country.padEnd(12)} ${count}`);
    }
    console.log('\n✅ Taxa sync complete');
  } catch (error) {
    console.error('\n❌ Taxa sync failed:', error.response?.data || error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

module.exports = { buildTaxonDocs };

if (require.main === module) {
  main();
}

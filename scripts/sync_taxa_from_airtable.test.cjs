/**
 * Checks buildTaxonDocs() — the only non-trivial part of the taxa sync: collapsing ~1600
 * per-form Airtable rows into one document per FAO code without losing a country.
 *
 * Run: node scripts/sync_taxa_from_airtable.test.cjs
 */

const assert = require('assert');
const { buildTaxonDocs } = require('./sync_taxa_from_airtable.cjs');

const docs = buildTaxonDocs([
  { fields: { alpha3_code: 'GIT', scientific_name: 'Penaeus monodon', english_name: 'Giant tiger prawn', family: 'PENAEIDAE', order: 'NATANTIA', country: 'Kenya' } },
  // Same code, different form/country, and a capitalisation variant of the names.
  { fields: { alpha3_code: 'git', english_name: 'Giant Tiger Prawn', scientific_name: 'Penaeus monodon', country: 'Timor-Leste\n' } },
  // Duplicate country must not be added twice.
  { fields: { alpha3_code: 'GIT', english_name: 'Giant tiger prawn', country: ' kenya ' } },
  { fields: { alpha3_code: 'BSX', scientific_name: 'Serranidae', english_name: 'Groupers, seabasses NEI', family: 'SERRANIDAE', order: 'PERCIFORMES (PERCOIDEI)', country: 'Zanzibar' } },
  // Airtable's literal "NA" placeholder must not become a species called "Na".
  { fields: { alpha3_code: 'MZZ', scientific_name: 'Actinopterygii', english_name: 'Marine fishes nei', family: 'NA', order: 'NA', country: 'Zanzibar' } },
  // Unusable rows: no code, and a non-ASFIS value.
  { fields: { scientific_name: 'Unknown', country: 'Kenya' } },
  { fields: { alpha3_code: 'ABCD', country: 'Kenya' } }
]);

assert.deepStrictEqual(docs.map((d) => d.alpha3_code), ['BSX', 'GIT', 'MZZ'], 'one doc per code, sorted');

const mzz = docs.find((d) => d.alpha3_code === 'MZZ');
assert.strictEqual(mzz.family, '', 'Airtable "NA" becomes empty, not a family called "Na"');
assert.strictEqual(mzz.order, '', 'same for order');

const git = docs.find((d) => d.alpha3_code === 'GIT');
assert.deepStrictEqual(git.country_ids, ['kenya', 'timor'], 'countries unioned, canonicalised, deduped');
assert.strictEqual(git.english_name, 'Giant tiger prawn', 'first row wins on name conflicts');
assert.strictEqual(git.family, 'Penaeidae', 'fields absent from later rows are kept, normalised');

const bsx = docs.find((d) => d.alpha3_code === 'BSX');
assert.deepStrictEqual(bsx.country_ids, ['zanzibar']);
assert.strictEqual(bsx.family, 'Serranidae', 'family normalised out of ALL CAPS');
assert.strictEqual(bsx.order, 'Perciformes (Percoidei)', 'order normalised, parentheses kept');

console.log('✓ buildTaxonDocs');

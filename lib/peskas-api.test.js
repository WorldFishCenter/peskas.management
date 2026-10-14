// Run with: node lib/peskas-api.test.js
//
// normalizeTaxa + validateFilters are what stand between a user-typed species filter and PeSKAS.
const assert = require('node:assert/strict');
const { normalizeTaxa, validateFilters, validateDataset } = require('./peskas-api');

// What the species picker sends: picked codes each end in a comma, typed text follows as typed.
assert.equal(normalizeTaxa('SKJ,YFT,'), 'SKJ,YFT');
assert.equal(normalizeTaxa(' skj , yft'), 'SKJ,YFT');
assert.equal(normalizeTaxa(['SKJ', 'yft']), 'SKJ,YFT', 'repeated query param');
for (const empty of [undefined, '', ' ', ',', ' , ']) assert.equal(normalizeTaxa(empty), '');
// Normalizing must not launder junk into something that passes the gate.
assert.throws(() => validateFilters({ catch_taxon: normalizeTaxa('SKJ,sharks, r') }), /catch_taxon/);

for (const ok of [undefined, '', 'SKJ', 'SKJ,YFT', 'SKJ,YFT,MZZ']) {
  assert.doesNotThrow(() => validateFilters({ catch_taxon: ok }), `should accept ${ok}`);
}
// Lower-case and spaced lists match nothing on PeSKAS (a silent empty download), so they stop here.
for (const bad of ['skj', 'SKJ, YFT', 'SKJ,', ',SKJ', 'SKJ,,YFT', 'SKJ;YFT', 'TUNA', "SKJ' OR 1=1"]) {
  assert.throws(() => validateFilters({ catch_taxon: bad }), /catch_taxon/, `should reject ${bad}`);
}

console.log('✓ catch_taxon accepts one or several FAO codes');

// The dataset name becomes part of the request path, so only the two PeSKAS tables get through.
for (const ok of ['landings', 'district-months']) assert.doesNotThrow(() => validateDataset(ok));
for (const bad of [undefined, '', 'trips', '../health', ['landings'], 'landings?x=1']) {
  assert.throws(() => validateDataset(/** @type {any} */ (bad)), /dataset/, `should reject ${bad}`);
}

console.log('✓ only the two PeSKAS tables reach the request path');

// gaul_2 carries one district or a user's district list.
for (const ok of ['103616', '103616,103617']) assert.doesNotThrow(() => validateFilters({ gaul_2: ok }));
for (const bad of ['103616,', ',103616', '103616, 103617', 'Kilifi', "1 OR 1=1"]) {
  assert.throws(() => validateFilters({ gaul_2: bad }), /gaul_2/, `should reject ${bad}`);
}

console.log('✓ gaul_2 accepts one district or a list');

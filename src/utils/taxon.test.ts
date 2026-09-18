// Run with: npx tsx src/utils/taxon.test.ts
//
// The species picker writes a label and reads a code back out of it. That round trip is the
// only thing here that can break silently: a mismatched separator sends the whole label to the
// API as a "code", which comes back as a 400 the user cannot act on.
import assert from 'node:assert/strict';
import { Taxon } from '../types/download';
import { taxonLabel, taxonInput, toTaxonCode } from './taxon';

const taxa: Taxon[] = [
  {
    code: 'SKJ',
    scientific_name: 'Katsuwonus pelamis',
    english_name: 'Skipjack tuna',
    family: 'Scombridae',
  },
  // No family, and no English name — the label falls back to the Latin one.
  { code: 'MZZ', scientific_name: 'Actinopterygii', english_name: '', family: '' },
  // A name containing the separator's own character must still round-trip.
  {
    code: 'BSX',
    scientific_name: 'Serranidae',
    english_name: 'Groupers — seabasses nei',
    family: 'Serranidae',
  },
];

for (const tx of taxa) {
  assert.equal(toTaxonCode(taxonLabel(tx)), tx.code, `round trip for ${tx.code}`);
}

assert.equal(taxonLabel(taxa[0]), 'SKJ — Skipjack tuna (Scombridae)', 'label shape');
assert.equal(taxonLabel(taxa[1]), 'MZZ — Actinopterygii', 'no english name, no family');

// Free text is left exactly as typed, so typing a species name is not mangled mid-keystroke.
assert.equal(taxonInput('tun'), 'tun', 'free text untouched');
assert.equal(taxonInput('blue marlin'), 'blue marlin', 'internal spaces kept');
assert.equal(taxonInput(''), '', 'empty stays empty');

// ...but a lookup always sees a canonical code.
assert.equal(toTaxonCode('  skj  '), 'SKJ', 'trimmed and upper-cased for lookup');
assert.equal(toTaxonCode(''), '', 'empty means "all species", not a bad code');

console.log('✓ taxon label/code round trip');

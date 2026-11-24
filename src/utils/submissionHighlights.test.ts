// Run with: npx tsx src/utils/submissionHighlights.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SubmissionItem } from '../types/validation';
import { ALERT_FIELDS, fieldCodes, isCatchLine, lengthRowLine } from './submissionHighlights';

const kefs = ALERT_FIELDS.aNKjDfXDKyW3JLtaCdxDp5;
const located = { catch_number: 2, code: '5.2', species: 'Calotomus carolinus', value: '33 kg' };
const alerts = { codes: ['1', '5.2'], catches: [located], lines: 2 };

// A trip alert marks its answer; an alert not raised marks nothing.
assert.deepEqual(fieldCodes(kefs, alerts, 'hp', '400', null), ['1']);
assert.deepEqual(fieldCodes(kefs, { ...alerts, codes: [] }, 'hp', '400', null), []);
// A located catch alert marks only the line the pipeline named, and the trip total it was compared with.
assert.deepEqual(fieldCodes(kefs, alerts, 'WeightSpcsSample', '33', 2), ['5.2']);
assert.deepEqual(fieldCodes(kefs, alerts, 'WeightSpcsSample', '5.8', 1), []);
assert.deepEqual(fieldCodes(kefs, alerts, 'sample_weight', '2.6', null), ['5.2']);
// Stored before the pipelines located catches: every line is marked.
assert.deepEqual(fieldCodes(kefs, { ...alerts, catches: [] }, 'WeightSpcsSample', '5.8', 1), ['5.2']);
// Trip duration: the old and the new question names.
assert.deepEqual(fieldCodes(kefs, { ...alerts, codes: ['3'] }, 'Enter_date_and_time_sel_left_for_fishing', '', null), ['3']);
assert.deepEqual(fieldCodes(kefs, { ...alerts, codes: ['3'] }, 'time_in', '', null), ['3']);

// Zanzibar SSF 1.1 numbers fish over 1 m past the last catch line: placed by the length stored.
const zanzibar = ALERT_FIELDS.acbfEuAzqAnCGm8Mqenr56;
const pastTheLines = { codes: ['4'], catches: [{ catch_number: 10, code: '4', species: 'Sepia spp', value: '120 cm' }], lines: 6 };
assert.equal(isCatchLine(pastTheLines, pastTheLines.catches[0]), false);
assert.deepEqual(fieldCodes(zanzibar, pastTheLines, 'fish_length_over100', '120', 1), ['4']);
assert.deepEqual(fieldCodes(zanzibar, pastTheLines, 'fish_length_over100', '110', 3), []);

// KEFS lengths sit in their own repeat; a length row belongs to the first catch line of its species.
const field = (name: string, value: string): SubmissionItem => ({ type: 'field', name, label: [name], value: [value] });
const catchLines = [[field('marinespecies', 'octopus')], [field('marinespecies', 'parrotfish')], [field('marinespecies', 'parrotfish')]];
assert.equal(lengthRowLine(kefs, [field('priorityspecies', 'parrotfish')], catchLines), 2);
assert.equal(lengthRowLine(kefs, [field('priorityspecies', 'tuna')], catchLines), -1);

// Every form with alert texts has its alerts mapped, so a new pipeline alert cannot go unmarked.
// No pipeline checks BMU DAILY ARTISANAL 2025: it is only downloaded.
const UNCHECKED = ['aCvp5SjbUG3SFTuT2GSZ9V'];
const surveys = JSON.parse(readFileSync('public/locales/en/validation.json', 'utf8')).surveys;
for (const [assetId, texts] of Object.entries<Record<string, string>>(surveys)) {
  const codes = Object.keys(texts);
  if (codes.length === 0 || UNCHECKED.includes(assetId)) continue;
  assert.ok(ALERT_FIELDS[assetId], `${assetId} has alert texts but no map`);
  for (const code of codes) {
    assert.ok(code.replace(/_/g, '.') in ALERT_FIELDS[assetId].fields, `${assetId}: alert ${code} has no questions listed`);
  }
}

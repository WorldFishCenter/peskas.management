// Run with: npx tsx src/utils/alertCodes.test.ts
//
// Badges carry codes as the pipelines write them ("5.2", "3,7"); definitions are keyed as they
// are stored ("5_2"). A mismatch does not fail loudly: the popover just says the code is not
// described, which is how KEFS sub-codes went unexplained.
import assert from 'node:assert/strict';
import type { i18n as I18n } from 'i18next';
import { describeAlertCode, displayAlertCode, splitAlertCodes } from './alertCodes';

const translations: Record<string, string> = {
  'surveys.kefs.5_2': 'Sample weight exceeds total weight',
  'alertCodes.9': 'Generic nine',
};
const i18n = {
  exists: (key: string) => key in translations,
  t: (key: string) => translations[key],
} as unknown as I18n;
const stored = { '5_2': 'stored five two', '3': 'stored three' };

assert.equal(describeAlertCode(i18n, 'kefs', '5.2', stored), 'Sample weight exceeds total weight');
assert.equal(describeAlertCode(i18n, 'kefs', '5_2', stored), 'Sample weight exceeds total weight');
assert.equal(describeAlertCode(i18n, 'kefs', '9', stored), 'Generic nine');
assert.equal(describeAlertCode(i18n, 'kefs', '3', stored), 'stored three');
assert.equal(describeAlertCode(i18n, 'other', '5.2', stored), 'stored five two');
assert.equal(describeAlertCode(i18n, 'kefs', '14', stored), undefined);

assert.equal(displayAlertCode('5_2'), '5.2');
assert.deepEqual(splitAlertCodes('7,5.2'), ['7', '5.2']);
assert.deepEqual(splitAlertCodes('2,11, 4,11, 4,11, 11'), ['2', '11', '4']);

console.log('alertCodes: all assertions passed');

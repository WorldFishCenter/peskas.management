// Run with: npx tsx src/components/EnumeratorPerformance/utils/dataUtils.test.ts
//
// An enumerator's alert rate is flagged submissions over submissions. A submission with two alert
// codes is one flagged submission, not two; only the alert-type chart counts it under each code.
import assert from 'node:assert/strict';
import { processEnumeratorData, tallyAlertFlags } from './dataUtils';

// Four submissions on one day: two clean, one with alerts 3 and 7, one with alert 3 only.
const [amina] = processEnumeratorData([
  { submitted_by: 'amina', date: '2026-10-01', count: 2 },
  { submitted_by: 'amina', date: '2026-10-01', alert_flag: '3, 7', count: 1 },
  { submitted_by: 'amina', date: '2026-10-01', alert_flag: '3', count: 1 },
]);

assert.equal(amina.totalSubmissions, 4);
assert.equal(amina.submissionsWithAlerts, 2);
assert.equal(amina.errorRate, 50);
assert.deepEqual(amina.submissionTrend, [{ date: '2026-10-01', count: 4 }]);
assert.deepEqual(tallyAlertFlags([amina]), [{ name: '3', y: 2 }, { name: '7', y: 1 }]);

console.log('dataUtils: all assertions passed');

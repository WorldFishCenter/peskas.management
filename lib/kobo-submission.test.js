// Run with: node lib/kobo-submission.test.js
const assert = require('node:assert/strict');
const { submissionView, coverage } = require('./kobo-submission');

const form = {
  translations: ['English (en)', 'Swahili (sw)'],
  survey: [
    { type: 'start', name: 'start' },
    { type: 'begin_group', name: 'trip', label: ['Trip', 'Safari'] },
    { type: 'integer', name: 'crew', label: ['**Crew**', 'Wavuvi'] },
    { type: 'datetime', name: 'left', label: ['Left', null] },
    { type: 'integer', name: 'boats', label: ['Boats'] },
    { type: 'end_group' },
    { type: 'select_multiple', name: 'gear', label: ['Gear'], select_from_list_name: 'gear' },
    { type: 'calculate', name: 'total' },
    { type: 'note', name: 'shown', label: ['Total value: ${total} KSH', 'Thamani: ${total}'] },
    { type: 'calculate', name: 'hidden_sum' },
    { type: 'begin_repeat', name: 'catch', label: ['Catch'] },
    { type: 'select_one_from_file', name: 'species', label: ['Species'] },
    { type: 'begin_group', name: 'sizes' },
    { type: 'decimal', name: 'kg', label: ['Kg'] },
    { type: 'end_group' },
    { type: 'image', name: 'photo', label: ['Photo'] },
    { type: 'end_repeat' }
  ],
  choices: [
    { list_name: 'gear', name: 'net', label: ['Net', 'Nyavu'] },
    { list_name: 'gear', name: 'line', label: ['Line', 'Mshipi'] }
  ]
};
const record = {
  start: '2026-11-18T09:00:00.000+03:00',
  'trip/crew': '3',
  'trip/left': '2026-11-18T05:20:00.000+03:00',
  gear: 'net line',
  total: '99',
  hidden_sum: '7',
  catch: [
    { 'catch/species': 'common_octopus/pweza', 'catch/sizes/kg': '5.8', 'catch/photo': 'a.jpg' },
    { 'catch/species': 'parrotfish' }
  ],
  _id: 1
};

// Unanswered questions come empty outside the catch lines; a calculation only when a note shows it.
const view = submissionView(form, record);
assert.deepEqual(view.languages, ['English (en)', 'Swahili (sw)']);
assert.deepEqual(view.items, [
  { type: 'group', name: 'trip', label: ['Trip', 'Safari'], items: [
    { type: 'field', name: 'crew', label: ['Crew', 'Wavuvi'], value: ['3'] },
    { type: 'field', name: 'left', label: ['Left', null], value: ['2026-11-18 05:20'] },
    { type: 'field', name: 'boats', label: ['Boats'], value: [] }
  ] },
  { type: 'field', name: 'gear', label: ['Gear'], value: ['Net, Line', 'Nyavu, Mshipi'] },
  { type: 'field', name: 'total', label: ['Total value', 'Thamani'], value: ['99'] },
  { type: 'repeat', name: 'catch', label: ['Catch'], entries: [
    [
      { type: 'field', name: 'species', label: ['Species'], value: ['common octopus/pweza'] },
      { type: 'field', name: 'kg', label: ['Kg'], value: ['5.8'] }
    ],
    [{ type: 'field', name: 'species', label: ['Species'], value: ['parrotfish'] }]
  ] }
]);

// A form missing questions the record answers fits it worse.
const older = { ...form, survey: form.survey.filter(q => q.name !== 'crew') };
assert.ok(coverage(form, record) > coverage(older, record));

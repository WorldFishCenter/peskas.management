// Run with: node lib/download.test.js
//
// resolveDownload decides which PeSKAS calls serve a download. Monthly figures add up every form
// of a country, so their requests carry no survey_id and no trip filters: one per country. Trips
// keep the per-form fan-out. Runs offline: the database is a stub holding three forms.
const assert = require('node:assert/strict');

const SURVEYS = [
  { asset_id: 'k1', name: 'Kenya 1', country_id: 'Kenya', active: true },
  { asset_id: 'k2', name: 'Kenya 2', country_id: ['Kenya'], active: true },
  { asset_id: 'z1', name: 'Zanzibar 1', country_id: 'Zanzibar', active: true },
];
// The one query the permission gate makes: surveys.find(query).sort(...).toArray()
const fakeDb = {
  collection: () => ({
    find: (query) => ({
      sort: () => ({
        toArray: async () =>
          SURVEYS.filter(s => !query.asset_id || query.asset_id.$in.includes(s.asset_id))
      })
    })
  })
};
const dbPath = require.resolve('./db');
require.cache[dbPath] = /** @type {any} */ ({
  id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => fakeDb }
});

const { resolveDownload, downloadAuditDetails } = require('./download');
const { DownloadPermissionError } = require('./filter-permissions');
const { PeskasAPIError } = require('./peskas-api');

(async () => {
  const user = { role: 'user', permissions: { surveys: ['k1', 'k2', 'z1'], gaul_codes: ['103616'] } };
  const tripFilters = { status: 'raw', scope: 'trip_info', catch_taxon: 'skj' };

  // Monthly: the form is dropped, forms collapse to their countries, trip filters are not sent.
  const monthly = await resolveDownload(user, {
    dataset: 'district-months', survey_id: 'k1', gaul_2: '103616', ...tripFilters
  });
  assert.deepEqual(monthly, {
    dataset: 'district-months',
    requests: [{ country: 'kenya', gaul_2: '103616' }, { country: 'zanzibar', gaul_2: '103616' }],
    sharedFilters: {}
  });
  assert.equal(downloadAuditDetails(monthly).dataset, 'district-months');

  // Trips: one request per chosen form, with the trip filters and the user's one district.
  // An empty dataset means trips.
  assert.deepEqual(await resolveDownload(user, { dataset: '', survey_id: 'k1', ...tripFilters }), {
    dataset: 'landings',
    requests: [{ country: 'kenya', survey_id: 'k1', gaul_2: '103616' }],
    sharedFilters: { status: 'raw', scope: 'trip_info', catch_taxon: 'SKJ' }
  });

  // A district list limits a download that picks no district, for trips and monthly figures.
  const limited = { role: 'user', permissions: { surveys: ['k1'], gaul_codes: ['103617', '103616', '103617'] } };
  assert.deepEqual((await resolveDownload(limited, {})).requests,
    [{ country: 'kenya', survey_id: 'k1', gaul_2: '103616,103617' }]);
  assert.deepEqual((await resolveDownload(limited, { dataset: 'district-months' })).requests,
    [{ country: 'kenya', gaul_2: '103616,103617' }]);
  // With no list, no district filter: every district of the forms.
  const unlimited = { role: 'user', permissions: { surveys: ['k1'], gaul_codes: [] } };
  assert.deepEqual((await resolveDownload(unlimited, {})).requests, [{ country: 'kenya', survey_id: 'k1' }]);

  // Admin: the country named, normalized, with no district limit.
  const admin = { role: 'admin', permissions: { surveys: [] } };
  assert.deepEqual(
    (await resolveDownload(admin, { dataset: 'district-months', country: 'Kenya', survey_id: 'k1' })).requests,
    [{ country: 'kenya' }]
  );

  // Refused: a district outside the user's list, and an unknown dataset (a 400, not a 500).
  await assert.rejects(resolveDownload(user, { dataset: 'district-months', gaul_2: '106434' }), DownloadPermissionError);
  await assert.rejects(
    resolveDownload(user, { dataset: 'trips' }),
    (e) => e instanceof PeskasAPIError && e.code === 'VALIDATION_ERROR'
  );

  console.log('✓ monthly figures resolve to one request per country, trips to one per form');
  console.log('✓ a district list limits both to the user\'s districts');
})();

// Run with: node lib/workbook.test.js
//
// buildWorkbook writes a download's rows into the report template. Values must arrive typed
// (numbers, dates, text) and in place, a trip's rows together, whatever the order or the columns
// of the rows given. The figures themselves are checked by scripts/workbook/check_workbook.py.
const assert = require('node:assert/strict');
const { unzipSync, strFromU8 } = require('fflate');
const { buildWorkbook } = require('./workbook');
const manifest = require('./workbook/template.json');

const open = (rows, info = { country: 'mozambique', status: 'validated', downloadedOn: '2026-11-20' }) => {
  const files = unzipSync(buildWorkbook(rows, info));
  return (name) => strFromU8(files[name]);
};
const col = (name) => manifest.columns.find((c) => c.name === name).col;
const strings = (xml) => [...xml.matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map((m) => m[1]);
const cellXml = (sheet, ref) => (new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheet) || [''])[0];

const base = {
  survey_organization: 'DINAPA', survey_id: 'apobg7g9x9c5ZqHbcn69T3', gaul_1_name: 'Nampula',
  gaul_2_code: 103616, gaul_2_name: 'Angoche', landing_site: 'Praia & Mar <Sul> $& São José',
  n_fishers: 3, trip_duration_hrs: '5.5', gear: 'Gill Net', catch_outcome: 1, tot_catch_kg: 22.7,
  tot_catch_price: 4250
};
const rows = [
  { ...base, trip_id: 'TRIP_715693918', landing_date: '2026-03-11', n_catch: 2, scientific_name: 'Siganus sutor', catch_kg: 3.2 },
  { ...base, trip_id: 'TRIP_2', landing_date: '2026-03-01', n_catch: 1, scientific_name: 'Scylla serrata', catch_kg: 6.1, gear: 'Trap' },
  { ...base, trip_id: 'TRIP_715693918', landing_date: '2026-03-11', n_catch: 1, scientific_name: 'Siganus sutor', catch_kg: 5.3, extra_col: 7 },
  { ...base, trip_id: 715693918123, landing_date: '2026-03-20', n_catch: 1, scientific_name: 'Scylla serrata', catch_kg: 1 },
  { ...base, trip_id: '', landing_date: '2026-03-21', n_catch: 1, catch_kg: 2 }
];

// Rows: trips by date, a split trip back together, its catches in order.
const read = open(rows);
const data = read(manifest.dataSheet);
const sst = strings(read('xl/sharedStrings.xml'));
const textAt = (ref) => sst[Number(/<v>(\d+)<\/v>/.exec(cellXml(data, ref))[1])];
assert.equal(textAt(`${col('trip_id')}2`), 'TRIP_2');
assert.equal(textAt(`${col('trip_id')}3`), 'TRIP_715693918', 'long IDs stay text');
assert.equal(textAt(`${col('trip_id')}4`), 'TRIP_715693918');
assert.match(cellXml(data, `${col('n_catch')}3`), /<v>1<\/v>/);
assert.equal(textAt(`${col('trip_id')}5`), '715693918123', 'a numeric trip ID stays text, never 7.2E+11');

// Types: a date is a serial with the date style, numbers are numbers even when they came as text,
// a code is text, accents and XML characters survive.
assert.match(cellXml(data, `${col('landing_date')}2`), /^<c r="D2" s="\d+"><v>46082<\/v><\/c>$/);
assert.match(cellXml(data, `${col('trip_duration_hrs')}3`), /<v>5.5<\/v>/);
assert.doesNotMatch(cellXml(data, `${col('trip_duration_hrs')}3`), /t="s"/);
assert.equal(textAt(`${col('gaul_2_code')}2`), '103616');
assert.equal(textAt(`${col('landing_site')}2`), 'Praia &amp; Mar &lt;Sul&gt; $&amp; São José');

// Worked-out columns: each formula written in full on its row (Excel refuses shared formulas
// here), its row numbers moved with the row, its absolute references kept.
const helperCol = (name) => manifest.helpers.find((h) => h.name === name).col;
assert.doesNotMatch(data, /t="shared"/);
assert.match(cellXml(data, `${helperCol('include')}5`), /<f>IF\(SUBTOTAL\(103,\$C5\)=0,0,.*Start!\$C\$20.*\$D5&gt;=/);
assert.match(cellXml(data, `${helperCol('seen')}5`), new RegExp(`MAX\\(\\$${helperCol('seen')}4,`));
assert.match(data, /<dimension ref="A1:[A-Z]+6"\/>/);
assert.match(data, /<autoFilter ref="A1:X6"/);
assert.match(read('xl/workbook.xml'), /'1_Data'!\$C\$2:\$C\$6</);
assert.doesNotMatch(read('xl/workbook.xml'), new RegExp(`\\$${manifest.lastRow}<`));

// An extra column goes after the worked-out ones; a missing one is named on 2_Check.
const helperEnd = manifest.helpers[manifest.helpers.length - 1].col;
assert.ok(data.includes('extra_col'));
const check = read(manifest.slots.columns_note.sheet);
assert.match(check, /Missing from the download: gaul_1_code, vessel_type/);
assert.match(check, /Also in the download, at the right of 1_Data: extra_col/);
assert.match(check, /1 rows have no trip_id and are left out of every figure/);
assert.ok(helperEnd < 'BA');

// The platform's cells: country and currency, trips, the gears and species from the data.
const startXml = read(manifest.slots.country.sheet);
assert.ok(startXml.includes('>Mozambique<') && startXml.includes('>MZN<'));
assert.match(cellXml(check, manifest.slots.trips_total.ref), /<v>4<\/v>/);
assert.ok(cellXml(startXml, manifest.slots.districts_label.ref).includes('Districts'));
assert.ok(open(rows, { country: 'kenya', status: 'raw', downloadedOn: '2026-11-20' })(manifest.slots.districts_label.sheet).includes('Sub-counties'),
  'Kenya names its areas sub-counties');
const gearXml = read(manifest.gears.sheet);
const firstGears = manifest.gears.refs.slice(0, 2).map((ref) => cellXml(gearXml, ref)).join('');
assert.ok(firstGears.includes('Gill Net') && firstGears.includes('Trap'), 'gears with the most trips');
const speciesXml = read(manifest.species.sheet);
assert.ok(cellXml(speciesXml, manifest.species.refs[0]).includes('Siganus sutor'), 'species by weight in the sample');

// No rows: still a workbook, its ranges one empty row.
const empty = open([]);
assert.match(empty(manifest.dataSheet), /<autoFilter ref="A1:X2"/);
assert.match(empty(manifest.slots.columns_note.sheet), /Missing from the download: survey_organization/);

console.log('workbook: ok');

#!/usr/bin/env node
/**
 * Make the Excel report from a trips CSV downloaded from the platform, offline.
 *
 *   node scripts/workbook/fill.cjs <trips.csv> <out.xlsx> [--country kenya] [--status validated] [--date YYYY-MM-DD]
 *
 * The same workbook the Download page's Excel report gives, for a file already on disk.
 */
const fs = require('fs');
const { buildWorkbook, rowsFromCSV } = require('../../lib/workbook');

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/workbook/fill.cjs <trips.csv> <out.xlsx> [--country kenya] [--status validated] [--date YYYY-MM-DD]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = flags.indexOf(`--${name}`);
  return i >= 0 ? flags[i + 1] : fallback;
};
const rows = rowsFromCSV(fs.readFileSync(input, 'utf8'));
fs.writeFileSync(output, buildWorkbook(rows, {
  country: opt('country', 'kenya'),
  status: opt('status', 'validated'),
  downloadedOn: opt('date', undefined)
}));
console.log(`${output}: ${rows.length} rows`);

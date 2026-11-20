/**
 * The Excel report: a download's trips written into the template that
 * scripts/workbook/build_template.py makes. Every figure is a formula the spreadsheet works out;
 * the cells are typed, so no language or decimal setting can misread them, as it can a CSV.
 *
 * @module lib/workbook
 */

const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8, strToU8, Zip, ZipDeflate } = require('fflate');
const manifest = require('./workbook/template.json');
const { COUNTRIES } = require('./country-codes');

const TEMPLATE = path.join(__dirname, 'workbook', 'template.xlsx');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const BATCH = 2000; // rows of XML compressed at a time, so a large download never sits whole in memory

const escapeXml = (s) =>
  // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function dateSerial(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - EXCEL_EPOCH) / 86400000 : null;
}

function numberOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

const textCell = (ref, s, text) =>
  `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(text))}</t></is></c>`;
const numberCell = (ref, s, n) => `<c r="${ref}"${s}><v>${n}</v></c>`;

// Each distinct text stored once, as Excel saves them: far smaller than writing it on every row.
function sharedStrings() {
  const index = new Map();
  let uses = 0;
  return {
    ref(text) {
      uses++;
      if (!index.has(text)) index.set(text, index.size);
      return index.get(text);
    },
    xml: () => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${uses}" `
      + `uniqueCount="${index.size}">`
      + [...index.keys()].map((t) => `<si><t xml:space="preserve">${escapeXml(t)}</t></si>`).join('') + '</sst>'
  };
}

/** One value as a typed cell; a value that does not fit its type is kept as text. */
function cell(ref, s, type, v, strings) {
  if (blank(v)) return '';
  if (type === 'number') {
    const n = numberOf(v);
    if (n !== null) return numberCell(ref, s, n);
  } else if (type === 'date') {
    const d = dateSerial(v);
    if (d !== null) return numberCell(ref, s, d);
  }
  return `<c r="${ref}"${s} t="s"><v>${strings.ref(String(v))}</v></c>`;
}

function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const v = String(row[key] ?? '');
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(row);
  });
  return groups;
}

// The workbook counts a trip on its first row, so each trip's rows must be together.
function orderRows(rows) {
  const byCatch = (a, b) => (numberOf(a.n_catch) ?? 0) - (numberOf(b.n_catch) ?? 0);
  return [...groupBy(rows, 'trip_id').values()]
    .map((t) => t.sort(byCatch))
    .sort((a, b) => String(a[0].landing_date ?? '').localeCompare(String(b[0].landing_date ?? '')))
    .flat();
}

function top(rows, key, n, weigh) {
  return [...groupBy(rows.filter((row) => !blank(row[key])), key).entries()]
    .map(([v, g]) => [v, weigh(g)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => String(v));
}

const distinct = (rows, key) => [...new Set(rows.map((r) => r[key]).filter((v) => !blank(v)).map(String))];

function listOf(values, max = 12) {
  return values.length <= max ? values.join(', ') : `${values.slice(0, max).join(', ')} and ${values.length - max} more`;
}

function templateRow(xml, r) {
  const row = new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`).exec(xml);
  const cells = {};
  for (const m of (row ? row[1] : '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const s = / s="\d+"/.exec(m[2]);
    const f = /<f>([\s\S]*?)<\/f>/.exec(m[3] || '');
    cells[m[1]] = { s: s ? s[0] : '', formula: f ? f[1] : null };
  }
  return { xml: row ? row[0] : '', cells };
}

// Hands the sheet's XML to `emit` in pieces: the head, batches of rows, then the tail.
function dataSheet(xml, rows, last, extras, strings, emit) {
  const header = templateRow(xml, 1);
  const pattern = templateRow(xml, 2).cells;
  const firstExtra = manifest.columns.length + manifest.helpers.length + 1;
  const headStyle = (header.cells.A || { s: '' }).s;
  const extraHead = extras.map((name, i) => textCell(`${colName(firstExtra + i)}1`, headStyle, name)).join('');
  const lastCol = colName(firstExtra - 1 + extras.length);
  const [head, tail] = xml.split(/<sheetData>[\s\S]*<\/sheetData>|<sheetData\s*\/>/);
  // Replacer functions: a "$&" in the data must not be read as a replacement pattern.
  emit(head.replace(/<dimension ref="[^"]*"\s*\/>/, () => `<dimension ref="A1:${lastCol}${last}"/>`)
    + `<sheetData>${header.xml.replace('</row>', () => `${extraHead}</row>`)}`);
  let parts = [];
  const cols = manifest.columns.map((c) => ({ ...c, s: (pattern[c.col] || { s: '' }).s }));
  const helpers = manifest.helpers.map((h, i) => ({ ...h, ...(pattern[h.col] || { s: '', formula: null }), si: i }));
  rows.forEach((row, i) => {
    const r = i + 2;
    let out = '';
    for (const c of cols) out += cell(`${c.col}${r}`, c.s, c.type, row[c.name], strings);
    for (const h of helpers) {
      if (!h.formula) {
        out += numberCell(`${h.col}${r}`, h.s, i + 1);
      } else if (r === 2) {
        out += `<c r="${h.col}2"${h.s}><f t="shared" ref="${h.col}2:${h.col}${last}" si="${h.si}">${h.formula}</f></c>`;
      } else {
        out += `<c r="${h.col}${r}"${h.s}><f t="shared" si="${h.si}"/></c>`;
      }
    }
    extras.forEach((name, j) => { out += cell(`${colName(firstExtra + j)}${r}`, '', 'string', row[name], strings); });
    parts.push(`<row r="${r}">${out}</row>`);
    if (parts.length === BATCH) {
      emit(parts.join(''));
      parts = [];
    }
  });
  emit(parts.join('') + '</sheetData>'
    + tail.replace(/<autoFilter ref="([A-Z]+1:[A-Z]+)\d+"/, (_, start) => `<autoFilter ref="${start}${last}"`), true);
}

/** A CSV as row objects. RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
function rowsFromCSV(csv) {
  const text = csv.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let header = null;
  const endRow = () => {
    row.push(field);
    if (!header) {
      header = row;
    } else if (row.some((v) => v !== '')) {
      rows.push(Object.fromEntries(header.map((h, j) => [h, row[j] ?? ''])));
    }
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

function setCell(xml, ref, value) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) throw new Error(`Template cell ${ref} is missing`);
  const s = / s="\d+"/.exec(m[1]);
  const style = s ? s[0] : '';
  const out = blank(value) ? `<c r="${ref}"${style}/>`
    : typeof value === 'number' ? numberCell(ref, style, value) : textCell(ref, style, value);
  return xml.replace(re, () => out);
}

/**
 * Build the Excel report for a download.
 *
 * @param {Array<object>} rows - Trip rows of the landings dataset, as rowsFromCSV reads them
 * @param {{country: string, status: string, downloadedOn?: string}} info - Canonical country code,
 *   'validated' or 'raw', and the download date (YYYY-MM-DD, default today)
 * @returns {Buffer} The .xlsx file
 */
function buildWorkbook(rows, info) {
  const files = unzipSync(fs.readFileSync(TEMPLATE));
  const read = (name) => strFromU8(files[name]);
  const write = (name, xml) => { files[name] = strToU8(xml); };
  const output = [];
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    output.push(chunk);
  });
  const ordered = orderRows(rows);
  const known = new Set(manifest.columns.map((c) => c.name));
  const present = new Set();
  ordered.forEach((r) => Object.keys(r).forEach((k) => present.add(k)));
  const missing = manifest.columns.map((c) => c.name).filter((n) => !present.has(n));
  const extras = [...present].filter((n) => !known.has(n));
  const last = Math.max(ordered.length + 1, 2);

  const strings = sharedStrings();
  const sheet = new ZipDeflate(manifest.dataSheet, { level: 6 });
  zip.add(sheet);
  dataSheet(read(manifest.dataSheet), ordered, last, extras, strings,
    (xml, final = false) => sheet.push(strToU8(xml), final));
  delete files[manifest.dataSheet];
  write('xl/sharedStrings.xml', strings.xml());
  write('xl/workbook.xml', read('xl/workbook.xml').split(`$${manifest.lastRow}<`).join(`$${last}<`));

  const country = { name: info.country, currency: '', districts: 'Districts', ...COUNTRIES[info.country] };
  const noTrip = ordered.filter((r) => blank(r.trip_id)).length;
  const columnsNote = (missing.length
    ? `Missing from the download: ${missing.join(', ')}. The figures that need them stay empty.`
    : `All ${manifest.columns.length} columns of the download are here.`)
    + (extras.length ? ` Also in the download, at the right of 1_Data: ${extras.join(', ')}.` : '')
    + (noTrip ? ` ${noTrip} rows have no trip_id and are left out of every figure.` : '');
  const values = {
    country: country.name,
    organisation: listOf(distinct(ordered, 'survey_organization')),
    districts_label: country.districts,
    districts: listOf(distinct(ordered, 'gaul_2_name')),
    status: info.status === 'raw' ? 'Raw (not yet reviewed)' : 'Validated',
    downloaded_on: dateSerial(info.downloadedOn || new Date().toISOString()),
    currency: country.currency,
    trips_total: new Set(ordered.map((r) => String(r.trip_id ?? ''))).size,
    columns_note: columnsNote
  };
  const trips = (g) => new Set(g.map((r) => r.trip_id)).size;
  const weight = (g) => g.reduce((sum, r) => sum + (numberOf(r.catch_kg) ?? 0), 0);
  const gears = top(ordered, 'gear', manifest.gears.refs.length, trips);
  const species = top(ordered, 'scientific_name', manifest.species.refs.length, weight);

  const edits = {};
  const edit = (sheet, ref, value) => { edits[sheet] = setCell(edits[sheet] ?? read(sheet), ref, value); };
  Object.entries(manifest.slots).forEach(([key, { sheet, ref }]) => edit(sheet, ref, values[key]));
  manifest.gears.refs.forEach((ref, i) => edit(manifest.gears.sheet, ref, gears[i] ?? ''));
  manifest.species.refs.forEach((ref, i) => edit(manifest.species.sheet, ref, species[i] ?? ''));
  Object.entries(edits).forEach(([sheet, xml]) => write(sheet, xml));

  Object.entries(files).forEach(([name, bytes]) => {
    const file = new ZipDeflate(name, { level: 6 });
    zip.add(file);
    file.push(bytes, true);
  });
  zip.end();
  return Buffer.concat(output);
}

module.exports = { buildWorkbook, rowsFromCSV };

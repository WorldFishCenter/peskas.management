// One KoboToolbox submission as the "View full submission" panel shows it.

const { koboAssetRequest, koboSubmissionRequest } = require('./api-utils');

// Metadata, notes and media: nothing a reviewer reads as an answer. Photos stay out of the
// platform on purpose.
const SKIPPED_TYPES = new Set([
  'start', 'end', 'today', 'deviceid', 'phonenumber', 'username', 'simserial', 'subscriberid',
  'audit', 'note', 'hidden', 'xml-external', 'start-geopoint', 'background-geopoint',
  'image', 'audio', 'video', 'file', 'background-audio'
]);

// Labels carry KoBo markdown and HTML; the panel shows text. A missing translation stays null.
const plain = text => (text == null ? null : String(text).replace(/<[^>]*>/g, '').replace(/\*/g, '').trim());

const labelsOf = (q, name) => (q.label?.length ? q.label.map(plain) : [name]);

function choiceLists(choices = []) {
  const lists = new Map();
  for (const c of choices) {
    const name = String(c.name ?? c.$autovalue);
    if (!lists.has(c.list_name)) lists.set(c.list_name, new Map());
    lists.get(c.list_name).set(name, labelsOf(c, name));
  }
  return lists;
}

// A calculation is shown only when a note showed it to the enumerator ("Total Value: ${TValue}"),
// labelled by the note's words before it.
function noteLabels(survey) {
  const labels = new Map();
  for (const q of survey) {
    if (q.type !== 'note' || !q.label?.length) continue;
    for (const [, name] of String(q.label.find(Boolean) ?? '').matchAll(/\$\{(\w+)\}/g)) {
      const before = text => plain(text?.split(`\${${name}}`)[0])?.replace(/[\s:=-]+$/, '') || null;
      const label = q.label.map(before);
      if (!labels.has(name) && label.some(Boolean)) labels.set(name, label);
    }
  }
  return labels;
}

/** An answer in each of the form's languages; a value with no translation is a one-item list. */
function answerText(q, raw, lists) {
  const list = lists.get(q.select_from_list_name);
  if (q.type === 'select_one' && list) return list.get(raw) ?? [raw];
  if (q.type === 'select_multiple' && list) {
    const picked = raw.split(' ').filter(Boolean).map(v => list.get(v) ?? [v]);
    const n = Math.max(...picked.map(p => p.length));
    return Array.from({ length: n }, (_, i) => picked.map(p => p[i] ?? p[0]).join(', '));
  }
  // Choices from an attached CSV are not in the form definition; the stored value is readable.
  if (q.type.endsWith('_from_file')) return [raw.replace(/_/g, ' ')];
  // As typed on the tablet, in its own time zone.
  if (q.type === 'datetime') return [raw.slice(0, 16).replace('T', ' ')];
  if (q.type === 'time') return [raw.slice(0, 5)];
  if (q.type === 'geopoint') return [raw.split(' ').slice(0, 2).join(', ')];
  return [raw];
}

function formTree(survey) {
  const root = { path: '', children: [] };
  const stack = [root];
  for (const q of survey) {
    if (q.type.startsWith('end_')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const name = q.$autoname ?? q.name;
    if (!name) continue;
    const parent = stack[stack.length - 1];
    const node = { q, name, path: parent.path ? `${parent.path}/${name}` : name, children: [] };
    parent.children.push(node);
    if (q.type.startsWith('begin_')) stack.push(node);
  }
  return root.children;
}

// Record keys are full paths, inside repeat entries too. Unanswered questions outside the catch
// lines come with no value: an alert can be about an answer left blank.
function itemsOf(nodes, data, form, withBlanks) {
  const out = [];
  for (const { q, name, path, children } of nodes) {
    if (q.type === 'begin_repeat') {
      const entries = Array.isArray(data[path]) ? data[path] : [];
      if (entries.length) {
        out.push({ type: 'repeat', name, label: labelsOf(q, name), entries: entries.map(e => itemsOf(children, e, form, false)) });
      }
    } else if (q.type.startsWith('begin_')) {
      const inner = itemsOf(children, data, form, withBlanks);
      if (inner.length && q.label?.length) out.push({ type: 'group', name, label: labelsOf(q, name), items: inner });
      else out.push(...inner);
    } else {
      const label = q.type === 'calculate' ? form.noteLabels.get(name) : !SKIPPED_TYPES.has(q.type) && labelsOf(q, name);
      if (!label) continue;
      const raw = data[path];
      if (raw != null && raw !== '') out.push({ type: 'field', name, label, value: answerText(q, String(raw), form.lists) });
      else if (withBlanks && q.type !== 'calculate') out.push({ type: 'field', name, label, value: [] });
    }
  }
  return out;
}

function submissionView(content, record) {
  const survey = content.survey ?? [];
  const form = { lists: choiceLists(content.choices), noteLabels: noteLabels(survey) };
  return { languages: content.translations ?? [null], items: itemsOf(formTree(survey), record, form, true) };
}

/** How many of the record's answers the form names: a record can name a form version it was not filled in with. */
function coverage(content, record) {
  const paths = new Set();
  const collect = nodes => nodes.forEach(n => { paths.add(n.path); collect(n.children); });
  collect(formTree(content.survey ?? []));
  const count = data => {
    let n = 0;
    for (const [key, value] of Object.entries(data)) {
      if (paths.has(key)) n += 1;
      if (Array.isArray(value)) for (const entry of value) if (entry && typeof entry === 'object') n += count(entry);
    }
    return n;
  };
  return count(record);
}

// Vercel stops the function at 10 s; every read together must answer before that.
const FIRST_TIMEOUT_MS = 6000;
const TOTAL_BUDGET_MS = 8500;

// The form version the record names keeps renamed questions' old labels; it is used unless the
// current form fits the record better.
async function fetchSubmissionView(survey, id) {
  const started = Date.now();
  const recordRequest = koboSubmissionRequest(survey, id, '?format=json', {}, FIRST_TIMEOUT_MS);
  if (!recordRequest) return null;
  const [recordResult, formResult] = await Promise.allSettled([
    recordRequest,
    koboAssetRequest(survey, '?format=json', {}, FIRST_TIMEOUT_MS)
  ]);
  if (recordResult.status === 'rejected') throw recordResult.reason;
  const record = recordResult.value.data;
  const current = formResult.status === 'fulfilled' ? formResult.value.data : null;

  let content = current?.content;
  const versionId = record.__version__;
  if (typeof versionId === 'string' && /^[A-Za-z0-9]+$/.test(versionId) && versionId !== current?.version_id) {
    try {
      const timeout = Math.max(1000, TOTAL_BUDGET_MS - (Date.now() - started));
      const submitted = (await koboAssetRequest(survey, `versions/${versionId}/?format=json`, {}, timeout)).data.content;
      if (!content || coverage(submitted, record) >= coverage(content, record)) content = submitted;
    } catch (error) {
      if (!content) throw error;
    }
  }
  if (!content) throw formResult.status === 'rejected' ? formResult.reason : new Error('KoboToolbox returned no form definition');
  return submissionView(content, record);
}

module.exports = { submissionView, coverage, fetchSubmissionView };

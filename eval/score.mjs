// Score actual study exports. Never infer task identity from record order.
// node eval/score.mjs eval/truth.json results-dir [--json]
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { scoreAgainstTruth, SCHEMA, validateField, spreadsheetSafeValue, CSV_TEXT_POLICY } from '../src/core.mjs';
import { readCSV, requireColumns } from './csv.mjs';
import { pairRows, mean, CONDITIONS } from './pairs.mjs';

const BASE_COLUMNS = ['task_id', 'file', 'scenario', 'location', 'subject_id', 'condition'];
const CSV_RECORD_COLUMNS = ['record_id', 'timestamp', 'session_id', 'operator', 'device', 'file', 'sha256', 'source'];
const safeFile = file => typeof file === 'string' && /^[A-Za-z0-9_.-]+$/.test(file) && !['.', '..'].includes(file);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const formatErrors = recs => recs.reduce((n, r) => n + SCHEMA.filter(f => f.required && r.meta[f.key] && validateField(f, r.meta[f.key])).length, 0);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function checkGuidedCSV(text, manifest) {
  if (!Array.isArray(manifest.schema) || JSON.stringify(canonical(manifest.schema)) !== JSON.stringify(canonical(SCHEMA)))
    throw new Error('Schema mismatch: guided export must use the frozen current schema; no automatic legacy remapping');
  if (manifest.csv_text_policy != null && manifest.csv_text_policy !== CSV_TEXT_POLICY)
    throw new Error('CSV integrity: unsupported spreadsheet text policy');
  const parsed = readCSV(text), schema = manifest.schema;
  const columns = [...CSV_RECORD_COLUMNS, ...schema.map(f => f.key)];
  requireColumns(parsed.header, columns);
  if (parsed.records.length !== manifest.records.length) throw new Error('CSV integrity: record count differs from manifest');
  const encode = manifest.csv_text_policy === CSV_TEXT_POLICY ? spreadsheetSafeValue : value => value == null ? '' : String(value);
  const used = new Set();
  for (const record of manifest.records) {
    const expected = Object.fromEntries(columns.map(column => {
      const value = column in record ? record[column]
        : column === 'file' ? record.image.file : column === 'sha256' ? record.image.sha256
        : column === 'source' ? record.image.source : record.meta?.[column];
      return [column, encode(value)];
    }));
    const index = parsed.records.findIndex((row, i) => !used.has(i) && columns.every(column => row[column] === expected[column]));
    if (index < 0) throw new Error('CSV integrity: decoded values disagree with manifest/policy');
    used.add(index);
  }
  return 'verified against raw manifest using declared CSV text policy';
}

function imageAudit(records, tasks, readImage) {
  let present = 0, missing = 0, unverified = 0, associationMatches = 0, associationMismatches = 0, associationUnverified = 0;
  for (const task of tasks) {
    const record = records.find(r => String(r.task_id) === String(task.task_id));
    const bytes = record?.file && readImage ? readImage(record.file) : null;
    if (!record?.file) missing++;
    else if (!readImage) unverified++;
    else if (bytes) present++;
    else missing++;
    if (task.image_sha256 == null || !readImage) associationUnverified++;
    else if (bytes && digest(bytes) === task.image_sha256) associationMatches++;
    else associationMismatches++;
  }
  return {
    image_files_present: present, image_files_missing: missing, image_files_unverified: unverified,
    image_existence: readImage ? 'checked actual supplied bytes for each assigned task' : 'unverified (CSV only)',
    task_image_matches: associationMatches, task_image_mismatches_or_missing: associationMismatches,
    task_image_unverified: associationUnverified,
    task_image_association: associationUnverified ? 'partly or wholly unverified; no inference from filename' : 'checked against frozen task-image hashes (prepared images, not scene truth)'
  };
}

export function scoreStudy(truth, dir) {
  const tasks = truth.tasks;
  if (!Array.isArray(tasks)) throw new Error('Truth must include tasks');
  // Validate identity even with no participant files. Never count task IDs as metadata cells.
  scoreAgainstTruth([], tasks);
  for (const task of tasks) if (task.image_sha256 != null && !/^[a-f0-9]{64}$/.test(task.image_sha256))
    throw new Error('Invalid frozen image SHA256 for task ' + task.task_id);
  const files = readdirSync(dir);
  const ignored_files = [];
  for (const file of files) {
    const match = file.match(/^(P\d{2,})-(guided\.zip|baseline\.csv|baseline-images)$/);
    if (!match) {
      if (/^P[^/]*-/i.test(file)) throw new Error('Invalid participant output filename: ' + file);
      ignored_files.push(file);
      continue;
    }
    const isDirectory = statSync(join(dir, file)).isDirectory();
    if (isDirectory !== (match[2] === 'baseline-images')) throw new Error('Incorrect participant output file/directory type: ' + file);
    if (match[2] === 'baseline-images' && !files.includes(match[1] + '-baseline.csv'))
      throw new Error('Baseline image folder has no corresponding CSV: ' + file);
  }
  const ids = [...new Set(files.map(f => f.match(/^(P\d{2,})-(?:guided\.zip|baseline\.csv)$/)?.[1]).filter(Boolean))].sort();
  const observations = [], sessionOwners = new Map();
  for (const pid of ids) for (const cond of CONDITIONS) {
    let recs, readImage = null, integrity, csvIntegrity = 'not applicable', guidedSessionId = null, draftIncluded = null;
    if (cond === 'baseline') {
      const file = join(dir, `${pid}-baseline.csv`);
      if (!existsSync(file)) continue;
      const parsed = readCSV(readFileSync(file, 'utf8'));
      if (BASE_COLUMNS.some(k => !parsed.header.includes(k)) || parsed.header.some(k => ![...BASE_COLUMNS, 'notes'].includes(k)))
        throw new Error('Baseline CSV missing required columns or contains unexpected columns');
      recs = parsed.records.map(r => ({ task_id: r.task_id, file: r.file, meta: r }));
      integrity = 'unverified (CSV only; no baseline manifest)';
      const imageDir = join(dir, `${pid}-baseline-images`);
      if (existsSync(imageDir)) {
        const root = realpathSync(imageDir);
        readImage = file => {
          if (!safeFile(file)) return null;
          const path = join(root, file);
          if (!existsSync(path) || !statSync(path).isFile() || !realpathSync(path).startsWith(root + sep)) return null;
          return readFileSync(path);
        };
        integrity = 'actual image files inspected; no baseline manifest digest';
      }
    } else {
      const file = join(dir, `${pid}-guided.zip`);
      if (!existsSync(file)) continue;
      const unzip = args => execFileSync('unzip', args, { maxBuffer: 128 * 1024 * 1024 });
      const members = unzip(['-Z1', file]).toString().trim().split(/\r?\n/);
      if (new Set(members).size !== members.length || members.filter(n => n === 'manifest.json').length !== 1 || members.filter(n => n === 'records.csv').length !== 1)
        throw new Error('ZIP integrity: duplicate members or missing manifest/CSV');
      unzip(['-t', file]);
      const manifest = JSON.parse(unzip(['-p', file, 'manifest.json']).toString());
      if (!Array.isArray(manifest.records)) throw new Error('ZIP integrity: missing records');
      if (typeof manifest.session_id !== 'string' || !manifest.session_id.trim() || manifest.session_id !== manifest.session_id.trim())
        throw new Error('Missing or ambiguous guided session_id');
      if (sessionOwners.has(manifest.session_id) && sessionOwners.get(manifest.session_id) !== pid)
        throw new Error('Duplicate guided session_id across participants: ' + sessionOwners.get(manifest.session_id) + ' and ' + pid);
      sessionOwners.set(manifest.session_id, pid);
      guidedSessionId = manifest.session_id;
      draftIncluded = members.includes('draft.json');
      if (manifest.draft_included != null && (typeof manifest.draft_included !== 'boolean' || manifest.draft_included !== draftIncluded))
        throw new Error('ZIP integrity: draft declaration disagrees with actual draft member');
      for (const record of manifest.records) {
        const name = record.image?.file;
        if (!safeFile(name) || !members.includes('images/' + name)) throw new Error('ZIP integrity: missing or unsafe image member');
        if (digest(unzip(['-p', file, 'images/' + name])) !== record.image.sha256) throw new Error('ZIP integrity: SHA256 mismatch');
      }
      csvIntegrity = checkGuidedCSV(unzip(['-p', file, 'records.csv']).toString(), manifest);
      recs = manifest.records.map(r => ({ task_id: r.task_id, file: r.image.file, meta: r.meta }));
      readImage = name => safeFile(name) && members.includes('images/' + name) ? unzip(['-p', file, 'images/' + name]) : null;
      integrity = 'SHA256 and CRC verified (internal bytes, not scene truth)';
    }
    const scored = scoreAgainstTruth(recs, tasks);
    const missingLinks = tasks.filter(t => !recs.find(r => String(r.task_id) === String(t.task_id))?.file).length;
    observations.push({ pid, cond, records: recs.length, metadata_cells: scored.cells,
      completeness: +(scored.completeness * 100).toFixed(3), accuracy: +(scored.accuracy * 100).toFixed(3),
      format_errors: formatErrors(recs), missing_image_links: missingLinks,
      guided_session_id: guidedSessionId, draft_included: draftIncluded,
      image_integrity: integrity, csv_integrity: csvIntegrity, ...imageAudit(recs, tasks, readImage) });
  }
  const metrics = ['completeness', 'accuracy', 'format_errors', 'missing_image_links'];
  const pairs = pairRows(observations, metrics);
  return { unit: 'participant; metadata denominator includes all assigned task cells', observations, ignored_files, ...pairs,
    descriptive_by_condition: CONDITIONS.map(cond => {
      const rows = observations.filter(r => r.cond === cond);
      return { cond, n: rows.length, ...Object.fromEntries(metrics.map(k => [k, mean(rows.map(r => r[k]))])) };
    }),
    paired_summary: { n: pairs.complete.length, difference: 'guided minus baseline; percentage-point differences for completeness/accuracy',
      ...Object.fromEntries(metrics.map(k => [k + '_mean_difference', mean(pairs.complete.map(r => r[k + '_guided_minus_baseline']))])) },
    caveat: 'Descriptive condition summaries include all available participants. Paired differences include complete pairs only. Missing exports and exclusions must also be recorded in the collection log. File/byte agreement does not establish real-world truth.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [truthPath, dir] = process.argv.slice(2);
  if (!truthPath || !dir) throw new Error('Usage: node eval/score.mjs truth.json results-dir [--json]');
  const result = scoreStudy(JSON.parse(readFileSync(truthPath, 'utf8')), dir);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.table(result.observations);
    console.log('Descriptive summaries, not an unpaired effect:');
    for (const row of result.descriptive_by_condition) if (row.n)
      console.log(`${row.cond}: n=${row.n} completeness=${row.completeness.toFixed(1)}% accuracy=${row.accuracy.toFixed(1)}% format_errors=${row.format_errors.toFixed(1)} missing_images=${row.missing_image_links.toFixed(1)}`);
    console.log(`Complete pairs: ${result.complete.length}; incomplete participants: ${result.missing.length}`);
    console.table(result.complete);
    if (result.missing.length) console.table(result.missing);
    console.log('Paired differences:', result.paired_summary);
    if (result.ignored_files.length) console.log('Non-participant files ignored:', result.ignored_files);
    console.log(result.caveat);
  }
}

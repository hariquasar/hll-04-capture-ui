import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scratch } from './paths.mjs';
import { spawnSync } from 'node:child_process';
import { zip, toCSV, SCHEMA, CSV_TEXT_POLICY } from '../src/core.mjs';
import { summarizeTiming, TIMING_COLUMNS } from '../eval/sus.mjs';
import { checkGuidedCSV, scoreStudy } from '../eval/score.mjs';
import { readCSV } from '../eval/csv.mjs';
import { createHash } from 'node:crypto';
const dir = () => mkdtempSync(join(scratch, 'hll-eval-'));
const run = (script, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const good = { scenario: 'indoor', location: 'Lab', subject_id: 'EQ-1234', condition: 'good' };
const bytes = Buffer.from('synthetic integrity fixture, not an image');
const image = { file: 'fixture.png', sha256: createHash('sha256').update(bytes).digest('hex') };
function guided(records, members = [{ name: 'images/fixture.png', data: bytes }], csv = null) {
 const d = dir(); const truth = join(d, 'truth.json');
 writeFileSync(truth, JSON.stringify({ tasks: [{ task_id: 1, ...good }, { task_id: 2, ...good, location: 'Other' }] }));
 writeFileSync(join(d, 'P01-guided.zip'), zip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify({ session_id: 'S-SYNTHETIC-TEST', records, schema: SCHEMA, csv_text_policy: CSV_TEXT_POLICY })) },
  { name: 'records.csv', data: Buffer.from(csv ?? toCSV({ records })) }, ...members]));
 return run('eval/score.mjs', truth, d);
}
test('scorer rejects missing, duplicate, unknown and ambiguous IDs', () => {
 for (const ids of [[undefined], ['1', '1'], ['01'], [' 1'], [true]]) {
  const r = guided(ids.map(task_id => ({ task_id, meta: good, image })));
  assert.notEqual(r.status, 0, JSON.stringify(ids));
  assert.match(r.stderr, /task ID/i);
 }
});
test('guided integrity checks actual ZIP members and SHA256', () => {
 const rec = { task_id: '1', meta: good, image };
 for (const members of [[], [{ name: 'images/fixture.png', data: Buffer.from('tampered') }],
  [{ name: 'images/fixture.png', data: bytes }, { name: 'images/fixture.png', data: bytes }]]) {
  const r = guided([rec], members); assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /integrity/i);
 }
 assert.equal(guided([rec]).status, 0);
});
test('baseline without supplied images is explicitly unverified', () => {
 const d = dir(); writeFileSync(join(d, 'truth.json'), JSON.stringify({ tasks: [{ task_id: 1, ...good }] }));
 writeFileSync(join(d, 'P01-baseline.csv'), 'task_id,file,scenario,location,subject_id,condition\n1,a.png,indoor,Lab,EQ-1234,good\n');
 const r = run('eval/score.mjs', join(d, 'truth.json'), d);
 assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /unverified/);
});
test('even-sized time median averages the middle pair', () => {
 const d = dir(), p = join(d, 'timing.csv');
 writeFileSync(p, 'pid,cond,seconds,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10\n' + [10, 20].map((s,i) => `P0${i+1},guided,${s},5,1,5,1,5,1,5,1,5,1`).join('\n'));
 const r = run('eval/sus.mjs', p); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /median_time=15s/);
});
test('SUS rejects incomplete, fractional, out-of-range scores and invalid time', () => {
 const d = dir(), p = join(d, 'timing.csv');
 const header = 'pid,cond,seconds,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10\n';
 const qs = ['5,1,5,1,5,1,5,1,5', '5,1,5,1,5,1,5,1,5,', '0,1,5,1,5,1,5,1,5,1', '6,1,5,1,5,1,5,1,5,1', '2.5,1,5,1,5,1,5,1,5,1', '5,1,5,1,5,1,5,1,5,1,3'];
 for (const q of qs) { writeFileSync(p, header + `P01,guided,10,${q}`); assert.notEqual(run('eval/sus.mjs', p).status, 0, q); }
 for (const t of ['', '-1', 'Infinity', 'NaN']) { writeFileSync(p, header + `P01,guided,${t},5,1,5,1,5,1,5,1,5,1`); assert.notEqual(run('eval/sus.mjs', p).status, 0, t); }
});
test('conflicting task identities are rejected rather than guessed', () => {
 const r = guided([{ task_id: '1', meta: { ...good, task_id: '2' }, image }]);
 assert.notEqual(r.status, 0); assert.match(r.stderr, /task ID/i);
});
test('baseline task identifiers are not silently trimmed', () => {
 const d = dir(); writeFileSync(join(d, 'truth.json'), JSON.stringify({ tasks: [{ task_id: 1, ...good }] }));
 writeFileSync(join(d, 'P01-baseline.csv'), 'task_id,file,scenario,location,subject_id,condition\n 1,a.png,indoor,Lab,EQ-1234,good\n');
 const r = run('eval/score.mjs', join(d, 'truth.json'), d); assert.notEqual(r.status, 0); assert.match(r.stderr, /task ID/);
});
test('duplicate task_id CSV columns are ambiguous and rejected', () => {
 const d = dir(); writeFileSync(join(d, 'truth.json'), JSON.stringify({ tasks: [{ task_id: 1, ...good }] }));
 writeFileSync(join(d, 'P01-baseline.csv'), 'task_id,task_id,file\n2,1,a.png\n');
 assert.notEqual(run('eval/score.mjs', join(d, 'truth.json'), d).status, 0);
});
test('scorer maps explicit task IDs, not array order', () => {
 const r = guided([{ task_id: '2', meta: { ...good, location: 'Other' }, image }, { task_id: '1', meta: good, image }]);
 assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /accuracy=100.0%/);
});

const timing = rows => TIMING_COLUMNS.join(',') + '\n' + rows.join('\n');
const timingRow = (pid, cond, seconds, scores = '5,1,5,1,5,1,5,1,5,1') => `${pid},${cond},${seconds},${scores}`;
test('duplicate participant-condition rows reject the entire timing input', () => {
 for (const repeat of [timingRow('P01', 'guided', 10), timingRow('P01', 'guided', 999)])
  assert.throws(() => summarizeTiming(timing([timingRow('P01', 'baseline', 20), timingRow('P01', 'guided', 10), repeat])), /Duplicate participant\+condition/);
});
test('paired timing differences exclude incomplete participants without hiding their rows', () => {
 const result = summarizeTiming(timing([
  timingRow('P01', 'baseline', 100), timingRow('P01', 'guided', 80, '3,3,3,3,3,3,3,3,3,3'),
  timingRow('P02', 'baseline', 200), timingRow('P02', 'guided', 240), timingRow('P03', 'guided', 900)
 ]));
 assert.equal(result.observations.length, 5);
 assert.deepEqual(result.missing, [{ pid: 'P03', missing: 'baseline' }]);
 assert.equal(result.paired_summary.n, 2);
 assert.equal(result.paired_summary.mean_seconds_difference, 10);
 assert.equal(result.paired_summary.median_seconds_difference, 10);
 assert.equal(result.paired_summary.mean_sus_difference, -25);
 assert.equal(result.descriptive_by_condition.find(r => r.cond === 'guided').n, 3);
});
test('empty and entirely unpaired timing files do not manufacture zero effects', () => {
 const empty = summarizeTiming(timing([]));
 assert.equal(empty.paired_summary.n, 0); assert.equal(empty.paired_summary.mean_seconds_difference, null);
 const unpaired = summarizeTiming(timing([timingRow('P01', 'guided', 10), timingRow('P02', 'baseline', 12)]));
 assert.equal(unpaired.complete.length, 0); assert.equal(unpaired.missing.length, 2);
 assert.equal(unpaired.paired_summary.mean_sus_difference, null);
});
test('timing rejects malformed identities, headers and coercible-but-invalid numbers', () => {
 for (const pid of ['P1', ' P01', 'P01 ', 'participant']) assert.throws(() => summarizeTiming(timing([timingRow(pid, 'guided', 10)])), /participant/);
 for (const cond of ['guided ', 'Guided', '']) assert.throws(() => summarizeTiming(timing([timingRow('P01', cond, 10)])));
 for (const value of ['1e3', '0x10', ' 12', 'NaN', 'Infinity']) assert.throws(() => summarizeTiming(timing([timingRow('P01', 'guided', value)])));
 assert.throws(() => summarizeTiming(timing([]).replace('q10', 'q9')), /header/);
 assert.throws(() => summarizeTiming(timing([]).replace('q10', 'extra')), /columns/);
});
test('CSV parser preserves quoted line breaks, commas and quotes and rejects malformed rows', () => {
 assert.deepEqual(readCSV('a,b\r\n"x, y","line1\r\nline2 ""quoted"""\r\n').records, [{ a: 'x, y', b: 'line1\r\nline2 "quoted"' }]);
 for (const input of ['a,b\n1', 'a,b\n1,2,3', 'a,b\n"x,2', 'a,b\n"x"junk,2']) assert.throws(() => readCSV(input));
});
test('guided CSV verifies safe spreadsheet text against raw manifest without unescaping data', () => {
 const record = { task_id: '1', meta: { ...good, location: '=Lab', notes: "'literal,quote\r\nnext" }, image, operator: '  =formula' };
 const manifest = { records: [record], schema: SCHEMA, csv_text_policy: CSV_TEXT_POLICY };
 const csv = toCSV({ records: [record] });
 const row = readCSV(csv).records[0];
 assert.equal(row.location, "'=Lab"); assert.equal(row.notes, "''literal,quote\r\nnext"); assert.equal(row.operator, "'  =formula");
 assert.match(checkGuidedCSV(csv, manifest), /verified/);
 assert.throws(() => checkGuidedCSV(csv.replace("'=Lab", '=Lab'), manifest), /CSV integrity/);
 assert.throws(() => checkGuidedCSV(csv.replace('good', 'poor'), manifest), /CSV integrity/);
 assert.throws(() => checkGuidedCSV(csv, { ...manifest, csv_text_policy: 'unknown' }), /policy/);
 const legacy = toCSV({ records: [{ task_id: '1', meta: good, image }] });
 assert.match(checkGuidedCSV(legacy, { records: [{ task_id: '1', meta: good, image }], schema: SCHEMA }), /verified/);
});
test('CSV disagreement is rejected even if manifest and image hashes are internally valid', () => {
 const record = { task_id: '1', meta: good, image };
 const result = guided([record], undefined, toCSV({ records: [record] }).replace('good', 'poor'));
 assert.notEqual(result.status, 0); assert.match(result.stderr, /CSV integrity/);
});
test('baseline physical availability and frozen association are distinct from filename presence', () => {
 const d = dir(), folder = join(d, 'P01-baseline-images'); mkdirSync(folder);
 writeFileSync(join(folder, 'a.png'), bytes);
 writeFileSync(join(d, 'P01-baseline.csv'), 'task_id,file,scenario,location,subject_id,condition\n1,a.png,indoor,Lab,EQ-1234,good\n2,missing.png,indoor,Lab,EQ-1234,good\n');
 const result = scoreStudy({ tasks: [{ task_id: '1', ...good, image_sha256: image.sha256 }, { task_id: '2', ...good, image_sha256: image.sha256 }] }, d);
 const row = result.observations[0];
 assert.equal(row.missing_image_links, 0); assert.equal(row.image_files_present, 1); assert.equal(row.image_files_missing, 1);
 assert.equal(row.task_image_matches, 1); assert.equal(row.task_image_mismatches_or_missing, 1); assert.equal(row.task_image_unverified, 0);
 assert.equal(result.complete.length, 0); assert.deepEqual(result.missing, [{ pid: 'P01', missing: 'guided' }]);
});
test('invalid output names and orphan image folders fail instead of silently losing participants', () => {
 for (const file of ['P1-guided.zip', 'P01-gudied.zip', 'PXX-baseline.csv']) {
  const d = dir(); writeFileSync(join(d, file), 'invalid');
  assert.throws(() => scoreStudy({ tasks: [{ task_id: '1', ...good }] }, d), /filename/);
 }
 const d = dir(); mkdirSync(join(d, 'P01-baseline-images'));
 assert.throws(() => scoreStudy({ tasks: [{ task_id: '1', ...good }] }, d), /no corresponding CSV/);
});

test('scoring reports paired outcomes and incomplete participants separately', () => {
 const d = dir(), task = { task_id: '1', ...good, image_sha256: image.sha256 };
 writeFileSync(join(d, 'P01-baseline.csv'), 'task_id,file,scenario,location,subject_id,condition\n1,fixture.png,indoor,Wrong,EQ-1234,good\n');
 const record = { task_id: '1', meta: good, image };
 for (const pid of ['P01', 'P02']) writeFileSync(join(d, pid + '-guided.zip'), zip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ session_id: 'S-SYNTHETIC-' + pid, records: [record], schema: SCHEMA, csv_text_policy: CSV_TEXT_POLICY })) },
  { name: 'records.csv', data: Buffer.from(toCSV({ records: [record] })) },
  { name: 'images/fixture.png', data: bytes }
 ]));
 const result = scoreStudy({ tasks: [task] }, d);
 assert.equal(result.paired_summary.n, 1); assert.equal(result.paired_summary.accuracy_mean_difference, 25);
 assert.equal(result.descriptive_by_condition.find(r => r.cond === 'guided').n, 2);
 assert.deepEqual(result.missing, [{ pid: 'P02', missing: 'baseline' }]);
});

test('copied guided session cannot become two independent participants by renaming its archive', () => {
 const d = dir(), record = { task_id: '1', meta: good, image };
 const archive = zip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ session_id: 'S-ONE-SYNTHETIC-SESSION', records: [record], schema: SCHEMA, csv_text_policy: CSV_TEXT_POLICY })) },
  { name: 'records.csv', data: Buffer.from(toCSV({ records: [record] })) }, { name: 'images/fixture.png', data: bytes }
 ]);
 for (const pid of ['P01', 'P02']) writeFileSync(join(d, pid + '-guided.zip'), archive);
 assert.throws(() => scoreStudy({ tasks: [{ task_id: '1', ...good }] }, d), /Duplicate guided session_id across participants/);
});
test('guided scoring fails closed when schema is absent or differs from the frozen schema', () => {
 const record = { task_id: '1', meta: good, image }, csv = toCSV({ records: [record] });
 for (const schema of [undefined, SCHEMA.filter(f => f.key !== 'location'), SCHEMA.map(f => f.key === 'location' ? { ...f, required: false } : f)])
  assert.throws(() => checkGuidedCSV(csv, { records: [record], schema, csv_text_policy: CSV_TEXT_POLICY }), /Schema mismatch/);
});
test('scoring refuses missing or invalid required truth fields before reading participant files', () => {
 for (const broken of [{ ...good, condition: undefined }, { ...good, location: '' }, { ...good, scenario: 'not-an-option' }, { ...good, subject_id: 'bad' }])
  assert.throws(() => scoreStudy({ tasks: [{ task_id: '1', ...broken }] }, dir()), /truth/i);
});
test('guided session identity and unfinished-draft presence are exposed without scoring the draft', () => {
 const d = dir(), record = { task_id: '1', meta: good, image };
 writeFileSync(join(d, 'P01-guided.zip'), zip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ session_id: 'S-SYNTHETIC-WITH-DRAFT', records: [record], schema: SCHEMA, csv_text_policy: CSV_TEXT_POLICY, draft_included: true })) },
  { name: 'records.csv', data: Buffer.from(toCSV({ records: [record] })) }, { name: 'images/fixture.png', data: bytes },
  { name: 'draft.json', data: Buffer.from(JSON.stringify({ meta: { task_id: '2' }, image: null })) }
 ]));
 const result = scoreStudy({ tasks: [{ task_id: '1', ...good }, { task_id: '2', ...good }] }, d);
 assert.equal(result.observations[0].guided_session_id, 'S-SYNTHETIC-WITH-DRAFT');
 assert.equal(result.observations[0].draft_included, true);
 assert.equal(result.observations[0].records, 1); assert.equal(result.observations[0].completeness, 50);
});

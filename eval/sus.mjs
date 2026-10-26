// Whole six-task block time + SUS; unit of comparison is the participant.
// node eval/sus.mjs eval/timing-sus.csv [--json]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readCSV, requireColumns } from './csv.mjs';
import { pairRows, mean, median, CONDITIONS } from './pairs.mjs';

export const TIMING_COLUMNS = ['pid', 'cond', 'seconds', ...Array.from({ length: 10 }, (_, i) => 'q' + (i + 1))];
export const sus = q => {
  if (!Array.isArray(q) || q.length !== 10 || !Array.from(q).every(v => Number.isInteger(v) && v >= 1 && v <= 5))
    throw new Error('SUS requires exactly ten integer scores in 1..5');
  return 2.5 * q.reduce((a, v, i) => a + (i % 2 === 0 ? v - 1 : 5 - v), 0);
};
export function summarizeTiming(text) {
  const parsed = readCSV(text);
  requireColumns(parsed.header, TIMING_COLUMNS);
  const observations = parsed.records.map(r => {
    if (TIMING_COLUMNS.some(k => !r[k].trim())) throw new Error('Incomplete timing/SUS row: exactly 13 nonempty cells required');
    const seconds = Number(r.seconds);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(r.seconds) || !Number.isFinite(seconds) || seconds < 0)
      throw new Error('Time must be nonnegative and finite decimal seconds');
    const q = TIMING_COLUMNS.slice(3).map(k => {
      if (!/^[1-5]$/.test(r[k])) throw new Error('SUS requires exactly ten integer scores in 1..5');
      return Number(r[k]);
    });
    return { pid: r.pid, cond: r.cond, seconds, sus: sus(q) };
  });
  const pairs = pairRows(observations, ['seconds', 'sus']);
  const descriptive_by_condition = CONDITIONS.map(cond => {
    const rows = observations.filter(r => r.cond === cond);
    return { cond, n: rows.length, mean_seconds: mean(rows.map(r => r.seconds)), median_seconds: median(rows.map(r => r.seconds)), mean_sus: mean(rows.map(r => r.sus)) };
  });
  return {
    unit: 'participant; time is the entire six-task block including recovery',
    observations, descriptive_by_condition, ...pairs,
    paired_summary: { n: pairs.complete.length, difference: 'guided minus baseline; negative time is shorter, positive SUS is higher',
      mean_seconds_difference: mean(pairs.complete.map(r => r.seconds_guided_minus_baseline)),
      median_seconds_difference: median(pairs.complete.map(r => r.seconds_guided_minus_baseline)),
      mean_sus_difference: mean(pairs.complete.map(r => r.sus_guided_minus_baseline)) },
    caveat: 'Condition summaries describe all available rows, not an unpaired treatment comparison. Paired differences use complete pairs only. Participants absent from both conditions cannot be counted without the collection log. No inference or imputation.'
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node eval/sus.mjs timing-sus.csv [--json]');
  const result = summarizeTiming(readFileSync(process.argv[2], 'utf8'));
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.table(result.observations);
    console.log('Descriptive summaries of all available rows; not a paired effect:');
    for (const r of result.descriptive_by_condition) {
      if (!r.n) { console.log(`${r.cond}: n=0; no observations`); continue; }
      console.log(`${r.cond}: n=${r.n} mean_time=${r.mean_seconds.toFixed(1)}s median_time=${r.median_seconds}s mean_SUS=${r.mean_sus.toFixed(1)}`);
    }
    console.log(`Complete pairs: ${result.complete.length}; incomplete participants: ${result.missing.length}`);
    console.table(result.complete);
    if (result.missing.length) console.table(result.missing);
    console.log('Paired differences (guided minus baseline):', result.paired_summary);
    console.log(result.caveat);
  }
}

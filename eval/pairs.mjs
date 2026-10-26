export const CONDITIONS = ['baseline', 'guided'];
export const validPid = pid => typeof pid === 'string' && /^P\d{2,}$/.test(pid);
export function pairRows(rows, metrics) {
  const participants = new Map();
  for (const row of rows) {
    if (!validPid(row.pid) || !CONDITIONS.includes(row.cond)) throw new Error('Invalid participant ID or condition');
    const participant = participants.get(row.pid) || {};
    if (participant[row.cond]) throw new Error(`Duplicate participant+condition: ${row.pid}/${row.cond}`);
    participant[row.cond] = row;
    participants.set(row.pid, participant);
  }
  const complete = [], missing = [];
  for (const [pid, conditions] of [...participants].sort(([a], [b]) => a.localeCompare(b))) {
    if (!conditions.baseline || !conditions.guided) {
      missing.push({ pid, missing: CONDITIONS.filter(c => !conditions[c]).join(',') });
      continue;
    }
    const pair = { pid };
    for (const metric of metrics) pair[metric + '_guided_minus_baseline'] = conditions.guided[metric] - conditions.baseline[metric];
    complete.push(pair);
  }
  return { complete, missing, participants_observed: participants.size };
}
export function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

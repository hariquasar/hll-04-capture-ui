// Read-only verification: fails on unrecorded changes to this frozen study kit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = JSON.parse(readFileSync(join(root, 'study-freeze.json')));
for (const [relative, expected] of Object.entries(freeze.artifacts_sha256)) {
  if (!relative.startsWith('eval/') && !relative.startsWith('src/')) throw new Error('Unexpected freeze artifact path');
  if (relative.includes('..')) throw new Error('Unsafe freeze artifact path');
  if (hash(readFileSync(resolve(root, '..', relative))) !== expected) throw new Error('Frozen artifact changed: ' + relative);
}
const truth = JSON.parse(readFileSync(join(root, 'truth.json')));
const config = JSON.parse(readFileSync(join(root, 'study-config.json')));
if (JSON.stringify(truth.tasks.map(t => t.task_id)) !== JSON.stringify(config.task_ids) || config.task_ids.join(',') !== '1,2,3,4,5,6') throw new Error('Study IDs do not match frozen six-task contract');
if (truth.scoring.metadata_cells_per_condition !== 24 || config.metadata_cells_per_condition !== 24) throw new Error('Study metadata denominator is not 24');
if (new Set(truth.tasks.map(t => t.image_sha256)).size !== 6) throw new Error('Study images must be six distinct byte fixtures');
for (const task of truth.tasks) {
  const bytes = readFileSync(join(root, 'prepared-images', task.image_file));
  if (hash(bytes) !== task.image_sha256) throw new Error('Task image hash changed: ' + task.task_id);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Prepared task input is not a PNG');
}
console.log(JSON.stringify({ status: 'verified', version: config.version, tasks: 6, metadata_cells_per_condition: 24, artifacts: Object.keys(freeze.artifacts_sha256).length, participant_data: 'not asserted; this verifies instruments only' }, null, 2));

// Keep synthetic test data and isolated Chrome profiles in an explicit test directory.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export const scratch = resolve(process.env.HLL04_TEST_DIR || '.test-artifacts');
mkdirSync(scratch, { recursive: true });
process.env.TMPDIR = scratch;

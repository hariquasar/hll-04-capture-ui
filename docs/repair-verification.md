# Repair verification — HLL-04

**Historical repair-pass record, 16 October 2026.** Statements below about untouched or unsynchronized report drafts apply to that earlier pass only. A subsequent same-day continuation synchronized the reports and reran 24/24 Node and 30/30 Chrome checks, plus 22/22 assertions in a separate synthetic mobility workflow. Current evidence: `evaluation-engineering/REPORT.md`. Original repair logs and archives remain unchanged.

## Outcome and scope

Local implementation repaired and exercised: **24/24 Node core/evaluation tests passed**, **30/30 headless Chrome checks passed**, no browser `pageerror`, and `git diff --check` passed. These are synthetic engineering checks, not participant data or usability findings. Images plus metadata remain a working assumption, not actual stakeholder acceptance or ethics approval. No participants, messages, remote push, commits, vault edits or report-draft DOCX/PDF changes were made.

Repository: `/Users/hoyinshum/projects/hll-04-capture-ui`.
Original implementation: `9b58d081b8cfda492442a392fd4f9c0b407aa753`.
The pre-existing untracked report sources/evidence and draft Markdown/DOCX/PDF were left untouched. README and evaluation protocol now describe the repaired behavior; the report drafts still need later synchronization.

## RED → GREEN evidence

Each behavior below was tested before its implementation change. Commands were run from the repository root. Failure excerpts are transcribed from actual terminal output during this task; the final full-suite logs are retained separately.

| Regression | Exact RED command | Observed RED | GREEN |
|---|---|---|---|
| ID allocation after deletion/reload | `node --test --test-name-pattern='IDs survive' tests/core.test.mjs` | Expected `/-004$/`, actual `S-20261016T064531-003` | Same test passed after persisted high-water allocation |
| Duplicate save event | `node --test --test-name-pattern='duplicate image' tests/core.test.mjs` | actual `save_ok`, expected `save_blocked` | Same test passed; duplicate validation precedes event logging |
| Optional task ID export | `node --test --test-name-pattern='optional evaluation' tests/core.test.mjs` | `undefined !== '6'` | Same test and full core suite passed |
| Explicit task mapping, reordered input | `node --test tests/eval.test.mjs` (first one-test version) | expected `accuracy=100.0%`, actual `accuracy=75.0%` | Reordered explicit IDs score 100% in synthetic fixture |
| Missing/duplicate/unknown/ambiguous task IDs | `node --test tests/eval.test.mjs` (two-test version) | Missing-ID input incorrectly exited 0 | All invalid-ID fixture variants now exit nonzero |
| Guided ZIP linkage and hash integrity | `node --test --test-name-pattern='guided integrity' tests/eval.test.mjs` | Missing actual image member still exited 0 | Missing member, tampered bytes and duplicate member all rejected; intact archive accepted |
| Baseline linkage honesty | `node --test --test-name-pattern='baseline without' tests/eval.test.mjs` | No `unverified` label | CSV-only linkage explicitly labelled unverified |
| Even-sized median | `node --test --test-name-pattern='even-sized' tests/eval.test.mjs` | Synthetic times 10,20 reported `median_time=20s`, expected 15s | Same test passed with 15s |
| SUS/time input validation | `node --test --test-name-pattern='SUS rejects' tests/eval.test.mjs` | Nine-item answer incorrectly exited 0 | Missing/extra/blank/fractional/out-of-range answers and blank/negative/nonfinite times rejected |
| Conflicting record/metadata IDs | `node --test --test-name-pattern='conflicting task' tests/eval.test.mjs` | Conflicting identities incorrectly exited 0 | Nonzero exit with task-ID error |
| UI task-ID syntax preservation | `node --test --test-name-pattern='evaluation IDs' tests/core.test.mjs` | Invalid whitespace task ID saved (`true !== false`) | Whitespace/punctuation rejected instead of normalized |
| Baseline ID normalization | `node --test --test-name-pattern='not silently trimmed' tests/eval.test.mjs` | Leading-space ID incorrectly exited 0 | Original ID retained and rejected |
| Ambiguous CSV ID headers | `node --test --test-name-pattern='duplicate task_id CSV' tests/eval.test.mjs` | Duplicate header incorrectly exited 0 | Duplicate header rejected |
| Visible capture→review route | `node tests/e2e.mjs` | `FAIL visible review navigation from capture`, then selector timeout for `#reviewCapture` | Real Review button used; hidden-DOM mutation removed |
| Stale validation summary | `node tests/e2e.mjs` | `FAIL validation summary clears once all fields fixed` | Summary recomputed/cleared on input; form build clears stale state |
| Recoverable storage warning | `node tests/e2e.mjs` | `FAIL persistent storage warning on quota failure`, then missing `#storageWarning` timeout | Persistent warning, Retry and export route pass; no false durable-save toast |
| Invalid image data | `node tests/e2e.mjs` | Both `invalid image cannot enable next` and `invalid image has visible error` failed | Browser decode plus PNG/JPEG/WebP/type/size gate rejects fake image |

The expanded E2E also verifies real reload/resume, deletion followed by reload/add, download recovery while storage is failing, and actual ZIP contents/hash. Those integration checks supplement the corresponding earlier RED regressions; they are not claimed to have independently failed before every already-tested fix.

### Retained retrospective baseline replay

For durable RED evidence, the original `src/core.mjs`, `eval/score.mjs` and `eval/sus.mjs` were retrieved with `git show HEAD:<path>` into:

`/Users/hoyinshum/.hermes/cache/scratch/hll04-red-replay-c6438256`

The final unit/evaluation regression files were copied there and run with:

```sh
node --test tests/*.test.mjs
```

Result: **24 tests, 10 passed, 14 failed, exit 1**. Full output: `docs/repair-evidence/baseline-regression-replay.txt`. This is explicitly a retrospective original-code replay, not a replacement for the per-fix test-first runs. It includes an expected CSV-column incompatibility from the newly added task-ID field, not only pre-existing defects.

## Final commands and artifacts

Start command (tracked background process; working directory `src/`):

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Readiness check returned **HTTP 200**:

```sh
curl --fail -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8765/index.html
```

Final test commands, repository root:

```sh
set -o pipefail
npm test | tee docs/repair-evidence/unit-tests.txt
node tests/e2e.mjs /Users/hoyinshum/projects/hll-04-capture-ui/docs/repair-evidence/hll04 | tee docs/repair-evidence/chrome-e2e.txt
git diff --check
```

Outputs:
- `unit-tests.txt`: tests 24, pass 24, fail 0, cancelled/skipped/todo 0.
- `chrome-e2e.txt`: 30 PASS lines, `Browser checks: 30; exit=0`.
- `hll04-export.zip`: final real browser download after delete/reload/add.
- `hll04-recovery.zip`: actual browser download while localStorage writes were failing; contains the in-memory record absent from the previous stored snapshot.
- `hll04-meta.png`, `hll04-review.png`: screenshots. Review was visually inspected: controls visible, no clipping at the tested desktop viewport. This is not a mobile/accessibility audit.
- `hll04-path.txt`: path to final downloaded archive.

The server was stopped via tracked process `proc_1a97677dbef9`, then an HTTP read verified connection refused. No test server was left running. Its request log contains the existing harmless `/favicon.ico` 404; no application page errors were observed.

### Download integrity, independently read back

Final ZIP SHA-256:

`c4475955b692088355d854e25487b60568acbd97a865d0259eab7dd00d146b0b`

Actual members:

```text
images/bc09c2590d25.png
records.csv
manifest.json
```

Record: `S-20261016T065929-004`, task ID `2` in actual manifest and CSV. Actual image bytes recomputed to:

`bc09c2590d2502c8ffaf1a3c09aa89df222e03d186a8daa0c7fce6321fb6e928`

This matched the manifest and imported PNG bytes; `unzip -t` passed. This proves internal byte integrity, **not semantic task-image correctness**.

## Implementation changes

- `src/core.mjs`: historical/persisted monotonic record counter; duplicate rejection logs correctly; optional evaluation task field/export; explicit strict task identity and ambiguity checks.
- `src/app.js`, `src/index.html`: visible review route; current validation summary; persistent storage warning with retry/export and unload warning; decoded/type/size-checked image import.
- `eval/score.mjs`: explicit-ID matching; ZIP member uniqueness/CRC/member-byte SHA-256; baseline unverified status; no silent baseline-ID trimming; duplicate CSV-header rejection.
- `eval/sus.mjs`: ten integer ratings 1–5; nonempty complete rows, finite nonnegative time; even-n median.
- `tests/core.test.mjs`, new `tests/eval.test.mjs`, `tests/e2e.mjs`, new `tests/paths.mjs`, `package.json`: regressions, all-test command, visible browser flow, archive verification and deterministic scratch setup.
- `README.md`, `eval/PROTOCOL.md`, this document and `docs/repair-evidence/`: runnable commands, evidence, compatibility boundaries and limitations.

## Environment discrepancy and recovery

The supplied runtime description said TMPDIR pointed at Hermes scratch, but a live check later revealed the inherited macOS `/var/folders/.../T/` value. Earlier runs had therefore used that OS temp path through the old tests' `tmpdir()` and initial browser-output default. This was a process error; those early runs cannot honestly be described as scratch-only.

Added `tests/paths.mjs` now creates and forces `/Users/hoyinshum/.hermes/cache/scratch` before fixture creation or Chrome launch, including subprocess inheritance. The final suites and baseline replay were rerun with this bootstrap. A live import confirmed both exported scratch and TMPDIR were that exact path. Removed 76 task-specific early temporary files/directories, selected by known fixture signatures/names and task timestamps, rather than deleting unrelated temp content. Persistent deliverables are under this repository's new `docs/repair-evidence/`, not the system temp directory.

## Remaining limitations / honest compatibility

- Legacy sessions still resume/export; monotonic migration can use retained record and event IDs only. Previously reused IDs or erased history cannot be repaired automatically. IDs are session-scoped, and simultaneous tabs are unsupported.
- Legacy records without explicit task IDs are rejected by evaluation. Obtain an independently evidenced mapping and preserve originals; never infer task order. An omitted task scores zero required cells, unlike a record with no identity, which is an error.
- Baseline CSV linkage remains unverified, even if files are stored beside it. Guided hash checks establish byte consistency, not semantic image correctness, authenticity or non-repudiation.
- localStorage quota remains browser-dependent. Failure recovery was fault-injected at the storage boundary, not measured by filling a real device quota. A forced close can still lose in-memory data; drafts are not persisted until save.
- PNG/JPEG/WebP decoding was exercised in desktop Chrome. Physical cameras, real phone/browser matrices, large-image performance and actual quota sizes were not tested. Valid image decoding does not establish content truth.
- Freeze schema/truth before evaluation. Review-table columns and task cards still require coordinated schema updates. CSV/SUS tools are small local study tools, not general hostile-input ingestion services; ZIP extraction output is capped per command.
- Participant studies, acquisition/device equivalence, approval/consent, usability benefits and industrial generalization remain unverified. No fabricated results were inserted. Existing report drafts deliberately remain unsynchronized.

## Internal quality review

Self-assessment, not independent review: accuracy 4/5 (real outputs and archive bytes verified; semantic/camera claims deliberately excluded); completeness 4/5 (requested prototype paths pass, device testing remains outside this run); clarity 4/5 (contract documented, dense evidence table still needs student review); actionability 4/5 (local code and commands run, study approvals remain prerequisites); conciseness 4/5 (detailed evidence retained here rather than repeated in the final summary). Arithmetic mean: 4.0/5.

Highest-impact next steps: separately synchronize report drafts after student review; agree acquisition equivalence/approval before recruitment; perform real target-device camera/storage tests if that scope is accepted. The user should assess the delivered code/evidence, not treat these self-ratings as approval. Reusable browser/integrity/scratch lessons were added to the active default profile's existing `e2e-testing` skill; no other profile or vault was edited.

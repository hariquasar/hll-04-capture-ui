# Literature-informed remote UI revision — 26 October 2026

The remote protocol remains `HLL04-remote-table-v3` with immutable UI revision
`research-20261026-r1` for new sessions. It shows explicit required labels and
pre-entry format/length/choice hints, defers initial field validation until Save,
focuses the first invalid field, and updates errors already shown when corrected.
Existing sessions remain `legacy-v3` with original first-blur feedback; analysis
selects one revision and excludes the other. Task truth, scoring, baseline,
dropdown controls, SUS and timers are unchanged. This is a literature-informed
refinement; no human superiority result exists.

## Evidence and implementation

| Evidence | Design implication | Actual implementation and limit |
|---|---|---|
| Bargas-Avila et al. (2011), *Enhancing online forms: Use format specifications for fields with format restrictions to help respondents*, experiment with 166 participants. [DOI](https://doi.org/10.1016/j.intcom.2010.08.001) | Explain input restrictions before entry. | Preserve the asset-ID pattern and exact task-ID hint; add visible location minimum length, notes maximum length and listed-choice hints. Required fields explicitly say “(required)”. Rules and stored values are unchanged. This study does not prove these particular labels improve this app. |
| Seckler et al. (2012), *User-friendly locations of error messages in web forms: Put them on the right side of the erroneous input field*, 303 participants. [DOI](https://doi.org/10.1016/j.intcom.2012.03.002) | Keep corrective information close to the field it concerns. | Retain adjacent field errors and their `aria-describedby` links; show invalid state, polite error updates and move focus to the first invalid field after Save. This is proximity-based application, not a replication of every tested position. The focus behavior already existed and is retained. |
| Seckler et al. (2014), *Designing Usable Web Forms—Empirical Evaluation of Web Form Improvement Guidelines*, 65 participants. [DOI](https://doi.org/10.1145/2556288.2557265) | Treat the form as a combination of instructions, layout and feedback. | Maintain the guided entry/review/edit workflow. The paper tested a bundle, so it cannot isolate any feature's effect or establish this app's advantage. |
| Bargas-Avila et al. (2007), *Usable error message presentation in the World Wide Web: Do not show errors right away*, [DOI](https://doi.org/10.1016/j.intcom.2007.01.003) | Validation timing can interrupt entry; first-blur feedback is not universally preferable. | New sessions wait for explicit Save before initial errors. A field with a displayed error can be corrected immediately; errors for other previously valid fields wait for the next Save. This is a design hypothesis, not evidence that this precise timing policy wins on these tasks. |

The electronic-versus-paper study by Zeleke et al. (2019) and the clinical-registry
interface comparison by Nakamura et al. (2026) remain related-work context. Their
comparators and combined interface changes differ from this browser-table study;
no extra feature or claimed effect was inferred from them for this patch.

## Actual execution path

`web/study.mjs` creates a consented session and requests `ui_revision`.
`backend/handler.py` validates the revision, stores it with the assignment and
returns it. The wrapper normalizes missing revision to `legacy-v3`, validates the
server/local match and passes the pinned value to `web/app/app.js` in the iframe
URL. The app uses that value to select feedback behavior. New session envelopes
include the revised provenance, and opening an envelope under a different
revision disables writing instead of replacing it.

For the revision, `buildForm()` does not attach the initial blur validator.
`saveBtn` still runs the original session validation and Save/edit functions,
shows every current error and focuses the first invalid control. Only controls
with a displayed error become eligible for correction feedback. Input/change
updates retain the original draft autosave and raw metadata behavior. Review,
edit, image handling, scoring and ZIP construction use the existing code.

The frozen desktop prototype in `src/` is unchanged. `app/index.html`, `style.css`
and `core.mjs` remain byte-identical to their frozen counterparts. The copied
`app.js` has the documented revision branches and export provenance;
`frontend/prototype-provenance.json` records current hashes.

## Version and data integrity

- Missing `ui_revision` means `legacy-v3` for old sessions, cached creation bodies,
  private receipts, exact pending requests and old exports. Old sessions retain
  first-blur behavior. They are never promoted in place to the research revision.
- Revision is pinned at server assignment. Resume, checkpoint and submission
  reject a revision switch. New receipt acknowledgements must match the client's
  pinned revision before pending data is cleared. Old idempotent receipts and
  request bodies remain unchanged.
- Existing wrapper storage keys, session UUID scopes, practice/measured separation,
  invitation gates and token derivation remain in use. No participant data was
  read, migrated or deleted for this change. Withdrawal remains available using
  a retained credential even when its revision field is absent.
- Backend assignments/checkpoints, private operator JSON/CSVs, both conditions'
  ZIP manifests, response backups and new private receipts identify revision.
  Guided ZIPs also declare `remote_protocol` separately from the reused desktop
  manifest's original format fields.
- `analyze.py` defaults to `--ui-revision research-20261026-r1`. Analyze original
  observations in a separate output directory with `--ui-revision legacy-v3`.
  Other revisions receive `study_ui_revision_mismatch`; a session/checkpoint
  mismatch is also excluded. Raw input exports are preserved. The analysis output
  format is `hll04.remote.analysis.v2`; outcome definitions are unchanged.
- Deploy the backward-compatible backend before the new frontend, preserving the
  existing configuration, secrets, resources and stored sessions. The revised
  frontend will not silently enroll against a backend that lacks this contract.
  Deployment is separate from the local verification described below.

## Verification

Local verification uses synthetic fixtures, isolated browser contexts and local
in-memory storage. No live human results were fetched or added. The browser
checks use actual controls, IndexedDB transactions, generated ZIPs and the real
backend handler through the isolated loopback server.

The local regression runs passed:

| Exact command (from repository root unless noted) | Outcome |
|---|---|
| `python3 -m unittest -v test_handler.py test_export.py` from `remote-study/backend/` | 38 tests passed |
| `python3 -m unittest discover -s remote-study/tests -p 'test_analysis.py' -v` | 22 tests passed |
| `node --test remote-study/frontend/core.test.mjs` | 12 tests passed |
| `node remote-study/frontend/browser.test.mjs` | 45 assertions passed |
| `node remote-study/frontend/recovery.test.mjs` | 10 scenarios passed |
| `node remote-study/frontend/slow-network.test.mjs` | 2 scenarios passed |
| `node remote-study/frontend/hosted-six-record.test.mjs` | 18 assertions passed in the initial local run; the expanded hosted run below adds six provenance assertions |
| `node remote-study/frontend/research-ui.test.mjs` | 33 assertions passed |
| `git diff --check` and SHA256 comparison of the five provenance entries | Passed; frozen `src/` hashes unchanged |

The loopback server was launched with
`HLL04_STUDY_TEST_PORT=18772 python3 remote-study/frontend/local-server.py`.
Each browser command above used `HLL04_STUDY_TEST_URL=http://127.0.0.1:18772`
and an explicit `HLL04_STUDY_TEST_DIR` under the local, ignored directory
`.test-artifacts/research-ui-20261026/`. The corresponding final subdirectories are
`final-browser`, `final-recovery`, `final-slow-network`, `final-six-record` and
`final-research-ui`. Their JSON results and synthetic ZIPs retain the actual
assertions. The revised form's error/hint screenshot was visually inspected;
labels, hints, errors and first-invalid focus were visible without clipping.

Initial broad browser runs timed out waiting for the practice start timestamp;
a later diagnostic run also captured a startup “Failed to fetch” before a session
existed. A nine-worker local static-request check reproduced connection failures
on 9 of 27 GETs. Python's default local server accept backlog was five while Chrome
loaded prepared assets and modules concurrently. The test-only server now uses an
accept backlog of 32, retaining all invitation gates and API rate limits. The
same stress check then passed 27/27, and every final browser suite above passed.
The failed browser diagnostic remains in
`.test-artifacts/research-ui-20261026/local-browser-diagnostic/failure-state.json`;
the passing stress result is `local-static-stress.json`. This repair affects the
isolated local test service, with no change to production network behavior.

## Hosted release verification

On 26 October 2026, the compatible backend was deployed first and reached
`UPDATE_COMPLETE`; the Lambda state was `Active` with `LastUpdateStatus=Successful`.
The downloaded live `index.py` matched the reviewed handler byte for byte,
SHA256 `761cb951fee83daf77cc50a9c33496cb9dc7e132617e5c3bf7e7eedf0537cdd8`.
The function ARN, exact API URL, token/rate secrets, invitation hashes, consented
retention setting and storage configuration were preserved. The pre-execution
CloudFormation review showed a non-replacing code-only Function change and a
conditional FunctionUrl dependency on the unchanged ARN; post-deployment checks
confirmed that the URL did not change. No participant records were read or migrated.

Amplify **job 6** for the [remote study](https://main.d3g93doyp3ywja.amplifyapp.com/)
finished **SUCCEED** at **17:31:33 HKT**. All **21 published static files** matched
the deployment's expected SHA256 values. The separate frozen v2 site's five source
files matched both their pre-deployment bytes and the unchanged local `src/` files.

The expanded `node remote-study/frontend/hosted-six-record.test.mjs` then passed
**24 assertions** against the hosted service with its recognized synthetic-only
invitation. Synthetic assignment **S022** completed both six-record conditions.
The added checks verified the pinned revision in the server assignment, both
actual downloaded ZIP manifests, submission body, server acknowledgement and
downloaded private receipt. The temporary synthetic receipt file was removed
after that check; the synthetic session was not withdrawn. Numeric SUS answers
and comments were explicit automated fixtures, with no human usability result.

`python3 remote-study/frontend/verify-zips.py` independently passed **2/2 archives**:
each contained six saved records and six matching images, with valid ZIP CRC,
unique safe paths, exact image hashes and a CSV/manifest round-trip. Hosted testing
used `HLL04_STUDY_TEST_URL` for the remote origin, `HLL04_STUDY_INVITE_FILE` for a
private synthetic-only invitation file and `HLL04_STUDY_TEST_DIR` for private
outside-repository evidence. No credentials, invitations, temporary receipt or
participant exports were added to Git. The deployment and live-file checks are
infrastructure/engineering evidence; existing human sessions were not inspected.

## Remaining empirical work

Recruit and run the permitted comparison under one declared UI revision. Report
actual completion, missingness, format errors, task accuracy, reported image
association, time and SUS with their separate eligibility rules. Prior studies
support the rationale; this project's participants must establish its outcomes.
Automated checks cannot demonstrate reduced workload, faster human completion,
better SUS, industrial fitness, physical-camera usability or a passing grade.

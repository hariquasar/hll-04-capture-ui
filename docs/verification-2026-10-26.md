# Remote v3 verification on 26 October 2026

This dated supplement distinguishes synthetic engineering evidence from human evaluation. It accompanies the working report and preserves the original 21 October desktop v2 results. The public repository baseline `07fb045` was recorded before the 26 October updates.

## Supplied walkthrough

The [original agent-run test report](aws-agent-test-2026-10-26/FYP-AWS-test-report-2026-10-26.md) records desktop Google Chrome on macOS. It is not a participant study. S005 completed Table then Guided, with six assigned records per condition. Both actual downloads were independently opened and checked. Both questionnaires were skipped with labelled agent-test comments; there is no human SUS score or interface-speed comparison.

- [Sanitized AWS submission readback](aws-agent-test-2026-10-26/fyp-aws-submission-verification.json): S005, accepted sequence 43, complete submission, both completed six-task conditions, no image bytes or credentials in the payload, skipped questionnaires with no scores. The source report records the displayed receipt as 15:35:13 HKT.
- [Independent ZIP verification](aws-agent-test-2026-10-26/independent-zip-verification.json): both measured downloads, safe unique members, CRC, six image bytes/hashes and six task metadata sets per archive, and CSV/manifest agreement.

S004 was also synthetic. It retained six guided records and an incomplete-finish checkpoint; it was not submitted and its table condition was not started. It was not deleted by the supplied test. Retention/withdrawal rules continue to apply.

## Findings at the observed build

The supplied report observed successful validation, save, refresh recovery, export invalidation after editing, normal completion gates, submission acknowledgement and duplicate-tab restrictions. It also confirmed that refresh restored work while resetting the surrounding reference to task 1. The surrounding task context could therefore disagree with restored work. Separate guided scrolling areas were a walkthrough observation; their human cost was not measured.

The served module at Amplify job 4 lacked a local checkpoint coalescing safeguard. Existing requests were serialized; this observation did not prove concurrent writes or lost data. Slow-network submission and withdrawal were outside that test. The in-app browser did not expose one download and its controls later timed out; normal desktop Chrome completed both downloads and final submission. The timeout cause remains unestablished.

## Instrument and evidence boundaries

HLL04-remote-table-v3 is a distinct instrument. Its baseline is a browser table, not the external folder-and-spreadsheet v2 condition. It collects task metadata and client-reported image hashes through Lambda, private S3 and DynamoDB, while prepared image bytes remain local. A generated ZIP, requested download, self-reported file opening and server receipt are different events. AWS readback does not independently prove that someone opened a file; the external archive audit supplies that engineering check for this run.

No synthetic S-code enters human analysis. All six tasks and 24 required metadata cells remain in each condition's denominator. Quality, completed timing and valid SUS are separate outcomes. No human observations are supplied as results for this report. Identity validation, ethics approval, physical-camera performance, accessibility conformance and hostile-input security are not established by this evidence.

## Report build reproducibility

`build_report.py` now uses `report-support/citation-ledger.json` and the two synthetic repair screenshots in `report-support/`. It no longer depends on an absolute private Hermes helper or ignored full-text evidence to produce the Word report. The citation gate checks declared numbers and URLs against the ledger; it does not claim fresh full-text verification. Historical detailed engineering archives remain separate.

## Follow-up implementation verification

The remote frontend was revised after the supplied walkthrough. It retains task-reference/row/image context through refresh, preserves active timing and drafts, coalesces redundant checkpoints without changing exact idempotent retries, and handles local edits or newer accepted remote state after a lost acknowledgement. Failed receipt restoration cannot silently start an empty attempt. Withdrawal acknowledgement follows one local cleanup path for direct, retry and reload routes; expired collection access retains the available withdrawal route and blocked browser-database cleanup is surfaced.

The separate guided scrolling areas are intentionally deferred for protocol and fidelity review. No dynamic iframe sizing or style, frozen desktop app, backend or protocol change is included in this repair. The in-app browser timeout cause remains unestablished.

The local checks completed on 26 October are recorded separately below. They are engineering checks with overlapping scenarios, not participant counts or a combined experimental sample.

| Verification | Passed | Boundary |
|---|---:|---|
| Frozen desktop logic and instruments | 47/47 | Parent rerun; distinct from historical 21 October counts |
| Backend handler and export | 35/35 | Local storage adapters; not a fresh AWS integration test |
| Remote analysis | 21/21 | Synthetic instrument fixtures |
| Frontend core | 10/10 | Independently rechecked by verifier |
| Focused recovery | 10/10 | Independently rechecked by verifier |
| Existing remote browser suite | 45/45 | Execution evidence reviewed by verifier |
| Slow-network suite | 2/2 | Independently rechecked by verifier |
| Full six-record paired browser flow | 18/18 | Execution evidence reviewed by verifier |

The focused recovery cases cover guided/table context and timer/image/draft restoration, immutable lost-ACK retries with newer edits, adoption of newer accepted remote data, failed receipt gating, and withdrawal direct/retry/reload with expiry and blocked-database handling. A deliberate selection-restoration mutation was rejected by the regression. This supports the tested predicates; it does not prove every failure or browser condition.

The [independent code-review summary](maintenance-2026-10-26/code-review-verification.json) records a PASS for source commit `7eb8312a76e574b982abb91afa496909584f3c34`. Its `study.mjs` SHA-256 is `e2b590f6d971e4f18d05c79bafd012cce71c1797be33ad925ef6b77f86e24f9e`.

## AWS deployment follow-up

[Amplify job 5 and configuration verification](maintenance-2026-10-26/aws-deployment-verification.json) records SUCCEED at 16:05:05 HKT on 26 October. All 21 served files independently matched the release manifest; [served-file hashes](maintenance-2026-10-26/deployed-files.json) preserve their identities. The existing backend template matched the generated plan and its stack remained UPDATE_COMPLETE; no backend or frozen desktop v2 mutation was required.

The real hosted full-flow run passed 18/18 checks in synthetic S006. Its two actual downloaded ZIPs each contained six correct task metadata sets and six matching prepared images; independent path/uniqueness, CRC, image-byte/hash and CSV/manifest checks passed. Direct DynamoDB and S3 readback confirmed submitted metadata at accepted sequence 5, both six-task conditions, no image bytes and no credential payload. S006 used ten numeric questionnaire fixtures per condition solely to exercise the instrument. They are not human ratings or a reported SUS result and cannot enter participant analysis. S005's original skipped questionnaires remain a distinct historical observation.

Hosted fault-path scope is explicit. Create, normal checkpoint, submit and withdrawal requests use the actual Lambda. Slow-network tests fetch a real checkpoint acknowledgement and hold delivery before the real submit/withdraw request. Recovery tests combine real Lambda operations with controlled response faults: lost checkpoint acknowledgement delivery; injected connection failure or `401 session_expired`; and injected `cleanup_pending:true` after a real withdrawal response, followed by retry to Lambda. Browser IndexedDB blocking and unrelated-database checks are real storage operations. These tests do not demonstrate an actual four-hour collection expiry, ninety-day retention expiry, or AWS lease-delayed HTTP 202 deletion.

## Final hosted results and retained test failure

- [Full six-record hosted flow](maintenance-2026-10-26/hosted-six-record-results.json): 18/18 passed.
- [Independent current ZIP audit](maintenance-2026-10-26/hosted-zip-verification.json): both six-record archives passed.
- [Direct DynamoDB and S3 submission readback](maintenance-2026-10-26/hosted-aws-submission-verification.json): S006, accepted sequence 5, two completed six-record conditions, synthetic numeric questionnaire fixtures, no image bytes or credentials.
- [Hosted slow-network cases](maintenance-2026-10-26/hosted-slow-network-results.json): 2/2 passed.
- [Hosted recovery summary](maintenance-2026-10-26/hosted-recovery-verification.json): all ten targeted behaviours verified across the retained initial run and separate focused rerun; no full ten-scenario rerun after the harness correction.

The [initial recovery suite](maintenance-2026-10-26/hosted-recovery-initial-results.json) passed 9/10 and timed out waiting for a cross-browser restored table row. The [diagnostic](maintenance-2026-10-26/hosted-receipt-diagnostic.json) established that the original no-pending predicate could accept the earlier sequence 2 instructions checkpoint, which contained no row. Fresh receipt restore correctly returned those acknowledged instructions. Once sequence 3 explicitly acknowledged the task phase and edited row, direct resume and a fresh browser restored that exact state. The diagnostic session was withdrawn with `cleanup_pending:false`.

The [corrected focused rerun](maintenance-2026-10-26/hosted-receipt-corrected-results.json) passed 1/1 with one session create, an explicit row-aware acknowledgement predicate, matching direct resume and matching fresh-browser restore. Production code was unchanged after job 5; the correction affected the test readiness predicate. The initial failure is retained rather than silently replaced or labelled a full 10/10 rerun. This evidence supports receipt restoration of acknowledged metadata, not a backup of unsent work or cross-browser recovery of the original guided image database.

The supplied job 4 walkthrough remains a dated observation of its original build.

## Earlier report export verification (before the literature revision)

The earlier working report contained 46 pages, six native tables, two figures and seven retained references. Its 11,742-word body count covers Chapters 1–6 prose only, excluding headings, tables, front/end matter and captions. All 46 rendered pages were visually inspected. Word package CRC/XML, PDF page bounds, local resource links and byte-identical output copies passed. Historical Sections 4.1–4.14 are preserved except for the two figure-resource paths; every original table and bibliography entry is unchanged. A standalone build using only the report source, builder and public support assets also passed. [Export identities and QA record](report-support/report-build-verification.json) records the final hashes and checks. These are document-quality checks, not confirmation of academic submission readiness.

## Literature-informed revision and current document exports

The later research update makes remote v3 Guided versus browser table the primary planned comparison and retains desktop v2 as history/alternative demonstration. Six empirical studies were added with their access limits and task-specific caveats. Required-field and format-error predictions are distinguished from exploratory accuracy, image association, time and SUS outcomes. No project-specific human result was added.

The current report has **53 pages, seven native tables, two figures and 13 references**. Its **13,547-word** count covers Chapters 1–6 prose only, excluding headings, tables/captions and front/end matter. Every page was visually reviewed; a final render corrected the abstract page break and added the verified release record. The five changed pages were re-inspected, and the other 48 page images were identical to the reviewed render. The existing formal style is retained; submission-template administration remains separate.

The current presentation has **19 slides (14 main and five backup)**, with a **12m50s** main-talk allocation. It adds human-study evidence and validation-revision/hypothesis slides, aligns citation numbers with the report, and preserves the original visuals and native tables. All slides and PDF pages passed visual review; package, geometry, font and re-import checks passed. Native desktop PowerPoint execution was not tested.

The report and slides describe revision `research-20261026-r1`. Its backend and Amplify job 6 deployment, scoped local checks, 24-assertion hosted synthetic flow and two independent ZIP audits are documented in [the revision notes](research-ui-change-notes.md). [Current verification and artifact identities](report-support/research-update-verification.json) record the final document hashes and release summary. These results are engineering and document-quality evidence; the human comparison remains pending.

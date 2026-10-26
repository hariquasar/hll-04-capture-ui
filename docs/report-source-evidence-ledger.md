# Draft source and evidence ledger

Historical record of the 21 October drafting pass. Its artifact counts, paths and completion statements describe that revision and are not the current report status. See [26 October verification](verification-2026-10-26.md) for the later remote v3 evidence and report build checks.

Updated 21 October 2026 after implementation repair, evidence synchronization and delivery render QA. This is a working report, not a final submission.

## Current artifact verification

- The delivered DOCX reopens successfully. Its ZIP CRC check and XML/rels parse checks pass. It contains 169 paragraphs, five native Word tables, two embedded figures and four external source hyperlinks.
- Body prose: **8,364 words**. Whitespace-token count of chapters 1-6 prose only; excludes the abstract, headings, tables, figure captions, identity/status text, AI disclosure, references and headers/footers. The builder's reproducible count is retained in `report-evidence/document-statistics.json`.
- Latest bundled-LibreOffice PDF: **35 pages**. The abstract starts on page 1, the conclusion on page 34, and sources on page 35. The abstract shares the opening working-draft page; the conclusion shares page 34 with the draft AI disclosure. These are content locations, not a claim of 34 fully compliant report-body pages.
- Delivery render: `/Users/hoyinshum/Documents/Codex/2026-10-21/fk-ok/work/implementation-20261021/report-render-delivery/`. Every page of the preceding 35-page render was assigned to full-size visual QA. The four changed delivery pages (1, 5, 22 and 25) were individually reopened and checked: no clipping, overlap, broken table rows or stray Markdown. The other 31 page images are pixel-identical to that preceding render. The changed Figure 1 and caption now fit together on page 25 without an added sparse page.
- Structural checks, page comparison and exact output hashes are retained in `work/implementation-20261021/report-delivery-qa.json` and `report-render-comparison.json` under the current Codex workspace.
- Page setup is A4 with 1.5-inch top/bottom and 1-inch side margins; body text is 12 pt at 1.5 spacing, tables 10 pt, references single-spaced. The current Word heading/title theme and draft assembly are not certified against the official template. Formal front matter, final typography, contents/lists, signed declarations and submission assembly remain outstanding.
- Strict citation/evidence verification passed after the edits: four cited IDs with retained supporting quotations. The four sources below and historical evidence are preserved. No additional external literature or participant results were invented.

## Verified external sources


| ID | Retrieved text | Supported use | Boundary |
|---|---|---|---|
| 1 | Hartung et al., ICTD 2010 PDF: `report-evidence/odk-paper.pdf` and `.txt` | Collect/Aggregate/Voice/Build, modular collection architecture, supported data types | Does not demonstrate this prototype's benefit or establish a missing validation invention |
| 2 | Official ODK Form Logic page: `report-evidence/odk-logic.txt` | Required questions and response constraints | Current documentation, not necessarily every feature in the 2010 release |
| 3 | Bargas-Avila et al., 2010 full chapter: `report-evidence/guidelines-full.pdf` and `.txt`; DOI landing metadata in `guidelines.txt` | Guidelines 3, 8, 10, 13–17; differentiated empirical support; save-time rather than blur-time feedback recommendation | Report explicitly identifies deviations: four-choice dropdown, example in format hint, blur validation. It does not claim the timing literature proves blur is optimal |
| 4 | Brooke chapter reproduction on AHRQ: `report-evidence/sus.pdf` and `.txt` | Questionnaire administration and ten-item scoring, 0–100 composite | Reproduction identifies Brooke; no unverified publication pagination or adjective thresholds added. The reference deliberately avoids inventing complete book metadata |

The exact URLs and attached quotations are in `report-evidence/citation-ledger.json`. Source text was opened and inspected, not cited from search snippets. Initial web_extract failed because the configured backend was search-only; urllib/PyMuPDF retrieval succeeded. The ODK page required gzip decompression. The DOI and publisher routes for the 2007 timing article returned HTTP 403; that article is **not directly cited**. Its findings are discussed only through the retrieved 2010 chapter, explicitly attributed to that chapter. Bangor and later SUS benchmark sources were not verified or used.

## Current local evidence

The current evidence directory is `/Users/hoyinshum/Documents/Codex/2026-10-21/fk-ok/work/implementation-20261021/`. Paths in this section are relative to that directory unless they begin with `docs/` or `eval/`, which are repository-relative.

- Original baseline commit: `9b58d081b8cfda492442a392fd4f9c0b407aa753`. The repaired source is the local working tree, not that commit. Exact source hashes are retained in `browser/source-sha256.json` and `eval/study-freeze.json`. Final application hash starts `09c45572368c`; final core hash starts `41c0254f4f16`.
- Latest Node run: **47/47 tests** (24 core and 23 evaluation tests). Evidence: `node-tests.txt`, `core-tests.txt` and `evaluation-tests.tap`. Assertions exercise logic and instrument bookkeeping; they are not independent human observations.
- Latest actual browser regression: **82/82 assertions across 10 scenarios** in desktop Chrome 155.0.8059.40. Six records with about 6.49 MB of image bytes were committed and restored. Evidence: `browser/browser-results.json`; controlled discard race RED/GREEN evidence: `browser/discard-race-red-green.json`.
- Independent downloaded archive audit: **6/6 ZIP archives** passed CRC, unique-path, actual image-byte/hash and CSV/manifest consistency checks. These archives contain 17 saved-image occurrences and one draft image across repeated checkpoints, not 17 different tasks or people. The six-task checkpoints have 24/24 filled cells, initially 23/24 correct after a deliberate allowed error and then 24/24 correct after direct editing. Each six-record CSV has 84 checked cells across its fourteen columns. Evidence: `browser/independent-export-verification.json` and the actual ZIPs retained beside it.
- Storage recovery used a real IndexedDB transaction abort: one durable record versus two working records and one draft, followed by an actual recovery export and successful retry/reload. A separate quota override did **not** produce quota exhaustion; natural disk exhaustion, eviction and power-loss behavior remain unverified.
- The clean Figure 1 is an actual synthetic **demonstration**, not another regression assertion or a participant observation. Its original is `browser/review.png`; provenance and source hash are in `browser/presentation-screenshot-provenance.json`. It shows the first prepared illustration with all review metadata expanded, natural toast expiry and no DOM/CSS concealment. The report copy is `docs/repair-20261021/review-details.png`.
- Prepared-study smoke: **11/11 checks**, six real UI imports of the frozen illustrations and an actual guided ZIP download. A constructed P99 baseline CSV and image folder exercised the matching analysis path. Both mock conditions had 24/24 correct cells and all six task-image hashes; withholding one baseline image produced five present and one missing despite six filename references. These are synthetic instrument checks, outside the participant-result folder. Evidence: `study-smoke/smoke-report.json`, `complete-roundtrip.json` and `missing-baseline-image.json`. No mock timing or SUS rows were entered into the blank collection templates.
- The six-task study kit uses the same prepared files on the same laptop in both conditions, whole-block timing, counterbalanced order and participant-level paired analysis. Frozen protocol, labels, baseline/guided instructions, file hashes and blank templates are under `eval/`; verify with `node eval/verify-study.mjs`. This controls the transcription/association task, not field representativeness or camera acquisition.
- Opus 5.5 supplied design/static-source review through the requested gateway. Its completed review and the truncated intermediate response are retained in the `opus-*` evidence files. Static review is not a panel grade or an independent execution of the tests.

## Preserved historical evidence

- The 16 October repair history remains in `docs/repair-verification.md` and `docs/repair-evidence/`. Its 24/24 Node and 30/30 Chrome counts refer to that historical version, not the current 47/82 verification.
- The historical three-card synthetic run remains in `docs/evaluation-engineering/REPORT.md` and `actual-results.json`: 22/22 assertions, three tasks and twelve required metadata cells; initial 11/12 accuracy and corrected 12/12 accuracy, with 12/12 completeness at both checkpoints. Its two actual archives and Python verification of three image hashes are preserved.
- The earlier agent-led walkthrough is not human feedback: it identified persistence-language ambiguity, adjacent hint/error text, absence of direct editing and hidden task identity. Later repairs address those weaknesses. No ratings, SUS values or participant quotations were generated.
- `audit-probes.mjs` and `report-evidence/audit-probes.txt` are historical diagnostics. The old hard-coded median probe is not a measurement of the repaired scorer. Older claims that reports were untouched apply to their earlier pass only.

## Completion limits

The current submitted abstract is described as a **generic industrial data-collection interface**; the student reports submitting the prepared version. Historical mobility-labelled fixtures do not define that abstract or establish partner requirements. The official project title and student identity remain unchanged.

There are **zero human observations**. A prepared protocol and passing synthetic instrument checks do not establish human time savings, accuracy benefits, SUS, representative industrial performance or approval. Partner requirements, applicable consent/ethics arrangements, a real pilot and paired observations, physical cameras, target-device/browser coverage and natural storage limits remain unresolved.

The 35-page working PDF remains below the guideline's 40-page report requirement and has not been assembled into the official final template. Cover and required front matter, declarations, contents and lists, final typography, substantive completion and student verification of the AI disclosure remain pending. Adding blank pages or treating sources/disclosure as completed research would not resolve those gaps. No submission is made or claimed by this report revision.

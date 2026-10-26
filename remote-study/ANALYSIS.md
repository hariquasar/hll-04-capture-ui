# Offline analysis of remote v3

This analyzer makes no AWS calls and changes no raw export. It does not establish participant identity, consent approval, independent timing or real image-byte integrity. The comparison is guided entry versus the remote browser table, not the original external-spreadsheet v2 protocol.

From the project directory:

```sh
python3 remote-study/analyze.py /absolute/private/export-directory --out /absolute/private/new-analysis-directory
python3 -m unittest discover -s remote-study/tests -p 'test_analysis.py' -v
```

The export directory must contain the backend export CLI's `sessions.json` **array**. The analyzer uses each session's `latest.payload.conditions`. Historical checkpoint files remain preserved but are not extra observations. The output directory must be outside the raw export; existing analysis files are never overwritten. The CLI prints counts and paths, not raw answers. JSON and CSV output files are mode `0600`; a newly created output directory is mode `0700`. Keep both directories private.

The default truth is `eval/truth.json`: the six fixed v2 label/image references reused by remote v3. Its SHA256 must equal `c15a0c6493b7e9eda805cbc309e625ce802706a37277bb2759be42de07c3500a`. An optional `--truth` path may locate an identical copy. A changed task set needs a documented new scoring/version decision, not a silent remapping.

## UI revision selection

The default is `--ui-revision research-20261026-r1`. The original feedback instrument
can be analyzed separately with `--ui-revision legacy-v3`. A missing revision in
old exports means `legacy-v3`. Each run excludes the other revision with
`study_ui_revision_mismatch`, and also excludes disagreement between a session
and its latest checkpoint. JSON audit entries and observation CSV rows retain
revision; analysis format is `hll04.remote.analysis.v2`. Raw exports are unchanged.
Never pool these revisions or call either revision's automated fixtures human
results. The six-task truth and all outcome definitions remain the same.

## Outputs

- `analysis.json`: raw entered records, drafts, SUS and comments for included sessions; session exclusion reasons; cell and image diagnostics; order and interruption context; independent outcome eligibility; condition descriptives and paired summaries; source file hashes.
- `observations.csv`: one row per included participant and condition, including conditions not yet started. Nested details remain JSON strings. Potential spreadsheet formulas in text receive a leading apostrophe; actual numeric measurements remain numeric. The JSON and raw inputs retain original strings, including leading spaces/apostrophes and wrong answers.
- `paired-outcomes.csv`: only eligible complete pairs for each outcome, with guided-minus-baseline differences. Quality percentages use **percentage points**.

## Inclusion and measurement rules

Synthetic sessions/S-codes and withdrawn tombstones never enter participant results. Missing consent confirmation, version mismatch, inconsistent snapshot metadata and duplicate session/participant identities are explicitly excluded. Counts show exported, excluded, included, attempted and completed sessions/conditions. Enrolments with no checkpoint remain visible as not started. Assigned-order flow retains completed and incomplete counts; exported rows and usable participant counts are distinguished.

Quality uses saved records from any observed attempt, including capped/abandoned/partial attempts. A draft is retained separately and never silently promoted to a record. All six tasks remain in the denominator: four required metadata fields per task, 24 cells. Missing tasks/cells score zero; case and surrounding whitespace are ignored for accuracy. Nonempty format errors are separate. Unknown, blank, duplicate or non-string task IDs make quality unscorable rather than being inferred from row order. Non-string metadata is also flagged. Wrong values remain raw in the output.

Image results compare the **reported selected-image hash** with each frozen task hash. The remote export contains no original image bytes, so this is not an independent byte-integrity audit. Filename agreement is reported separately; neither a filename nor an export hash proves scene truth.

Time is eligible only for a `completed` block with valid client start/end timestamps, integer elapsed milliseconds from 0 through 900000 and a reported generated artifact (valid SHA256 plus positive byte count). A completed block without an artifact is flagged separately. Capped/abandoned elapsed times remain raw and are not treated as completion times. Network submission receipt time is separate. Start/end and elapsed disagreement is flagged; client timing is not independently verified. No interruption duration is subtracted. Raw blur may be caused by legitimate iframe focus and is not an exclusion by itself. Hidden-tab, reload and offline counts remain visible, and session-level aggregates must not be misreported as condition-specific observations.

SUS is eligible independently of time/quality when a measured block was attempted, its questionnaire is marked completed, and all ten actual responses are integer 1-5. Incomplete/skipped responses are missing, never zero or imputed. A valid questionnaire after an unsuccessful block may be described and paired; that context remains in the row. The 0-100 composite is not percent correct.

Artifact generation, browser download request and participant-reported opening are distinct columns. None is relabelled independent verification. Actual condition order is based on client start timestamps; retained event order is additional context and may be incomplete because the event buffer is bounded.

Each outcome has its own descriptive mean/median/N, complete-pair N and missing-pair reasons. The participant is the unit; do not treat cells or conditions as independent participants. Descriptives can involve different people from the paired comparison. The script performs no imputation, significance test or grade prediction.

Tests create only explicitly documented synthetic fixtures in memory and temporary directories. Some fixtures set `synthetic=False` solely to exercise the eligible-analysis branch; they are never stored as live participant observations.

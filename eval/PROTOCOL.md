# Controlled desktop study: guided UI versus a basic workflow

Version: HLL04-desktop-transcription-v2, prepared 21 October 2026.

**Status: prepared instruments, not an executed human study. Participant observations: zero.** This kit uses six small, explicitly synthetic object illustrations and written labels. It tests desktop transcription, record/image association, correction and export. It does not test photography, interpretation of physical asset condition, industrial representativeness, field deployment or partner acceptance. Before collecting participant data, determine and satisfy the applicable institutional process and consent requirements; do not infer approval from this protocol. No official minimum sample or automatic approval exemption is asserted.

## Question and experimental unit

For these six prepared image-and-label tasks, what differences occur between the guided interface and a basic folder-plus-spreadsheet workflow in metadata completeness, accuracy, image association, whole-block completion time and perceived usability?

Each participant completes both conditions. The **participant**, not each cell or task, is the unit for paired comparison. Five to eight participants is a practical exploratory target, not a statistically justified minimum or a guarantee of findings. Report actual recruitment and missing observations. If no permitted human observations are collected, report that the comparative question remains unanswered.

## Frozen inputs and setup

- Use the **same laptop, screen, keyboard, mouse, browser version, room and six prepared PNG files** in both conditions. Use local import in the guided condition and local file copying in the baseline. No phone or camera acquisition is part of this comparison.
- `prepared-images/task-01.png` through `task-06.png` are synthetic illustrations. `TASK_CARDS.md` supplies the exact metadata labels. `truth.json` contains those labels and SHA256 hashes of the prepared images. `study-freeze.json` records the frozen instrument and image hashes. Run `node eval/verify-study.mjs` before collection and analysis.
- The task cards must be equally visible in both conditions. They deliberately give labels to copy: this is a transcription/association task, not a test of interpreting a scene. No condition gets hidden truth or extra training.
- Use `BASELINE_INSTRUCTIONS.md` and the guided instructions below. The baseline template contains six blank rows; task IDs must be entered in both conditions. Do not prefill either condition's IDs or metadata.
- Before the timed block, make the six source images and cards available, open the spreadsheet template and empty output image folder for baseline, and create an empty guided session for the assigned participant code. This administrative setup is excluded in both conditions. Enable the app's six-task study mode (IDs 1–6). It is separate from ordinary collection mode.
- Freeze the exact build, schema and instructions before the first real session. Do not change a rule between participants. If a defect requires a change, retain the previous observations, date/version the change, and do not pool versions silently.

## Order and practice

Odd-numbered participant codes (P01, P03, ...) do baseline then guided; even-numbered codes do guided then baseline. Assign codes consecutively before seeing outcomes. Record actual order and deviations in `collection-log.csv`. Present cards 1–6 in the same order in each condition. This counterbalances condition order; it does not eliminate learning or memory from repeating the same labels/images.

Give the same explanation of required/optional fields and allowed values. Provide equal familiarisation with a separate unscored practice image/card, using two minutes and the same assistance policy in both conditions. The practice item is described in `TASK_CARDS.md` and stored as `practice.png`; it is not one of the six scored tasks and has no row in truth. Finish/export the practice session before creating the empty measured session. Do not include practice in any score or timed block.

## Measurement boundaries

1. After the above setup, say: “Complete all six records using these cards and images, check the result, and save/export the completed dataset.” Start the stopwatch at the end of this sentence.
2. Baseline: copy the six files to the output image folder and enter the card IDs, filenames and fields in the provided CSV template, then save as CSV. Guided: import each corresponding prepared image, enter the task ID and metadata, save the record, review/correct as needed, and export the ZIP.
3. Stop when the participant declares finished **and the CSV/ZIP output exists locally and can be opened**. Include participant checking, correction, recovery and repeat exports. Do not include the researcher's later scoring or renaming/copying to the archive. Record whole-six-task-block seconds, never seconds per record.
4. Do not coach the correct answer. Explain a control only when requested under the same predeclared assistance rule; log the request and any intervention verbatim. A prompted correction is not spontaneous discovery.
5. Do not pause timing for software errors or participant recovery. For an external interruption, retain elapsed time and log its duration/reason separately. Predeclare an identical block cap (15 minutes) before the study. At the cap or withdrawal, preserve available output, record `capped`/`abandoned` and elapsed time in the collection log. A capped/abandoned time is not a completed-task time.
6. After each condition, administer the same ten SUS questions with integer responses 1–5. Collect retrospective comments (“What was hardest?” / “What would you change?”) after timing. No concurrent think-aloud is required during timing.

`timing-sus.csv` is the strict analysis input for **completed blocks with a complete questionnaire** only. Keep every attempted block in `collection-log.csv`, including failures, withdrawals, missing questionnaire items and exclusions. Do not delete or impute an incomplete observation. If time is available but SUS is incomplete, retain the time in the log and report that missingness separately; this combined utility does not perform outcome-specific missing-value analysis. An absent row is not proof that no attempt occurred.

## Exact field and scoring rules

Required scored metadata: `scenario`, `location`, `subject_id`, `condition`: six tasks × four fields = **24 cells per participant per condition**. `task_id`, `file` and optional `notes` are not metadata score cells; identity and image failures are reported separately.

- Task IDs are the exact strings `1` through `6`. No leading zero, whitespace or order-based inference. Both conditions enter them. Missing, unknown, duplicate or conflicting IDs are instrument/data errors and stop automated scoring. Preserve and report the source; never guess the intended ID. Any later documented adjudication creates a separate labelled copy and retains the original.
- The exact accepted labels appear on the cards and in truth. Scoring ignores surrounding whitespace and letter case for the four metadata values only; **there are no unstated synonyms**. For example, `outside the canteen` is not accepted for the declared `Canteen`. Do not change accepted labels after observing data. Identifier format validity is reported separately, so a lowercase ID can match text case-insensitively but still be a format error.
- Completeness = nonempty required cells / all 24 assigned cells. Accuracy = correct required cells / the same 24 cells. Missing tasks stay in the denominator. A complete, valid record can still be inaccurate. Save gates can make saved-record completeness high while omitted tasks and recovery burden remain.
- Image reference presence, actual file existence, internal byte integrity and task-image association are distinct. Guided ZIP checks unique members, CRC, actual image digests and CSV/manifest agreement. Baseline actual files are checked when supplied in the named image folder. Both conditions' task-image association is checked against the same frozen prepared-image hashes. This verifies selection/association of the prepared image, not real-world scene truth.
- The guided manifest holds raw metadata and is the authority for scoring. Spreadsheet-safe CSV cells are compared to the manifest's declared encoding policy; the scorer never blindly strips apostrophes. Historical CSVs without that policy are compared as raw strings only when their manifest schema exactly matches the frozen current schema. Missing or different schemas fail closed; do not silently remap older instruments. Guided session IDs are exposed and the same session ID in two participant archives is rejected. This catches accidental archive reuse; it does not authenticate participant identity. An included unfinished draft is flagged separately and never counted as a saved record. Missing or invalid required truth values stop scoring. Original exports are preserved.

## Retained files and analysis

Use participant codes (P01, P02, ...) without names or unnecessary identifying data. Keep consent/contact records separately under the applicable retention/access arrangement.

For each actual participant archive:

- `results/P01-baseline.csv`
- `results/P01-baseline-images/` with the actual copied image files
- `results/P01-guided.zip`
- one complete analysis row per eligible condition in `timing-sus.csv`
- one log row per attempted condition in `collection-log.csv`, plus original questionnaire/observer records

The researcher may rename output containers after timing; preserve image bytes and participant-entered CSV values. Keep immutable originals. Store corrected/adjudicated copies separately with date, reason and author. Use a dedicated results folder: participant-like filenames that do not match the contract and orphan image folders are errors, not silently ignored participants. Other ignored filenames are explicitly listed by the scorer.

Run:

```text
node eval/verify-study.mjs
node eval/score.mjs eval/truth.json eval/results --json
node eval/sus.mjs eval/timing-sus.csv --json
```

The scripts show every available observation, complete pairs, participants missing a condition, and paired **guided-minus-baseline** differences only for complete pairs. Report numbers attempted, completed, scored and paired separately from the collection log. Descriptive condition means include all available rows and must not be presented as a paired treatment effect when participant sets differ. No zero/mean imputation and no silent averaging of duplicate participant-condition rows. Participants missing both files are discoverable from the log, not the export directory alone. Give individual paired outcomes before mean/median summaries; no automatic significance claim. Negative paired time means guided was shorter; positive SUS means its reported score was higher. SUS is a 0–100 composite, not percent correct.

## Interpretation and limitations

This is a small controlled, synthetic desktop study. Exact labels, repeated images, convenience recruitment, condition-order/learning effects, assistance, missing outcomes and the custom baseline limit generalisation. It can inform this workflow's transcription and association trade-offs; it cannot establish industrial suitability, camera usability or superiority to ODK. Six short tasks with exact copying labels may produce ceiling effects (few or no errors in either condition); this is a limitation, not proof that the interfaces are equivalent. A null or adverse result is still a result. Functional tests and simulated fixtures remain engineering evidence, never participant observations.

## SUS questionnaire

Use Brooke's ten-item scale after each condition; 1 = strongly disagree, 5 = strongly agree. Keep the original wording and response directions. Source reproduction: https://digital.ahrq.gov/sites/default/files/docs/survey/systemusabilityscale%2528sus%2529_comp%255B1%255D.pdf

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

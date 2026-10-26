# HLL-04 — Guided Data Collection UI

EE4080 FYP, SHUM Ho Yin, CityU. Official title: **UI design for data collection**.

A local browser prototype: session → import → metadata → inspect/edit → export. The implementation scope is a proposed industrial image-and-metadata workflow. Partner requirements and human evaluation remain unconfirmed. Synthetic fixtures and automated tests are labelled separately from participant observations.

## Hosted prototype

Open [the AWS Amplify HTTPS prototype](https://main.d2wgs3nlrx1uri.amplifyapp.com) in desktop Chrome. It serves the five unchanged source files from study version `HLL04-desktop-transcription-v2`, freeze revision 2. Hosting does not add a collection backend: images and metadata remain in browser-local IndexedDB, and exports download to your computer. This hostname has separate storage from localhost; opening it does not migrate old sessions.

The separate EC2 instance is an isolated automated test runner. The Amplify website does not depend on that instance being running. Keep the local command below as the presentation fallback; an uncached hosted page cannot start reliably without internet.

## Run locally

From this repository:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory src
```

Open `http://127.0.0.1:8765/index.html` in desktop Chrome. Keep using the same hostname and port to access the same browser store. Do not open the HTML as `file://`. No build step or collection backend is required. The page does not upload images.

Close or reload all older prototype tabs before upgrading; a legacy tab does not participate in the new writer lock.

Use **Study mode** only for the frozen six-task evaluation. Ordinary collection permits an omitted task ID; any supplied ID must be unique. Study mode requires exact IDs 1–6. The prototype caps a session at six saved records; PNG, JPEG and WebP imports must decode and are individually limited to 10 MiB. The verified workload uses six images of about 1.08 MB each; accepting a file does not guarantee every device has enough capacity for the maximum allowed workload.

## Save and recover

- Session state, images and the current draft use IndexedDB. Status changes to saved only after the write transaction completes. Pending and failed writes remain visible.
- Resume cancellation keeps the existing session. Discard session is a separate confirmation. Export first if you need that work.
- Draft image and metadata changes autosave. **Review** keeps an unfinished draft; **Continue unfinished draft** returns to it. Explicit draft discard does not delete saved records.
- **Inspect all fields** reveals every metadata field. **Edit metadata** changes a saved record without changing its record ID or image. Edit validation and before/after metadata are retained in the event history.
- Only one tab can write a session. Other tabs are read-only snapshots and may lag the editing tab. Close the editing tab and reload the other tab to take over.
- Legacy localStorage work is migrated and read back before the legacy key is removed. Failed migration keeps the original. Unreadable stored state blocks editing rather than replacing it.
- A storage warning means work may exist only in memory. Keep the tab open, export, and retry. An export does not clear a persistence failure. Browser site-data clearing, device loss and origin changes are not solved by local persistence.

## Export

The ZIP contains `images/`, `records.csv` and `manifest.json`. An unfinished draft is separately represented by `draft.json` and `draft-images/`; it is excluded from completed-record scoring. The recovery draft is readable as JSON plus its image; there is no one-click archive reimport feature.

The manifest preserves raw metadata. The CSV declares `prefix-apostrophe-v1` in the manifest and prefixes formula-like text, leading control characters and original apostrophes for reversible spreadsheet-oriented text protection. Standard CSV quoting handles commas, quotes and line breaks. This is not a certification of every spreadsheet application's import settings. Guided scoring uses raw manifest records and verifies the CSV against the declared policy; arbitrary baseline text is not silently unescaped.

Hashes and CRC checks establish byte consistency, not factual scene truth, consent or authentication. The download notification means a download was requested; inspect the resulting ZIP.

## Verify

`playwright-core`, an installed Chrome and local `unzip` are required for browser/evaluation checks. From the repository root:

```sh
npm test
HLL04_BASE_URL=http://127.0.0.1:8765 HLL04_TEST_DIR=./work/browser-check node tests/e2e.mjs
```

Browser checks use fresh automation contexts and real controls. They cover record validation, consecutive pointer saves at a narrow viewport, draft recovery, non-destructive resume, edits, unique task identity, six-image persistence, aborted transactions, migration and single-writer behavior. They are not a physical-phone or camera test. See `docs/repair-20261021/` for the completed repair evidence and source hashes. The old `docs/evaluation-engineering/` and `docs/repair-evidence/` remain historical evidence, not current test counts.

## Evaluation

Read `eval/PROTOCOL.md` before any pilot. The controlled comparison uses the same laptop, prepared synthetic images and exact task labels in both conditions. Time covers the entire six-task block, including review, corrections and export. Participants are the units of paired comparison; metadata cells are not independent participants.

```sh
node eval/score.mjs eval/truth.json eval/results --json
node eval/sus.mjs eval/timing-sus.csv --json
```

Use the provided naming and image-folder conventions. The scorer counts all assigned tasks in the denominator, rejects ambiguous task identity and distinguishes supplied-file/hash verification from unverified image claims. The timing/SUS utility rejects duplicate participant+condition rows, lists incomplete pairs and computes paired differences only for complete pairs. Blank templates contain no observations. Check the applicable consent/ethics process before recruiting; this repository does not establish approval.

## Structure and limits

- `src/core.mjs`: schema, validation, record identity and edits, CSV/manifest, ZIP writer and task scoring.
- `src/storage.mjs`: IndexedDB transactions and commit acknowledgement.
- `src/app.js`, `src/index.html`, `src/style.css`: draft lifecycle, browser interaction and recovery feedback.
- `tests/`: logic, instrument and Chrome regressions.
- `eval/`: controlled study materials and scoring; no human results.
- `docs/report-chapters-draft.md` and generated Word/PDF: working report with dated evidence and limitations.

The repaired design targets desktop Chrome and a six-record session. Whole-envelope snapshots with data URLs trade simplicity for extra memory and write volume. Larger sessions, physical cameras, phones, other browsers, screen-reader behavior, power-loss guarantees, encryption and industrial deployment have not been validated. Camera capture re-encodes pixels; file imports retain original bytes. Schema changes also require coordinated changes to task truth, the baseline, review and scoring. Do not claim improved human usability from automated checks.

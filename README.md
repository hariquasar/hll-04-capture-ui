# HLL-04 — Guided Data Collection UI

EE4080 FYP, SHUM Ho Yin, CityU. Official title: *UI design for data collection*.

A browser app that walks an operator through **session → capture/import → metadata → review → export**. It refuses to save a record that has missing or invalid required fields. It exports a ZIP containing the images, `records.csv`, and `manifest.json` (schema, records, SHA-256 hashes, and an event log of blocked and successful saves).

No build step and no backend. The only dependency is `playwright-core`, and only for the browser tests.

## Run
```
cd src && python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/index.html
```
The camera needs `localhost` or HTTPS. To test on a phone, serve over HTTPS or use Import file.

## Test
```
npm test                       # 12 unit tests (validation gate, ids, CSV, zip, scoring)
node tests/e2e.mjs /tmp/out    # 13 browser checks in headless Chrome (needs server running)
```

## Evaluate
See `eval/PROTOCOL.md`: the 6 ground-truth tasks, the counterbalanced guided-vs-baseline design, and SUS.
`node eval/score.mjs eval/truth.json eval/results`, then `node eval/sus.mjs eval/timing-sus.csv`.

## Change the fields
Edit `SCHEMA` in `src/core.mjs`. The form, validation, CSV, and scoring all read from it. If Locolla specifies the data, only this needs to change.

## Layout
- `src/core.mjs`: pure logic (schema, gate, export, zip, scoring)
- `src/app.js`: UI, camera, and localStorage resume
- `tests/`: unit and e2e tests
- `eval/`: study kit

## Known limits
- Validation checks format and presence, not truth (it cannot know if a location is wrong).
- localStorage holds roughly 5 MB of images, so export often.
- Browser capture strips camera EXIF. The sidecar manifest is the record of truth.

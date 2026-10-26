# Remote study frontend — v3

This is a separate, unmoderated browser-table comparison, not the earlier local spreadsheet protocol. It contains no human results or assertion of institutional approval. `web/` is the static deployment root; all paths are relative. Do not deploy `frontend/` test material, the backend, evidence or private invitation/receipt files as static assets.

## Configuration and launch

`web/config.json` contains only `apiBase` and `protocolVersion` (`HLL04-remote-table-v3`). Invitation arrives in `#invite=...` and is removed from the visible address before network calls. Synthetic sessions additionally use `&synthetic=1`, and require a server-recognized synthetic invitation. This client flag never reduces either timer. Do not distribute synthetic invitations to participants.

The study requires desktop Chrome, a non-mobile user agent and a window at least 1000 px wide. Narrowing an active window blocks interaction but does not pause elapsed time. A Web Lock prevents a second tab writing or submitting. The existing main prototype lives on a separate origin and is not accessed or cleared.

## Instrument adaptation and fidelity

Five frozen `src/` files were copied under `web/app/`. `prototype-provenance.json` records source and instrumented hashes. `index.html`, `style.css` and `core.mjs` are byte-identical. `app.js` imports a scope value and changes only the legacy-storage and writer-lock identifiers; `storage.mjs` derives its database name from a bounded scope. Scope is stable for the server session and separately names `practice-guided` and `measured-guided`. The original source was not modified.

The parent supplies the server-assigned participant code, sets study mode and device, disables editing those controls, hides camera and arbitrary file import, and adds a privacy banner through a separate stylesheet. Prepared image buttons require actual participant selection; they do not attach the currently visible task's image automatically or fill metadata. Selecting an image invokes the original `FileList` input handler. All metadata validation, Save, edit, draft, persistence and ZIP generation remain original behavior. The wrapper captures the original generated ZIP Blob and parses its actual manifest; it never assumes IndexedDB is the latest state. Image content is not submitted.

The baseline is a plain browser table with six blank rows and raw text cells, including task ID. Wrong, blank or duplicate values are not corrected or blocked for accuracy. Its ZIP includes a CSV, raw-value manifest and explicitly selected prepared images. CSV formula-like text is escaped in the file while raw text remains in the manifest and uploaded metadata. Both interfaces use the same six visible cards and prepared image choices. Practice uses a separate image/card.

## Timing and outcomes

Each interface gets a fixed two-minute practice before a fresh measured block. Measured timing starts after prepared assets and the interface are ready. A block lasts at most 15 minutes and includes data entry, review, export and participant file checks. `performance.now()` tracks within-page passage; persisted wall timestamps bridge reload. The longer duration is retained when wall and monotonic clocks diverge, with a `clock_gap` event. Focus, hidden document, reload, offline and resize events are observations; timers do not pause. Focusing the guided iframe is separately logged and does not increment interruption counts. Opening a local export is an instructed activity, so focus flags alone must not automatically exclude a participant.

An export event means a Blob was generated and a browser download was requested. It does not prove a download completed or a file opened. The two checkboxes are explicit participant self-reports. Editing after export resets their confirmations and marks the artifact stale. A normal completed finish requires a current export and file checks, but never requires all six correct or filled tasks. Participants can finish incomplete, hit the cap, skip a condition, or retain partial SUS responses. Missing tasks remain missing for later analysis. Timing stops at block finish/cap, before final network upload.

SUS uses the original ten statements, with whole-interface framing after each condition. Comments are optional and ask “What was hardest? What would you change?” No automatic score or completion claim is shown to participants.

## Recovery and privacy

Local state stores a private bearer credential plus pending idempotent request. Uploads contain only the agreed payload, never credential, invitation, image bytes or original operator identity. Exact pending request UUID/body/sequence is retried serially. Lost acknowledgements cannot allocate a replacement session or duplicate a checkpoint. Checkpoint count is throttled, with room left for final submission. A completion receipt appears only after server acknowledgement.

The selected reference card and table image-target row are retained separately for each condition's practice and measured workspace. They stay local and do not fill or correct metadata. Image status is read from the restored row or actual guided draft, including its entered task ID. The guided layout retains its existing scrolling areas; changing their structure needs an instrument-fidelity review.

“Save response backup” exports response metadata and participant code without credential or invitation. “Save private receipt” exports the credential needed for anonymous resume/withdrawal; it must be kept private. The receipt is not a backup of unsent responses. Restoring a receipt can restore acknowledged metadata; guided images and original instrument state still require the original browser's namespaced IndexedDB. If guided state is absent, the client refuses to silently create a new timed attempt and offers incomplete finish/withdrawal.

A successful receipt lookup restores the acknowledged session. A connection, credential or protocol error keeps the restore screen available instead of exposing an empty timed attempt. When the service confirms that collection access has expired, the receipt opens the expired-access screen with withdrawal still available during retention; it cannot start a fresh block. Normal reload retries the exact pending request before checking the remote sequence: newer local edits survive an older acknowledged snapshot, and a newer server checkpoint replaces stale cached table rows.

Collection access expires after four hours. Withdrawal uses the same credential during the longer retention period. HTTP 202 withdrawal immediately marks the session excluded locally, blocks further task interaction, retains the exact withdrawal request and says deletion is pending. Deletion is not claimed complete until a response acknowledges `cleanup_pending:false`.

After that acknowledgement, direct withdrawal, retry and reload clear the wrapper's response copy and UI flags plus only this session's practice/measured guided IndexedDB databases and matching legacy keys. The private credential and receipt remain. If local image deletion is blocked, the receipt displays that separate cleanup warning and Retry upload retries it. Downloaded ZIPs, response backups and private receipt files remain on the device; a website cannot remove those files. Other sessions and the original prototype's storage are not cleared.

## Local verification (synthetic only)

From the repository root:

```sh
node --test remote-study/frontend/core.test.mjs
python3 remote-study/frontend/local-server.py
```

The second command starts an isolated loopback server on port 18771 using the real backend `App` and an in-memory test store. It rejects human sessions. Open `http://127.0.0.1:18771/#invite=local-synthetic&synthetic=1` or run:

```sh
node remote-study/frontend/browser.test.mjs
node remote-study/frontend/recovery.test.mjs
node remote-study/frontend/slow-network.test.mjs
node remote-study/frontend/hosted-six-record.test.mjs
```

Requires the repository's `playwright-core` and installed Google Chrome. Browser tests use isolated contexts, actual original guided UI, actual ZIP downloads and external Playwright virtual time (no production timer bypass). The browser suite creates two paired partial sessions in opposite assigned orders, plus a cap/reload/tab-lock/withdrawal session. Recovery checks cover both workspace contexts, lost acknowledgements, remote checkpoint adoption, receipt lookup success/failure and acknowledged local withdrawal cleanup, including blocked IndexedDB deletion. Slow-network checks hold a checkpoint acknowledgement while submit/withdraw actions run, asserting one checkpoint followed by the terminal request without a stale-snapshot backlog. The six-record suite completes both conditions; its numeric SUS values are synthetic fixtures, not human ratings. Artifacts default to `frontend/evidence/`.

For an authorized synthetic hosted run, set `HLL04_STUDY_TEST_URL`, `HLL04_STUDY_INVITE_FILE` (plain text or JSON with `synthetic_invite`), and `HLL04_STUDY_TEST_DIR`. The suite rejects the local default invitation for a remote host. Never put a human invitation into a synthetic test. The script does not print invitations or tokens.

Run suites sequentially. The loopback server uses the real backend's creation throttle (20 requests per hour per source address); restart that isolated in-memory server between repeated regression batches. Hosted throttles must be respected rather than bypassed.

To repeat one recovery case, set `HLL04_STUDY_TEST_SCENARIO` to its exact scenario name. For example, `private receipt restores acknowledged metadata in another browser` executes only that case. The result records the number of executed scenarios and session-create requests; an unknown filter fails with zero session requests. The receipt case waits for the expected payload's server acknowledgement before testing restoration.

## Verification boundaries

Automated assertions are regression checks, not participant observations. They do not establish usability, physical camera operation, actual human file opening, ethical approval, browser diversity, or general device support. Frozen prototype validation remains separate from this remote protocol's testing.

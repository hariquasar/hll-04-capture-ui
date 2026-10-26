# Remote study browser API — HLL04-remote-table-v3

Separate from the frozen local v2 instrument. No participant observations or institutional approval is implied.

All requests use HTTPS. The backend URL is deployment configuration, never an AWS credential. Exact allowed browser origin: `https://main.d3g93doyp3ywja.amplifyapp.com` (configurable at deployment). Read the invitation from `#invite=CODE`, then remove it from the visible address; never put it in a query string. Do not create a session until the participant explicitly agrees to the displayed consent and confirms age 18 or older.

## Endpoints

Only `POST` and preflight `OPTIONS` exist. `Content-Type: application/json` is required. There are no public read, listing or administrative routes.

`POST /session` body:

```json
{"request_id":"UUID","config_version":"HLL04-remote-table-v3","ui_revision":"research-20261026-r1","invite_code":"fragment value","synthetic":false,"consent":{"agreed":true,"adult":true,"version":"HLL04-remote-consent-v1"},"environment":{"user_agent":"...","platform":"...","language":"en","viewport_width":1440,"viewport_height":900}}
```

Response: `{session_id, participant_code, order, token, sequence:0, status:'active', server_received_at, config_version, ui_revision, expires_at, withdrawal_expires_at}`. Odd P001/P003 codes receive baseline then guided; even codes the reverse. Synthetic sessions require a separate invitation and use S001 etc., without consuming human assignment numbers. Retrying the identical create request UUID returns the same assignment and credential; changing a body under the same UUID returns 409. Treat the returned token as a private resume credential. Do not log it or include it in exported research data.

`ui_revision` accepts only `research-20261026-r1` or `legacy-v3`. It is immutable for a session. Missing fields identify the original `legacy-v3` instrument, including old stored sessions, receipts and exact pending requests. New clients repeat their pinned revision on resume/checkpoint/submission/withdrawal; a mismatch is rejected before accepting or restoring data. Withdrawal remains available with a retained credential when its revision field is omitted. New acknowledgements and research documents include revision; an old idempotent acknowledgement is returned unchanged. Deploy the compatible backend before the new frontend.

All following requests require `Authorization: Bearer TOKEN` and `X-Study-Session: SESSION_UUID`:

- `POST /resume`: `{config_version, ui_revision}` (revision optional for legacy). Returns the assignment, sequence, status and `checkpoint` (last acknowledged full payload or null). Only the authenticated session can be read. No token is returned.
- `POST /checkpoint`: `{request_id:UUID, sequence:previous_ack+1, config_version, ui_revision, payload}`. Returns `{receipt_id,sequence,status,server_received_at,config_version,ui_revision}` only after private object storage and atomic database receipt commit. Retrying the identical request returns its original receipt. A changed body/request UUID or stale sequence returns 409; it never overwrites a newer checkpoint.
- `POST /submit`: same envelope and ACK as checkpoint; requires `payload.phase='complete'`, closes collection with status `submitted`. Partial/skipped blocks and incomplete questionnaires are retained. A submitted session cannot receive new checkpoints. This ACK means uploaded, not that both blocks are analytically eligible.
- `POST /withdraw`: `{request_id:UUID,config_version,ui_revision}`. Immediately excludes the session and purges uploaded checkpoint contents. Returns status `withdrawn` and `cleanup_pending:false` when deletion succeeds, or HTTP 202 with `cleanup_pending:true` if retry is required. Retain/retry the same request until cleanup is acknowledged. An uncertain in-flight object operation can keep cleanup pending for the bounded 180-second upload lease; retry after this interval if necessary. A minimal anonymous withdrawal/assignment tombstone remains; it is never counted as a usable participant result.

Errors are `{error:{code,message},server_received_at}` with HTTP 400 validation, 401 invalid/expired session, 403 origin/invite, 405 method, 409 sequence/idempotency/state conflict, 413 body limit, 429 rate limit, or 503 storage unavailable. Do not treat a timeout, 202 cleanup-pending, or failed request as a successful upload. Retain local pending data, reuse its exact request UUID/sequence/body on network retry, then resume if the client cannot determine whether the checkpoint committed. Queue writes serially. Do not overwrite an acknowledged server snapshot with a stale local copy after reload.

## Full checkpoint payload

```text
{
 phase: practice|instructions|task|questionnaire|review|complete,
 condition_index: 0|1,
 conditions: {baseline: BLOCK, guided: BLOCK},
 events: [{type, at, condition, phase, detail}],
 interruption_counts: {blur, hidden, reload, offline, resize},
 client_saved_at: ISO timestamp
}
BLOCK = {
 practice: {started_at: ISO|null, ended_at: ISO|null,
   status: not_started|in_progress|completed|abandoned, duration_ms: integer},
 status: not_started|in_progress|completed|capped|abandoned|skipped,
 started_at: ISO|null, ended_at: ISO|null, elapsed_ms: integer,
 records: [RECORD], draft: RECORD|null,
 export: {requested_at: ISO|null, sha256: hex64|null, bytes: integer,
   download_requested: boolean, opened_confirmed: boolean,
   opened_confirmed_at: ISO|null},
 sus: [] OR [ten integer 1–5 or null responses],
 questionnaire_status: not_started|completed|skipped,
 comments: string
}
RECORD = {record_id, task_id, scenario, location, subject_id, condition,
 notes, image_file, image_sha256}
```

All object keys are whitelisted; unknown keys are rejected. Strings are retained verbatim. Blank, incorrect and duplicate task IDs and metadata are accepted at collection; analytical identity/quality errors must be reported later, never silently corrected. Collection validates types and bounds, not answers. `questionnaire_status=completed` requires ten integer responses; partial responses use nulls and remain retained if skipped.

Bounds: UTF-8 request body 65,536 bytes; six records per condition plus one unfinished draft; 200 events per snapshot (maintain aggregate interruption counts when trimming the event buffer); metadata strings 500 characters, comments 2,000, record ID 120, event detail 500. Event type is lowercase snake case (max 64); event condition is null/baseline/guided; event phase is null or one listed above. Record image file is empty or `task-01.png` through `task-06.png`; digest empty or 64 lowercase/uppercase hex characters. No image bytes, data URLs, arbitrary file attachments or image uploads are accepted. Client durations are integer milliseconds 0–14,400,000; counts 0–100,000. Server-received timestamps are retained separately; client timing is not trusted as an independent measurement.

Collection/resume lifetime: four hours (`expires_at`). The same retained private credential authorizes withdrawal until `withdrawal_expires_at` (90 days by default); keep withdrawal available even when resume reports collection expiry. Lost credentials cannot be safely recovered through a public participant-code lookup. Rate guards: 30 authenticated requests/minute/session, 20 create attempts/hour per short-lived keyed source-IP hash, 100 successful human sessions/day (configurable). No raw IP address is stored in the research record. At most 300 checkpoint sequences, plus one final submission; autosave debounce at least three seconds and periodic checkpoint around twenty seconds. CORS is a browser restriction, not authentication or DDoS protection.

Default retention is 90 days, configurable for the dedicated bucket/table only. S3 lifecycle and DynamoDB TTL are asynchronous expiry mechanisms; operator deletion remains available. Consent wording must state the actual arrangement and access. No automatic retention/approval exemption is claimed.


## Private operator export contract

`export_results.py` uses authenticated AWS CLI reads, not a browser administration endpoint. `sessions.json` is an array of `{session_id,participant_code,synthetic,order,status,config_version,ui_revision,created_at,updated_at,consent,environment,latest_sequence,latest,withdrawal}`. `latest` is the full last acknowledged document below, or null when no checkpoint exists/withdrawn. `withdrawal` is null or `{received_at,cleanup_pending}`. Withdrawn environment is empty. All accepted historical documents are saved under `sessions/<session UUID>/checkpoints/`.

A checkpoint document contains `{schema:'hll04.remote.record.v1',config_version,ui_revision,session_id,participant_code,synthetic,order,consent,environment,sequence,request_id,kind:'checkpoint'|'submission',server_received_at,payload}`. Consent includes `accepted_at`. No bearer, token hash, invitation, raw IP or claimed quality score is included. Unacknowledged private orphan objects are not exported. The manifest records file hashes, collection counts and the CSV escaping policy; analytical eligibility is computed separately.

The exporter rechecks withdrawal per session before including records. This is a collection of individually consistent session snapshots, not an atomic global database snapshot. Re-export immediately before analysis, honor subsequent withdrawal requests, and delete superseded local copies. Local exports are the operator's responsibility and are not governed by AWS lifecycle deletion.

# Private remote-study backend

This directory belongs to **HLL04-remote-table-v3**, a separate remote study instrument. It does not change the frozen local v2 prototype or imply human testing, ethics approval, physical-camera validation, or equivalent results across instruments.

`handler.py` implements Lambda collection; `deploy.py` generates/reuses a reviewable CloudFormation plan; `export_results.py` provides authenticated operator export. The browser contract is [API.md](API.md). Python 3.9+ runs local tooling; Lambda uses Python 3.12 and its supplied boto3 SDK. There is no new EC2 application server and no local Python package installation requirement. Deployment/export require AWS CLI and the existing `my-aws` profile in `us-east-1`.

## Local verification

From this directory:

```sh
python3 -m unittest -v test_handler.py test_export.py
```

At authoring, **35 tests pass**. They cover consent before assignment, isolated P/S counters and alternating order, token isolation/expiry, full raw snapshots, idempotency and lost replies, stale writes, payload bounds, nested key restrictions, synthetic image filenames, partial questionnaires/submissions, storage failure, withdrawal races, uncertain object-operation leases, deployment policy, and private export/CSV safety. These use local storage models/adapters and do not establish actual AWS permissions, browser behavior, or human usability. Live integration must separately check Lambda permissions, DynamoDB transactions, S3 objects, exact-origin CORS, browser checkpoint/resume, submission and withdrawal.

## Deployment

Use absolute paths outside the repository for secret configuration and deployment evidence. Initialize only once; do not regenerate secrets when updating code. Reusing the token secret preserves existing resume and withdrawal credentials.

```sh
python3 remote-study/backend/deploy.py init --config /private/path/backend-config.private.json
python3 remote-study/backend/deploy.py plan --config /private/path/backend-config.private.json --evidence-dir /private/path/backend-deploy
```

Inspect `template.json` and `plan-summary.json` before applying. `parameters.private.json` and the configuration are mode 600; the evidence directory is mode 700. Never publish or attach these private files. `--origin` on `init` may select the exact HTTPS study origin; current default is `https://main.d3g93doyp3ywja.amplifyapp.com`. The web configuration contains the returned API URL and version only. Human and synthetic invitation codes are separate and must not be shipped in static assets. The participant link carries its invitation in the fragment, not the query string.

```sh
python3 remote-study/backend/deploy.py apply --config /private/path/backend-config.private.json --evidence-dir /private/path/backend-deploy
```

Only `apply` calls AWS. It creates or updates the dedicated stack using a change set and saves the reviewed change and resulting resource names. An unchanged plan is safe to repeat. Do not run it concurrently with another stack update. The helper scopes operations to the configured stack; it does not modify existing prototype hosting, EC2, or the earlier artifact bucket.

The template creates an encrypted S3 bucket with all public access blocked, TLS enforcement and bucket-owner ownership; a DynamoDB on-demand table with encryption and expiry; one bounded-concurrency Lambda; scoped execution IAM; and 14-day operational logs. Lambda receives only access to the new storage resources. The public function URL requires application invite/session authorization. Both current function-URL invocation permissions are declared, with ordinary invocation restricted to requests via the URL. The handler owns CORS/OPTIONS to avoid duplicate origin headers. No request payload or credential logging is performed by application code.

Bucket and table have `Retain` deletion policies to avoid accidental data loss if the stack is removed. Stack removal alone therefore does **not** delete research data; the operator must explicitly remove retained resources according to the agreed retention/withdrawal policy. No teardown command is provided that could accidentally remove study data.

## Durability, identity and limits

Only explicit adult confirmation and affirmative consent create a session. The server assigns alternating orders P001/P002, with a separate S001/S002 counter and invitation for synthetic tests. The bearer credential is a cryptographically derived 256-bit value over a random session UUID. Plaintext credentials never enter research documents or the operator export. Participant codes alone cannot authorize access. Browser CORS is an additional boundary, not authentication or DDoS protection.

Each acknowledged checkpoint has an immutable S3 document plus atomically committed DynamoDB receipt and latest pointer. The client must serialize exact request UUID/body/sequence retries. An S3 object whose database transaction failed is private but unacknowledged: it is excluded from export and expires through lifecycle. Full snapshots preserve incorrect/blank/duplicate task IDs and raw answers for later analysis; collection does not silently repair participant mistakes. Quality is computed independently from metadata and *reported* image hashes, not uploaded image bytes.

Limits are 64 KiB requests, six records plus a draft per condition, 200 events, 300 checkpoints plus a final submission, 30 authenticated requests per minute, 20 create attempts per hour per short-lived keyed IP hash, and 100 successful sessions per day per human/synthetic group by default. The raw IP is not stored. These are small-study safeguards, not proof of scale or abuse resistance. Only the six prepared image filenames and hashes are accepted; images are never uploaded.

## Withdrawal and retention

The collection window is four hours. The same retained private credential can request withdrawal through the configured retention window (90 days by default). Keep its receipt private; loss of the credential prevents safe automatic self-service identification. Withdrawal immediately marks the session excluded, removes stored answer documents, and leaves only a minimal administrative assignment/withdrawal tombstone. The frontend must distinguish HTTP 202 `cleanup_pending:true` from completed deletion.

A conditional 180-second upload lease prevents an in-flight object operation from racing a successful deletion acknowledgement. An uncertain PUT/delete timeout retains that lease; retry withdrawal after it expires. If the client stops retrying, exclusion still applies immediately, while physical object cleanup may await another retry or lifecycle expiry. This limitation must be reflected in participant wording; do not promise immediate deletion under every network failure.

S3 lifecycle (90 days from each object's creation) and DynamoDB TTL (90 days from consent/session creation) are asynchronous expiry mechanisms; they may retain data beyond the nominal expiry while deletion is processed. The four-hour collection window can make the latest object's nominal expiry up to four hours later than the session's. No exact deletion-time guarantee is made. The researcher must manage private local exports and any later analysis copies separately and honor withdrawal requests against them. No institutional approval or legal exemption is implied by this implementation.

## Private export and analysis

Use a **new** private output directory for each export:

```sh
python3 remote-study/backend/export_results.py --deployment /private/path/backend-deploy/deployment.json --output-dir /private/path/export-01
```

This command uses authenticated `my-aws` reads only. It requests a projection of session metadata that omits credentials, downloads accepted checkpoint receipts only, and rechecks withdrawal before admitting downloaded records. It writes mode-600 files inside a mode-700 directory:

- `sessions.json`: exact raw latest snapshot and safe session metadata, directly consumed by the separate remote analyzer. Withdrawn sessions contain no answers.
- `sessions/<UUID>/checkpoints/*.json`: accepted historical snapshots for audit, never unacknowledged orphan objects.
- `sessions.csv`: assignments, status, sequence and withdrawal state.
- `blocks.csv`: raw block status/timing, export confirmation, SUS responses and comments.
- `records.csv`: raw saved rows and explicitly marked unfinished drafts; `record_condition` is the answer, while `condition` is baseline/guided.
- `export-manifest.json`: hashes, counts and CSV encoding policy; present only after successful export.

CSV prefixes an apostrophe for formula-triggering values (including whitespace before `=`, `+`, `-`, `@`), leading control characters, and original leading apostrophes. JSON preserves the exact raw strings, so encodings are unambiguous. Use raw JSON for scoring. CSV is a review convenience and contains no derived quality or eligibility claim.

If a required acknowledged object is missing, export stops and no successful manifest is written. A partially created private directory may remain for diagnosis; do not analyze it. Re-export immediately before analysis because withdrawal may occur after an earlier export. This is not an atomic snapshot of the whole table. Delete superseded local copies and exclude all synthetic or withdrawn sessions from human results. Completed timing, valid SUS and record quality remain distinct outcomes.

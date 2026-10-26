# Remote paired study: HLL04-remote-table-v3

Prepared 21 October 2026. This is a new remote instrument. It does not assert
participant observations, institutional approval or a passing grade. The frozen
desktop v2 instruments remain unchanged. Do not pool the two designs silently.

## Research question and conditions

For six supplied synthetic image-and-label tasks, how does the instrumented guided
collection workflow compare with a basic browser table in completeness, accuracy,
reported task-image association, completion time and perceived usability?

Each person completes both conditions on their own desktop/laptop in the same
browser and sitting. Different participants may use different computers; record
that variation and report convenience recruitment. Target six to eight permitted
adult volunteers as an exploratory sample, not an official minimum or power claim.
Self-reported distinct participation cannot authenticate participant identity.

The baseline is a plain in-browser table. It is not Microsoft Excel, LibreOffice,
or the original folder-and-spreadsheet workflow. The guided condition reuses the
original metadata, validation, review, edit and ZIP-export implementation with an
instrumented study wrapper, prepared-image selection and isolated browser storage.
Document the exact adapted source hashes and the differences from `src/`.

Both conditions show the same six task cards, choices of prepared images and four
required labels. Images must be actively selected, not attached automatically by
task ID. No photo capture or scene interpretation is measured. Task IDs and labels
are entered by the participant. The table provides no required-field, correctness
or dropdown validation of metadata. Practice instructions must offer equal support.

## Entry, order and practice

A shared invitation URL starts the flow. Explain the actual data handling,
retention, voluntary participation and withdrawal before session creation. Require
explicit agreement and adult confirmation. Do not infer university approval from
the consent screen. Do not collect names or email addresses in the research data.

The server assigns consecutive P-codes. Odd assignments start with baseline;
even assignments start with guided. Synthetic verification has separate S-codes,
credentials and allocation and is always excluded from human analysis. A repeated
network request must not allocate a second participant or change order.

Before each measured condition, offer a separate two-minute practice using the
unscored practice image/card. Practice never enters scored outputs. Begin measured
work in a fresh condition-specific session, preserving any earlier work. Record
practice duration and status. If someone skips or cannot complete practice, retain
the deviation instead of pretending the standard preparation occurred.

## Timing and interruptions

Load assets and prepare the empty condition before the measured start. Present the
same task instruction and start timing when the participant selects the start
control. The measured block includes image selection, entry, checking, correction
and local export generation. Cap each block at 900 seconds. Retain partial work
and a `capped`, `abandoned` or `skipped` status when appropriate.

Keep task elapsed time separate from result-upload latency and questionnaire time.
Use a persistent start timestamp plus a monotonic clock while the page is active;
record reloads, hidden tabs, blur, offline and resize events. Do not silently pause
timing. A browser client clock is not an independent observer; flag clock/reload
anomalies, nonstandard preparation and interruptions in analysis.

Record the local artifact-generation/download-request event. A browser script
cannot independently establish that a person opened a downloaded file; any
openability confirmation is self-reported. Do not call the v3 timing endpoint the
same researcher-verified endpoint as the desktop v2 procedure. An attempted finish
with absent export or missing tasks must remain visible, not be excluded to raise
saved-record quality. Do not require correct answers as a condition of submitting
the research response.

## Questionnaires and qualitative data

After each condition, present the ten original SUS questions, with integer
responses from 1 (strongly disagree) to 5 (strongly agree). "This system" means the
entire condition just used. Preserve raw responses and partial/missing answers;
do not impute. Allow voluntary skipping/withdrawal. SUS is a 0-100 composite, not
percent correct. Ask the same retrospective questions: "What was hardest?" and
"What would you change?" Comments are optional and should contain no personal
details. Never manufacture quotations or classify inferred intentions as observed
behaviour. Unmoderated event logs cannot substitute for direct observation.

## Automatic collection and private storage

Record the assigned code and order, protocol/build version, reported browser and
viewport information, condition progress, task metadata and selected-image hashes,
client elapsed times, interruptions, export state, SUS answers and optional
comments. Do not upload image contents: the task images are known synthetic assets.
Selected hashes are client-reported evidence, not independent inspection of an
uploaded image. Preserve task labels, errors and incomplete attempts verbatim.

Use a dedicated authenticated collection API and private encrypted storage. The
shared invitation is exchanged for an unpredictable private session credential;
it is not an AWS credential. No public endpoint lists research results. Normal
hosting/request metadata and a short-lived keyed network rate-limit identifier
may exist outside the research export. State the actual 90-day retention window;
AWS lifecycle/TTL expiry is asynchronous. Keep a private withdrawal credential and
provide a withdrawal route. Preserve only the documented anonymous administrative
tombstone after withdrawing task content. Do not claim erasure while cleanup is
still pending. Researcher downloads already made need corresponding local removal.

Checkpoint progress and retry with the same sequence/idempotency key. The UI must
distinguish unsent local work, upload in progress and server-acknowledged storage.
Display successful submission only after an acknowledgement. On failure, preserve
local work and provide a retry/backup path. Server receive times are separate from
client task timestamps. Do not reset an elapsed block merely because a page reloads.

## Scoring and analysis

The participant is the unit of paired comparison. Required metadata comprises
scenario, location, subject_id and condition: six assigned tasks by four fields
gives 24 cells per condition. Completeness is nonempty cells/24 and accuracy is
correct cells/24. Retain missing tasks in both denominators. Metadata scoring uses
the original frozen trim/case normalization and no new synonyms. Task IDs are exact
strings 1-6; unknown or ambiguous duplicate IDs require an explicit quality error,
not guessed associations. Keep raw responses even if quality cannot be scored.

Report selected-image hash matches out of six, format/identity errors, partial
drafts and export failures separately. Compute quality, timing and SUS eligibility
separately, showing missingness for each outcome. A completed time need not disappear
solely because one SUS answer is absent. A capped/abandoned attempt is not a
completed-task time. A `submitted` API status does not imply analytical eligibility.

Show individual outcomes first. For each eligible outcome, pair the same
participant's guided and baseline result and report guided-minus-baseline
differences, actual paired n and descriptive summaries. Metadata percentage
differences are percentage points. Negative elapsed-time differences mean guided
was shorter; positive SUS differences mean its reported score was higher. Do not
substitute an unequal-set condition mean for a paired effect. No fabricated missing
answers, automatic significance claims or claim of equivalence from equal scores.

Exclude all synthetic tests and withdrawn sessions from participant results, while
reporting collection/withdrawal flow honestly. Preserve raw checkpoints and analysis
versions. Identify any protocol/build change and the affected observations. Do not
quietly replace a failed attempt with a later successful one.

## Interpretation and report integration

This study can supply preliminary evidence about this adapted desktop interface
and basic browser-table baseline. Convenience sampling, self-selection, device
variation, repeated tasks/learning, exact copying/ceiling effects, unobserved
assistance and client timing limit interpretation. It cannot establish industrial
fitness, physical-camera usability, hardware integration or superiority to ODK.
Equal, slower, worse or failed outcomes remain valid findings.

When reporting actual collection, update Chapter 3 with v3 and its changed baseline,
endpoint, device variation, consent process and data handling. Add a separate human
results section in Chapter 4; retain dated v2 engineering evidence. Discuss actual
trade-offs and limits in Chapter 5 and update the abstract/conclusion only after
real results exist. Update presentation method/results slides and rehearsal notes
to the same actual version. The existing working report's proposed same-laptop
comparison must not be presented as completed remote v3 work.

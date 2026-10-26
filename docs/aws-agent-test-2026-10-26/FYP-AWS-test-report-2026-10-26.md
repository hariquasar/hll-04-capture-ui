# FYP AWS app — agent-run test report

Tested on 26 October 2026 (Hong Kong time).

**Result:** the complete remote-study flow succeeded in desktop Google Chrome on macOS. Both measured conditions completed with six records each; both ZIP exports were downloaded and independently opened. The interface displayed a server submission receipt for synthetic session **S005** at **15:35:13 HKT**. Independent AWS readback confirmed the final submission at accepted sequence 43: synthetic marker true, both conditions completed with six exact tasks, both questionnaires skipped with no scores, matching image hashes, and no image bytes in the payload.

This is an agent-run functional test and usability walkthrough. It is not a human participant study, a SUS result, an assessment of research validity, or a grade prediction. Both test sessions displayed the synthetic-session exclusion banner. No human questionnaire ratings were supplied.

Public deployment: https://main.d3g93doyp3ywja.amplifyapp.com/

The public landing page needs a private invitation to start a new session. Invitation credentials are omitted from this report.

## What was verified

| Check | Observed result |
|---|---|
| AWS deployment | Amplify latest job 4 succeeded; study stack UPDATE_COMPLETE; Lambda Active, last update Successful. |
| Consent form | An unchecked start was blocked and focused the missing checkbox. Synthetic invitation created an S-code with an exclusion banner. |
| Practice | Separate two-minute practice timers were enforced. Continue was enabled at zero, and entry/export controls were disabled after practice expired. |
| Guided validation | Empty metadata triggered five field-specific problems and prevented saving. Correct fields saved successfully. |
| Guided task entry | Six assigned fictional cards were saved with their explicitly selected prepared images. The seventh-record button was disabled. |
| Guided refresh recovery | In S004, a saved record and partially filled second draft survived refresh; the timer kept running. |
| Table task entry | All six rows accepted the fictional task values and explicitly chosen images. |
| Table refresh recovery | All six rows and images survived refresh; the timer kept running. |
| Actual Chrome exports | Both measured ZIPs downloaded successfully and were opened outside the browser. |
| Export contents | Each ZIP contained six correct task metadata sets and six matching prepared images. CRC checks, safe/unique archive paths, image hashes, and CSV/manifest agreement passed. |
| Editing after export | Changing a location cleared both file-check confirmations and showed a stale-export warning. Restoring the correct value and exporting again allowed completion. |
| Normal completion gate | Normal finish was blocked without export/file confirmations. Both S005 conditions finished after genuine file inspection and confirmation. |
| Questionnaire | Save with no ratings showed an inline message requiring all ten answers or the skip option. Skip retained clearly labelled agent-test comments. Both SUS questionnaires were skipped. |
| Final review | The UI showed both conditions completed, six of six task opportunities each, and both questionnaires skipped. |
| Submission | The UI displayed “Submission received by the server” and a server receipt for S005. Independent AWS verification is recorded separately in fyp-aws-submission-verification.json. |
| Duplicate tabs | A second in-app-browser tab was prevented from editing or submitting the same S004 session. |
| Incomplete finish | S004's incomplete-finish action persisted a questionnaire checkpoint and retained its six guided records on AWS. |

## Findings and recommendations

### 1. Refresh loses the task-reference context — confirmed

In S004, task 2's draft returned with task ID 2 and location “3/F Block A”, but the outer reference panel returned to task 1 and said no image was selected in that step. The saved work was retained, but the surrounding reference could mislead someone resuming a draft. The same task-reference reset occurred after refreshing S005's table.

Preserve the selected reference card and selected-row/image context through refresh, or explicitly indicate that the restored draft belongs to another card. This is the clearest functional usability issue found.

### 2. Guided navigation has several separate scrolling areas — walkthrough observation

The guided condition combines the study page, a task-reference panel and an embedded prototype. Moving between image choice, metadata, record review and block completion requires navigating those areas. The form validation is helpful, but the layout adds navigation effort.

Consider fitting the embedded prototype to its contents and making the active record/task context easier to follow. Any study-interface changes should be reviewed against the comparison protocol before publication.

### 3. A local upload-queue safeguard is absent from the public build — verified build difference; live failure untested

The public study.mjs exactly matched deployment job 4 and did not include the local checkpointBusy/coalescing change. The existing request queue serializes calls; this finding does not prove overlapping writes or data loss. Redundant queued checkpoints could delay submission or withdrawal under slow responses.

Review and test that safeguard before publishing it. This walkthrough did not simulate slow-network submission or withdrawal on the current hosted build.

Public study.mjs SHA-256: 7bc7f37900292d402305360707fc4e1bfa5fd6440c9eb8f48573e19859581fac.

### 4. The in-app browser encountered export/control limitations — environment-specific

S004 generated an export event but the in-app browser did not expose a downloaded file. Browser control later timed out after incomplete finish, although AWS confirmed that transition was saved. A second tab showed the expected duplicate-tab restriction. The exact cause of the browser-control timeout was not established.

Desktop Chrome subsequently downloaded and opened both measured exports successfully and completed the study. Keep the existing instruction to use desktop Chrome. The in-app-browser problem is not evidence that normal Chrome exports are broken.

## Sessions and research-data handling

- **S004:** synthetic, Guided → Table. Six guided records retained; incomplete-finish outcome; table not started; not submitted. The active synthetic record remains subject to the study retention policy.
- **S005:** synthetic, Table → Guided. Both measured blocks completed; six records in each; both SUS questionnaires skipped; labelled agent-test comments only; submission received.

Agent execution times include inspection, automation and tool interruptions. They must not be interpreted as participant performance or used to compare interface speed. The guided practice in Chrome reached its time limit with an unsaved draft; practice entries are separate from measured records.

## Evidence files

- fyp-aws-submission-verification.json — sanitized independent AWS readback.
- independent-zip-verification.json — integrity and CSV/image audit of both measured archives.
- S005-baseline-measured.zip — final table export after the edit-and-re-export check.
- S-20261026T073238-a1d521f0-7e6f-4fda-9d61-2dc8ac503be2.zip — guided measured export.
- fyp-submission-received.png — final Chrome receipt screen.
- fyp-table-six-records.png and fyp-chrome-guided-six-records.png — workflow evidence.

## Scope limits

This run did not verify receipt-based recovery in another browser, withdrawal/deletion, offline recovery, slow-network queue behavior, a complete set of numeric SUS selections, mobile use, accessibility conformance, or security under hostile input. It did not test real photographs, hardware integration or camera capture: this study deliberately uses prepared fictional illustrations.

The core Chrome flow is functional. Human participant testing is still needed to establish whether the design is easy to use and whether it improves outcomes over the table.

# Phase 4 Demo Runbook — Live Form and Fallbacks

**Status:** Prepared; all Phase 4 live, device, venue, recorder, and video evidence is pending human rehearsal. No Phase 4 live-form rehearsal has been performed or claimed here.

## Demo boundaries and known Phase 3 handoff

The only live form target is the team-owned Microsoft Form:

https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAARkYjixUQ1JLWkRTT1lMVVYyTUxSOFRaQ1EySzhNSi4u

For the live form, reset by opening a fresh response page or clearing the page before a run. Do not use the offline copy as evidence for the live form. The local Phase 3 I2 survey reset is `npm.cmd run reset -w @blip/mock-server`; it resets only the synthetic local survey and fictional profile.

Phase 3's user report is recorded as given: Blip identified the team-owned Microsoft Form. The first required-field response named Employment type, Department, and Leave type and invited the user to continue; the continuation named Leave date and Return date. The user reported that the form was identified and the other Phase 3 checks worked, but individual command and privacy transcripts were not retained. The distinct Phase 2 I2 result was a **local synthetic** survey result: `Local submit observed. No data was sent.` It is not a live Microsoft Form result, not Phase 4 DEMO-03 evidence, and not evidence that Blip spoke a live result.

Use fictional values only for all live runs. Never use attendee, employee, or other personal information. The public form is the authority for live validation and confirmation; speak only observed page text and never infer successful submission.

## Fictional profile for rehearsal

Use these same fictional values for the negative validation attempt and each of the three consecutive live runs:

| Form field | Fictional rehearsal value |
| --- | --- |
| Name | Rowan Example |
| Employment type | Full time |
| Department | Engineering |
| Title | Software Developer |
| Leave type | Annual leave |
| Leave date | 2026-11-02 |
| Return date | 2026-11-03 |

Do not add private profile fields, credentials, payment information, or real attendee data. The local offline copy collects no response and sends no data.

## User-led live sequence (D-08, D-09, D-10, D-11)

Start each run from a fresh response page or a cleared form. For each beat, wait for the presenter's command before moving on:

1. **Describe:** ask Blip to describe the form and required fields. Report the current page-observed labels and errors; use the Phase 3 field list only as historical context.
2. **Negative validation check (once before the three runs):** leave one required field empty, fill the other required fields with the fictional values, then use the normal read-back and distinct spoken confirmation phrase. Only the user's explicit phrase can pass the submit gate. Record every validation error with its field label and remaining missing fields. Blip must not claim success. Reset from a fresh response page/cleared page afterward. Do not count this as one of the three live runs.
3. **Fill:** for each live run, ask Blip to fill using the same fictional values; pause for the user to inspect and correct.
4. **Read back:** ask Blip to read the page-observed values and correct any discrepancy before proceeding.
5. **Confirm:** Blip states the distinct phrase. Pause for the user to issue it; no other utterance or inferred intent authorizes submission.
6. **Observe:** after the user confirms, report only the page-observed confirmation text and number. If no result is observed, say success cannot be verified. Never treat a click, request, mock response, or missing error as confirmation.
7. Reset before the next run. Complete three successful runs consecutively with the identical fictional values; any failed or interrupted run resets the consecutive count to zero.

## Fallback run sheet (D-12, D-13, D-14, D-15, D-16)

| Trigger | Presenter steps |
| --- | --- |
| One clear STT miss (D-12) | After one clear recognition miss, say typing is available. Enter the same command in the voice window's typed-input field and use the same command pipeline. Do not repeat speech indefinitely. Record the observed miss and typed-path outcome. |
| NVDA fails or its output cannot be verified (D-13, D-16) | Stop and cancel the current output before switching. Announce the issue once. Use agent voice for the main demo; if NVDA is not reliable at freeze, limit it to the opening hook. Never overlap agent speech and NVDA. A software dispatch/return is not proof of audible completion. VOX-08 passes only when audible completion/cancellation maps to exactly one matching `speakId` per item; otherwise record the D-16 fallback and keep VOX-08 human-needed. |
| Live site or Wi-Fi fails (D-14) | Make exactly one phone-hotspot attempt. If the site remains unavailable, open a local copy and say aloud that the demo is offline before continuing. The offline public-form copy is `/fixtures/forms/offline/public-form.html`; it has no external assets, form submission, live-form link, or network action. It is a disclosed practice fallback and never counts toward DEMO-03. The existing local broken survey is `/fixtures/forms/broken.html`; the existing core-owned injection fixture is `/injection.html` on the local test-page host. |
| Recorder or backup video (D-15) | Select a recorder available on the demo machine, make a short test recording, and check that audio is understandable and the file can be reopened. Then record one uninterrupted three-minute walkthrough locally, using fictional data only and no personal data. Stop if recording captures private information; do not publish or copy the video into this repository. |

## Startup and reset commands

For the speech repairs, follow [04-REPAIR-ACCEPTANCE.md](04-REPAIR-ACCEPTANCE.md) one check at a time. The updated launcher builds the current client and prints its build identity. Reopen the same running build with `npm.cmd run demo -- --reopen-voice`; if it reports a build mismatch, stop the demo terminal with Ctrl+C and restart `npm.cmd run demo -- --brain=fake`. Microphone permission belongs to Blip's separate voice Chrome profile. Startup alone does not prove microphone or audible speed behavior.

Repair regression (2026-10-18): root suite passed 123 files / 1,298 tests, with 16 files / 28 tests skipped; root typecheck and voice build passed. Device acceptance and the original milestone rehearsals below remain pending.

- One-command demo startup: from the repository root, run `npm.cmd run demo`. Verify the local voice window and expected form are ready before beginning; record the actual startup outcome below.
- Local synthetic survey reset: `npm.cmd run reset -w @blip/mock-server`. This resets only the local broken survey and its fictional profile.
- Live Microsoft Form reset: open a fresh response page or clear the page. No automated reset is asserted for the live service.
- Local public-form fallback: use the local mock server's `/fixtures/forms/offline/public-form.html` route. The page is prominently labeled offline, performs only local required-field checks, and never POSTs or navigates to the live target.
- Local injection fallback: use the existing core-owned test-page host route `/injection.html`; do not duplicate or modify its fixture source.

## Phase 4 evidence ledger — leave pending until a human performs each check

| Check | Required evidence | Status / result |
| --- | --- | --- |
| Automated local preparation | Focused voice/runbook tests, full regression suite, and typecheck | PASS — focused 5 files / 26 tests; full suite 120 files / 1,257 tests passed (16 files / 28 skipped); root typecheck passed after review fixes |
| Demo startup | `npm.cmd run demo`, machine, date, ready outcome | PENDING — not run for this preparation |
| Live form target and reset | Confirm the URL above and fresh-page/clear behavior | PENDING — no Phase 4 page visit |
| Negative validation attempt | Missing required field, each observed field-labeled error, remaining missing fields, and no success claim | PENDING |
| Live run 1 | Reset, fictional values, user phrase, observed confirmation text/number or truthful unverifiable result | PENDING |
| Live run 2 | Reset, same fictional values, user phrase, observed confirmation text/number or truthful unverifiable result | PENDING |
| Live run 3 | Reset, same fictional values, user phrase, observed confirmation text/number or truthful unverifiable result | PENDING |
| Three consecutive live runs | Human-reviewed count and outcome; synthetic local results do not count | PENDING |
| NVDA speech exclusivity | Workstation, actual audible completion and cancellation, exactly one matching `speakId` per item, no overlapping Blip voice | PENDING — no device result inferred |
| D-16 fallback decision | If NVDA gate unavailable/unsafe at freeze, record agent voice for main demo and NVDA opening hook only | PENDING |
| STT miss and typed fallback | One clear miss and same-pipeline typed outcome | PENDING |
| Hotspot | Exactly one phone-hotspot attempt and observed result | PENDING |
| Offline disclosure | Audible disclosure before using each local fallback route | PENDING |
| Recorder test | Recorder selected, short test reopened, audio reviewed | PENDING |
| Three-minute video | Uninterrupted local file path outside this repository; fictional data and no personal data checked | PENDING |
| Freeze review / `demo-safe` tag | Human acceptance of all required live and fallback evidence, then accepted freeze commit | PENDING — no tag created |

Record only what the human directly observes. Leave failed, unavailable, or unperformed items pending or record the actual failure and fallback; do not fill fields from automated mock results. VOX-08 stays human-needed until its real audible completion/cancellation and `speakId` check passes. DEMO-03 and freeze remain pending until the live and physical acceptance criteria are reviewed.

## Task 3 preparation record

The prepared start path is `npm.cmd run demo`; the local synthetic reset path is `npm.cmd run reset -w @blip/mock-server`. The offline public form is served from `/fixtures/forms/offline/public-form.html`; the existing broken survey and core-owned injection route remain available at `/fixtures/forms/broken.html` and `/injection.html` on their local hosts. The automated local checks below cover route serving and runbook contents only. No demo window was launched, reset script invoked, live form visited or submitted, or physical rehearsal result inferred during this preparation.

| Automated check | Result |
| --- | --- |
| `npm.cmd test -- dev/mock-server/src/run-real.test.ts dev/mock-server/src/demo-runbook.test.ts` | PASS — 2 files, 7 tests |
| `npm.cmd run typecheck` | PASS — root TypeScript check |

## Post-review remediation record

Code review findings CR-01 and CR-02 and warnings WR-01 and WR-02 were fixed in commit `d65653e`. Screen-reader mode now mutes the global status live region and prevents local rate acknowledgements from using browser TTS; the voice UI has narrow/short viewport fallbacks; offline form controls meet the 48 px target. The focused 5-file test run (26 tests), root typecheck, and full suite (120 files / 1,257 passed; 16 files / 28 skipped) passed. These checks do not replace the pending live/device rehearsals above.

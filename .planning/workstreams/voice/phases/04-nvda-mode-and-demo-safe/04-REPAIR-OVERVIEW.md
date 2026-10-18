# Voice repair plan

Prepared 2026-10-18 against `d69d822`. Status: planned, not executed.

The repair addresses the remaining speech problems before continuing the Phase 4 demo checklist. Full findings and inspected repository revisions are in [04-REPAIR-RESEARCH.md](04-REPAIR-RESEARCH.md). Binding updates are in [04-REPAIR-CONTEXT.md](04-REPAIR-CONTEXT.md).

| Order | Plan | Result |
|---|---|---|
| 1 / wave 4 | [04-04](04-04-PLAN.md) | Current Chrome build, reliable reopen, mic readiness, and diagnostics that reveal the actual failure |
| 2 / wave 5 | [04-05](04-05-PLAN.md) | Hold stays logically active across recoverable browser endings; complete text is sent once on release |
| 3 / wave 6 | [04-06](04-06-PLAN.md) | Distinct Windows rate levels, intact speech fragments, stable voice and speech queue |
| 4 / wave 7 | [04-07](04-07-PLAN.md) | Track rate acknowledgement speech and verify actual PTT-to-exact-confirmation integration |
| 5 / wave 8 | [04-08](04-08-PLAN.md) | Automated regressions, a short device checklist, and accurate Phase 4 status |

Five sequential repair plans avoid concurrent edits to main.ts and its shared state. Each executor task commits its own completed work. Plans 04-01 through 04-03 remain executed history; all new plans carry gap_closure: true. The final plan includes the microphone/speaker check a human must perform.

## Coverage of the user's requests

| Report/request | Planned coverage |
|---|---|
| Recognizes only the first words; “read the form” becomes incomplete | Indexed final chunks, interim display, no dispatch before release, multiword and pause tests (04-05) |
| Holding Right Ctrl + Space ends automatically | Separate hold/session state, controlled recovery, ownership/disconnect cleanup, honest watchdog reason (04-04/05) |
| Cannot speak into Blip at all | Native readiness/error trace, explicit mic check, permission/device/service distinction, focused vs global route verification (04-04/05/08) |
| Faster/slower sounds unchanged | Windows-compatible preset levels, stable voice, same-text acoustic duration comparison (04-06/08) |
| Voice becomes silent after speed changes | Decimal-safe segmentation, onstart-aware deadlines, retained utterance, generation-safe queue recovery, repeat-adjustment test (04-06/08) |
| Blip fails to open/reopen or old UI appears | Dist-only supported entry, build identity, Chrome preference, same-profile reopen without changing form (04-04) |
| Cannot see page / wrong survey or missing required fields | Preserve separate profiles; regress live Microsoft page identity and five required labels/continue behavior on the known form (04-04/08) |
| Filled text not seen / submission does not complete | Existing observed-value regression suite plus local I2 full PTT and page-observed result, exact phrase once (04-07/08) |
| Overall Phase 4 completion | Repairs first; existing NVDA disposition, public-form runs, fallback rehearsal, video, and freeze remain explicit (04-08) |

The “forum” misrecognition will be checked after capture is reliable; no global rewriting of dictation or confirmation is planned. The Microsoft Form remains the public-form test; the synthetic local survey is used only for controlled submission regressions.

## Key decisions

- Keep the current architecture; learn from repositories rather than adding a framework.
- Collect event-only evidence before claiming the machine's root cause.
- Use once-per-second recovery only during a current hold, with finite retries and cleanup.
- Use source-informed rate levels rather than visually different numbers that may have identical Windows output.
- Verify audible output on this machine; mocked tests establish logic only.
- Preserve the existing interrupted stt.ts draft for 04-05 reconciliation. It is unverified and was not built/reloaded or committed by this planning pass.

## Execution

`$gsd-execute-phase 4 --ws voice --gaps-only`

Start with 04-04. Do not rerun completed phase plans. For user-led device checks, provide one short instruction at a time from the 04-08 acceptance checklist.

## Planning verification

See [04-REPAIR-PLAN-REVIEW.md](04-REPAIR-PLAN-REVIEW.md). Planning does not execute application tests or certify live audio. Independent-agent review was not performed.

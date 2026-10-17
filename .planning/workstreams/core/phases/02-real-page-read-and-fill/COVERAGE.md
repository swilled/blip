# Phase 2 multi-source coverage audit

Plans: 20 plans in 11 waves. The only planned user checkpoints are the exact dependency approval gate (02-01) and the final human-verify checklist (02-20).

| Wave | Plans | Scope |
|---|---|---|
| 1 | 02-01, 02-06, 02-07 | Pin approval, policy classifier, server refresher |
| 2 | 02-02 | Workspace setup |
| 3 | 02-03, 02-12, 02-13 | Extension build/connection tracer, server act path, fixture host |
| 4 | 02-04, 02-08, 02-14 | Socket recovery, DOM helper core, base fixtures |
| 5 | 02-05, 02-09, 02-15 | Reinjection, field metadata/privacy, dynamic fixtures |
| 6 | 02-10 | Content walk and per-frame snapshot |
| 7 | 02-11, 02-16 | Frame aggregation/snapshot tracer; live content acts and submit blocker |
| 8 | 02-17 | Background act routing and browser regressions |
| 9 | 02-18 | Highlight and structural mutation observer |
| 10 | 02-19 | Navigation/tab signals and server freshness proof |
| 11 | 02-20 | Integrated browser matrix and human verification |

Dependencies: 02-02 â†’ 02-01; 02-03 â†’ 02-02; 02-04 â†’ 02-03; 02-05 â†’ 02-03 + 02-04; 02-08 â†’ 02-03 + 02-06; 02-09 â†’ 02-06 + 02-08; 02-10 â†’ 02-05 + 02-09 + 02-14; 02-11 â†’ 02-05 + 02-10 + 02-14; 02-12 â†’ 02-02 + 02-06 + 02-07; 02-13 â†’ 02-02; 02-14 â†’ 02-13; 02-15 â†’ 02-03 + 02-13 + 02-14; 02-16 â†’ 02-10 + 02-12 + 02-15; 02-17 â†’ 02-10 + 02-11 + 02-12 + 02-15 + 02-16; 02-18 â†’ 02-08 + 02-17; 02-19 â†’ 02-07 + 02-15 + 02-18; 02-20 â†’ 02-05 + 02-07 + 02-12 + 02-14 + 02-15 + 02-17 + 02-19.

Shared-file edits are explicitly ordered by these dependencies. Plan 02-03 owns the initial extension shell; 02-04/05 extend it; read and act plans then build on that shell. The wire truncation rule is fixed at the extension boundary: 250 elements, and `truncated` only when that cap cuts the element list. The ~8k-token trim remains a Phase 4 model-prompt operation.

```text
SOURCE   | ID       | Feature / Requirement                                           | Plan(s)                 | Status  | Notes
-------- | -------- | --------------------------------------------------------------- | ----------------------- | ------- | -----
GOAL     | -        | Live-page read, fill, DOM read-back and safe refusal             | 02-01..20               | COVERED |
REQ      | PAGE-01  | Snapshot names, roles, values, required, options, errors         | 02-08..11,13..15,20     | COVERED | Wire cap is 250 elements; `truncated` only signals an element list cut. ~8k prompt trimming is Phase 4.
REQ      | PAGE-03  | Fail-closed kind per actionable element                          | 02-06,10,11,12,17,20    | COVERED | Rules, snapshot classification and live recheck.
REQ      | PAGE-05  | Page changes update the model within about 1 s                   | 02-03..05,07,11,18..20  | COVERED | Socket, aggregation, server refresh, observer and e2e.
REQ      | ACT-01   | React-safe typing and no Enter                                   | 02-12..17,20            | COVERED | Includes submit-event suppression for all acts.
REQ      | ACT-02   | Native select, radio and checkbox actions                        | 02-12..17,20            | COVERED | Includes onchange auto-submit regression.
REQ      | ACT-03   | Active field is visibly highlighted                              | 02-18,20                | COVERED | Plan 02-18 integrates fill/focus/select/check through the production act path and asserts each moves the overlay.
REQ      | ACT-04   | Report the actual post-write DOM value                           | 02-12,16,17,20          | COVERED | Post-write sensitivity recheck prevents shape-classified values from returning.
RESEARCH | F1       | REPL act path, phrases, no-fake-extension                        | 02-12                  | COVERED |
RESEARCH | F2       | maxlength clamp and truncation detail                            | 02-12,16,17,20          | COVERED |
RESEARCH | F3       | Synthetic focus/blur while page is not OS-focused                | 02-16,20                | COVERED |
RESEARCH | F4       | Rendered visibility, not viewport intersection                   | 02-08,20                | COVERED |
RESEARCH | F5       | Single-flight refresh, post-act refresh, age-based re-snapshot   | 02-07,12,19,20          | COVERED |
RESEARCH | F6       | Shared field kind mapping; server trusts RawElement.kind         | 02-06,10,12             | COVERED |
RESEARCH | F7       | Content-script exclusions plus `match_about_blank`/`match_origin_as_fallback` injection | 02-03 | COVERED | Manifest build test asserts both flags and the Blip-page exclusions.
RESEARCH | F8       | Last non-Blip target tab                                          | 02-11,19                | COVERED |
RESEARCH | F9       | Frame-qualified ids                                               | 02-11,17                | COVERED |
RESEARCH | F10      | Wire-cap semantics vs Phase 4 token trim                          | 02-10,20                | COVERED | `truncated` only means the 250-element wire list was cut.
RESEARCH | F11      | Edge 155 local browser; BLIP_BROWSER; teammate Chrome check      | 02-03,15,20             | COVERED |
RESEARCH | F12      | Confirm native setter before considering CDP                     | 02-16                  | COVERED | Native setter is primary; no CDP implementation is planned.
RESEARCH | Q1-Q5    | Browser, freshness, iframe order, cross-origin fallback, health  | 02-RESEARCH.md          | RESOLVED| Each question has a concrete decision and rationale.
CONTEXT  | D-01..20 | Locked engine, act, build, freshness, coverage and wire decisions| all as below            | COVERED |
CONTEXT  | A-01..08 | Research amendments                                              | 03,06..20               | COVERED |
SAFE     | SW-01    | Post-write sensitive-shape recheck                               | 09,16,17,20             | COVERED | Luhn-valid 13â€“19 digit values and existing sensitive patterns are refused; no read-back escapes.
SAFE     | SW-02    | Block submit events for the duration of every act                | 16,17,20                | COVERED | Ref-counted capture guard restores page behavior in `finally`.
SAFE     | SW-03    | readonly treated as disabled in snapshot and live act            | 08,09,16,20             | COVERED |
SAFE     | SW-04    | â€œClose and confirmâ€ and link href/target text remain gated        | 06,10,11,17,20          | COVERED |
```

Decision traceability:

| Decisions | Plan(s) |
|---|---|
| D-01, D-08..12 | 02-03..05 |
| D-02..04, D-06..07, D-19 | 02-08..10, 02-16, 02-18 |
| D-05, A-06 | 02-06 |
| D-13..14 | 02-18..19 |
| D-15..16, A-05 | 02-07, 02-10..12, 02-16..19 |
| D-17..18, A-04 | 02-09..10, 02-15..17 |
| D-20, F10 | 02-10, 02-20 |
| A-01..03 | 02-12, 02-16..17 |
| A-07..08 | 02-03, 02-15 |

Excluded as agreed in `02-CONTEXT.md`: CDP AX snapshots and CDP typing, custom ARIA widget filling, contenteditable filling, file uploads, cross-origin iframe support beyond the time-boxed best effort, Phase 4 model-prompt trimming, and Phase 5 startup/injection hardening. No changes to `packages/protocol`, `PROTOCOL.md`, `CLAUDE.md`, or the core `STATE.md` are planned.

*Last updated: 2026-10-16 â€” revision addresses plan checker findings.*


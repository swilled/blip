# Phase 1 Spike Decisions

Read by Plans 06-10. Source: spikes/*.md (human run by the voice developer, 2026-10-16, plus automated runs in spikes/AUTO-RESULTS.md).

| Key | Value | Status / reason |
|---|---|---|
| LAYOUT | pinned-popup (Chrome --app window, D-01) | Confirmed viable: speech output and recognition work in it. Docked-beside-form is the fallback. |
| PTT_ROUTE | uiohook-hold (D-02) | PASS, confirmed with physical keys and injected keys. |
| STT_UNFOCUSED | PASS (medium confidence) | Automated run returned results with visibilityState hidden, focus false. Fully-covered case UNCONFIRMED (no result, no error). Human hold-to-listen runs were too short (aborted), so the hold path is not human-confirmed. |
| TTS_UNFOCUSED | PASS | Local voice Microsoft David, onstart ~0.4-0.6 s, onend fires. The speak.done bridge must treat onerror interrupted/canceled as done with interrupted:true. |
| PIN_METHOD | koffi-SetWindowPos (HWND_TOPMOST), exact title match | Human run FAILED (substring match pinned the wrong window). Fixed in 2763ee1; automated decoy test passes; human re-check PENDING. Fallback: dock beside the form. |
| NVDA_ROUTE | agent-voice-only (default) | C1 NOT RUN, NVDA not installed. DLL loads (returns 1722 without NVDA). controller-dll stays the target once tested. |
| LIVE_REGION | NOT RUN | C2 needs NVDA. Do not rely on live-region announcements in 01-UI-SPEC.md until tested. |
| BARGE_IN_MODE | ptt-only | Echo is real (open mic recognized Blip's own phrase with the user silent). GATE_08_PRESENT=false. Interrupt by PTT hold or typed "stop"; VOX-06 voice "stop" works between turns. |
| ECHO_FILTER | required (before any voice barge-in) | Compare recognized text to the text currently being spoken, plus the GATE-08 server-side guard. Headset not tested. |
| SPACE_LEAK | no | User confirmed no space typed holding Right Ctrl + Space; automated run agrees. HO-1 (extension suppression) likely unnecessary; revisit if the residual case (release Ctrl first while Space auto-repeats) is seen. |

## Open spikes
- C1 NVDA controller DLL end-to-end: NOT RUN (no NVDA).
- C2 live region: NOT RUN (no NVDA).
- A fully-covered window and a proper human hold-to-listen (hold 1-2 s or more while speaking): unconfirmed.
- E human re-check of the pin after commit 2763ee1: pending.
- F headset and "stop recognized during speech": not tested.

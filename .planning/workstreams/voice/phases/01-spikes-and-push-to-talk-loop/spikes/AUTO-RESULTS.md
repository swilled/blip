# Automated spike results (no human at the keyboard)

Run on 2026-10-16 on the voice developer's machine: Windows 11, Chrome 155.0.8059.80, Node 24.20.0, no NVDA installed.
Scripts: `scripts/spikes/auto-e-pin.ts`, `auto-ab-speech.ts`, `auto-d-ptt.ts`, `auto-f-echo.ts`.
These are machine evidence only. The human runs (`scripts/spikes/run-human.ts`) confirm with a real voice and real keys.

| Spike | Result | Confidence |
|---|---|---|
| E pin on top | PASS. `pinTopmost("...")` found a real Chrome `--app` window and `WS_EX_TOPMOST` read back as set. | HIGH (machine-verified) |
| B speechSynthesis | PASS. Voices available: Microsoft David, Mark, Zira (all local). `onstart` fired after ~784 ms, `onend` fired (~2.0 s after start) in a Chrome app window. No error. | HIGH for onend with local voices |
| A Web Speech in app window | Recognition started, returned results and ended with no error while the window was **focused** and while it was **not focused (visibilityState "hidden")**. The fully-covered case returned no result and no error (inconclusive: no speech may have occurred). The fake-microphone wav was ignored by Chrome's speech path, so recognition listened to the real mic; transcripts were not kept. | MEDIUM: background is not blocked, covered case still needs a human run |
| D PTT hook | PASS with injected keys: Right Ctrl 3613 + Space 57 seen by the global hook; one start/end per hold whether Space or Right Ctrl is released first; Left Ctrl + Space (29, 57) does NOT start; key-repeat gives a single start. No space was typed into a focused text field while Ctrl was held. | HIGH for hook and state machine; the space-leak result is for a plain text input only |
| F echo | Inconclusive. 1 of 9 words of Blip's phrase recognized while it spoke through the speakers. Depends on speaker volume and mic position. Barge-in stays forced to `ptt-only` (`GATE_08_PRESENT=false`). | LOW |
| C1 NVDA DLL | NOT RUN. NVDA is not installed here. `nvdaSpeak` loads the DLL and returns 1722 (server unavailable), which is the expected no-NVDA result. | n/a |
| C2 live region | NOT RUN (needs NVDA). | n/a |

## Implications for the decisions file

- `PTT_ROUTE`: uiohook-napi hold works. Use it.
- `LAYOUT`: a separate Chrome app window works for speech output and recognition while another window has focus.
- `SPACE_LEAK`: not observed with Ctrl held in a plain input. The one remaining risk is releasing Ctrl first while Space auto-repeats, which a human run should check. HO-1 (extension Space suppression) may be unnecessary.
- `PIN_ROUTE`: koffi `SetWindowPos(HWND_TOPMOST)` works. Use it.
- `BARGE_IN_MODE`: leave `ptt-only` until echo is tested on the real demo hardware and GATE-08 exists.

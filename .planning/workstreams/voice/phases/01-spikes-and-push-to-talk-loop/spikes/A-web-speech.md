# Spike A: Web Speech recognition in the Chrome app window

Question: does `webkitSpeechRecognition` return results in the separate `--app` window when it is focused, unfocused, or covered?

Procedure: `scripts/spikes/spike-server.ts` + spike.html in a Chrome `--app` window; automated run (`auto-ab-speech.ts`) and a human "Hold to listen" run.

Evidence:
- Focused: results returned (seen during the F run, visibilityState visible, focus true; also in the automated run).
- Unfocused: automated run returned results and ended with no error with visibilityState "hidden", focus false.
- Fully covered: no result and no error. Inconclusive (no speech may have occurred).
- Human "Hold to listen" runs produced NO result lines: stop() was called ~60-200 ms after start and ended with error=aborted. The hold was too short, so this path is NOT confirmed by the human run.

Result: PASS (medium confidence) for focused and unfocused/hidden. NOT CONFIRMED for the fully-covered case. Human hold-to-listen retest still open.

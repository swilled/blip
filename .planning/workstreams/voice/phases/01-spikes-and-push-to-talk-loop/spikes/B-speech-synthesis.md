# Spike B: speechSynthesis in the app window

Question: does local-voice TTS speak, and does `onend` fire, in the separate window?

Evidence (human run plus automated run):
- Local voices available: Microsoft David, Mark, Zira. Used: Microsoft David.
- `onstart` fires ~0.4-0.6 s after `speak()` (automated run: ~784 ms).
- `onend` fires: ~2.0 s for a short text, ~7 s for a 19-word text, ~12 s (11.9-12.0 s) for 33 words.
- When a new `speak()` cancels the previous one, the cancelled utterance fires `onerror` = interrupted and NOT `onend`. The log line "tts no onend after 15 s" appeared right after an interrupted utterance, so it is the interrupted case, not a failure.
- Implication: the speak.done bridge must treat `onerror` "interrupted"/"canceled" as done with `interrupted: true`.

Result: PASS.

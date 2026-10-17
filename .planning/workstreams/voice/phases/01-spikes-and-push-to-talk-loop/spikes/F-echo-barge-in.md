# Spike F: echo and voice barge-in

Question: does the open mic hear Blip's own speech, and can the user be recognized talking over it?

Evidence (F.log, mode=open, speakers, Microsoft David, 33-word text):
- Run 1, user silent: the recognizer still produced interim and final results matching the start of Blip's own phrase (Blip's own text: "form with four fields"), echoSubstring=true. Blip hears itself: echo is REAL on this hardware.
- Run 2, user speaking over Blip: the user's words were captured (echoSubstring=false). Voice barge-in is technically capturable.
- "stop" recognized during speech: not tested in the logs (saidStop=false in both runs; the user said a different word).
- Automated run (F-auto.log): 1 of 9 words recognized, inconclusive, hardware dependent.
- Headset run: not done.

Result: FAIL for safe open-mic voice barge-in without an echo filter. Decision: ptt-only for Phase 1; any future voice barge-in needs GATE-08 plus an echo filter (compare recognized text to the text currently being spoken).

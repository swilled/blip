# Spike D: global hold-to-talk (Right Ctrl + Space via uiohook-napi)

Question: do global keydown/keyup give a clean hold, and does Space leak into a focused field?

Evidence:
- Human run with physical keys: works. Both release orders work, Left Ctrl + Space shows nothing, key repeat is a single hold. User confirmed no space typed into a field while holding Right Ctrl + Space.
- Automated injected-key run (D-auto.log): hook saw keycodes 3613 (Right Ctrl) + 57 (Space); one start/end per hold for both release orders; Left Ctrl + Space (29, 57) did not start; key repeat gave one start; inputChars=0, spaceLeaked=false. "RESULT D: PASS".
- Residual risk: releasing Ctrl first while Space auto-repeats could type a space. Not observed.

Result: PASS.

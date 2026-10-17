# Spike E: keep the Blip window always on top

Question: can koffi `SetWindowPos(HWND_TOPMOST)` keep the `--app` window above other windows?

Evidence:
- First automated run: PASS, WS_EX_TOPMOST read back as set.
- Human run: FAIL. The Blip window did not stay on top after clicking another window. Root cause: `pinTopmost` matched any Chrome window whose title contains "Blip" (substring), so it likely pinned a normal Chrome window (for example a tab titled ".../blip"), not the app window.
- Fix: commit 2763ee1, exact title match (`loose` option keeps the old behavior). Automated test with a decoy window now passes: it pins the exact app window and the window stays topmost after another window is activated.
- Human re-check after the fix: PENDING.

Result: FAIL (human run, before fix); automated PASS after fix; human re-check pending. Fallback if it fails again: dock the window beside the form.

# Phase 4: NVDA Mode and Demo-Safe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 4-nvda-mode-and-demo-safe
**Areas discussed:** NVDA mode and switching, Speech rate controls, Public-form rehearsal, Fallback kit and backup

The user asked Codex to select its recommended option for all discussion choices. All Phase 4 selections below follow that instruction.

---

## NVDA mode and switching

**Q1 — How should the user select screen-reader mode?**
- Explicit accessible toggle; start in agent voice. **Selected by standing instruction.**
- Automatically switch whenever NVDA is detected.
- Always start in NVDA mode.

**Q2 — What happens to speech during a mode switch?**
- Cancel output on the old channel before using the new one. **Selected by standing instruction.**
- Finish the current utterance, then switch.
- Allow a brief overlap.

**Q3 — What if the NVDA controller is unavailable?**
- Announce the problem and fall back to agent voice. **Selected by standing instruction.**
- Remain silent.
- Continue silently in NVDA mode.

**Q4 — Should the mode persist across restarts?**
- Keep it for the current session; start the next session in agent voice. **Selected by standing instruction.**
- Persist the last selection.
- Infer the mode from installed software.

---

## Speech rate controls

**Q1 — How much should “faster” or “slower” change the rate?**
- Change by 0.1 per command, bounded to 0.8–1.5. **Selected by standing instruction.**
- Change by 0.25, bounded to 0.5–2.0.
- Use slow/normal/fast presets.

**Q2 — How should Blip acknowledge a rate change?**
- Give one short confirmation at the new rate. **Selected by standing instruction.**
- Apply silently.
- Repeat the previous reply.

**Q3 — When should the change take effect?**
- On the next speech item; do not restart current speech. **Selected by standing instruction.**
- Restart the current reply at the new rate.
- Wait until the next user command.

**Q4 — What should happen at a rate limit?**
- Say when it is already at the limit. **Selected by standing instruction.**
- Clamp silently.
- Allow rate to continue beyond the comfortable bounds.

---

## Public-form rehearsal

**Q1 — What data should the three runs use?**
- Reuse the same fictional profile and values; never use personal data. **Selected by standing instruction.**
- Use fresh values each run.
- Use real user information.

**Q2 — How should the live walkthrough proceed?**
- Pause for the user's command at each demo beat. **Selected by standing instruction.**
- Automatically continue through all steps.
- Use fixed narration without user commands.

**Q3 — How should validation errors be handled?**
- Read each detected error with its field, identify missing data, and do not claim success. **Selected by standing instruction.**
- Say only that submission failed.
- Retry automatically.

**Q4 — What should Blip say after submit?**
- Read observed confirmation text/number and say success is unverified if the page does not confirm. **Selected by standing instruction.**
- Say “submitted” after the click.
- Give no spoken result.

---

## Fallback kit and backup

**Q1 — What happens after speech recognition fails?**
- After one clear miss, offer typing through the same command path. **Selected by standing instruction.**
- Retry several times before offering typing.
- Stop the run.

**Q2 — What if NVDA output fails?**
- Announce once and switch to agent voice without overlap. **Selected by standing instruction.**
- Continue silently.
- Restart the full demo.

**Q3 — What if the public site or Wi-Fi fails?**
- Try the hotspot once, then use clearly identified local copies of every demo site. **Selected by standing instruction.**
- Wait for the site to return.
- Use an offline copy without identifying it.

**Q4 — What should the fallback kit include?**
- A run sheet with fallback triggers and a complete three-minute video stored locally. **Selected by standing instruction.**
- A highlights-only video.
- A written script without a recorded backup.

## the agent's Discretion

- Exact rate acknowledgement wording and run-sheet formatting may follow established voice-window conventions.

## Deferred Ideas

None.

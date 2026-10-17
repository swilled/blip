# Phase 4: NVDA Mode and Demo-Safe - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Blip can be demonstrated alongside NVDA and on a team-owned real public form, with a reliable fallback if voice input, NVDA, the network, or the live site fails. Phase 4 delivers VOX-07, VOX-08, DEMO-03, and DEMO-04. The run includes three consecutive public-form completions, the observed confirmation result, an offline copy, a hotspot plan, a rehearsed plan-B script, a `demo-safe` freeze, and a complete three-minute backup video.

</domain>

<decisions>
## Implementation Decisions

### NVDA mode and switching (VOX-08)
- **D-01:** Provide an explicit, accessible output-mode toggle. Start each new session in agent-voice mode; the user selects NVDA mode when ready.
- **D-02:** When changing output modes, cancel speech on the old output before sending any new speech through the selected output. Only one output speaks at a time.
- **D-03:** If the NVDA controller is unavailable, announce the problem once and fall back to agent voice.
- **D-04:** Keep the mode choice for the current session. A new session starts in agent-voice mode until the user selects NVDA.

### Speech rate controls (VOX-07)
- **D-05:** “Faster” and “slower” change agent-voice rate by 0.1 per command, starting at 1.0 and clamped to 0.8–1.5.
- **D-06:** Apply the new rate to the next speech item, including a short spoken acknowledgement at the new rate. Do not restart speech already in progress.
- **D-07:** At a rate limit, keep the value within bounds and say that it is already at the fastest or slowest setting. Rate changes last for the current session and do not change NVDA's own rate.

### Public-form rehearsal (DEMO-03)
- **D-08:** Use only the same fictional profile and test values for all three consecutive runs; do not enter personal data.
- **D-09:** Keep the user in control at each demo beat: describe, fill, read back, present the distinct phrase, then wait for the user's command.
- **D-10:** If the site reports validation errors, read each detected error with its field label, identify remaining missing data, and do not claim success.
- **D-11:** After submit, read the observed confirmation text and number if present. Attribute success to the site's result; if no confirmation is observed, say that success cannot be verified.

### Fallback kit and backup (DEMO-04)
- **D-12:** After one clear speech-recognition miss, say that typing is available and route typed input through the same command pipeline.
- **D-13:** If NVDA output fails, announce the issue once and switch to agent voice without overlapping speech.
- **D-14:** If the live site or Wi-Fi fails, try the tested phone hotspot once. If the site remains unavailable, switch to the locally served offline copies of every demo site and clearly say the demo is offline.
- **D-15:** Prepare a concise run sheet with fallback triggers and record a complete, uninterrupted three-minute demo video, stored locally.
- **D-16:** Carry forward the roadmap fallback: if NVDA is not reliable by freeze, use agent voice for the main demo and show NVDA only in the opening hook.

### The agent's Discretion
- The user instructed Codex to choose the recommended option for discussion choices; the decisions above record those recommendations as the selected defaults.
- Exact rate-acknowledgement wording and run-sheet formatting may follow existing voice-window conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/workstreams/voice/ROADMAP.md` — Phase 4 goal, freeze criteria, fallback plan, and demo timing.
- `.planning/workstreams/voice/REQUIREMENTS.md` — VOX-07, VOX-08, DEMO-03, DEMO-04 and core dependencies.
- `.planning/PROJECT.md` — core value, Windows/Chrome/NVDA platform, privacy, and demo constraints.
- `docs/WORK-SPLIT.md` — V10/V11 ownership and PROT-03/RES-01 handoffs.
- `.planning/research/FEATURES.md` — four demo beats, counts-first wording, and user-controlled interaction.

### Decisions carried forward
- `.planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md` — command behavior, sensitive-field handoff, trust disclosures, and missing-field reporting.
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-CONTEXT.md` — agent-voice mode, voice-window controls, typed fallback, and interaction constraints.
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-SPIKE-DECISIONS.md` — NVDA end-to-end and live-region tests remain unrun; agent voice is the default fallback.

### Core integration dependencies
- `.planning/workstreams/core/ROADMAP.md` — PROT-03 one-command startup and RES-01 result reading.
- `.planning/workstreams/core/REQUIREMENTS.md` — protocol startup and result-page contract.
- `CLAUDE.md` — ownership boundaries and the rule that Blip never claims a result the page does not confirm.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/server/src/voice/nvda.ts` loads the NVDA Controller Client DLL and exposes speak/cancel operations with an error message when unavailable.
- `apps/voice/src/tts.ts` provides queued, interruptible agent speech with per-speech completion reporting; it does not yet expose a rate control.
- `dev/mock-server/src/reset.ts` and `fixtures/demo/profile.template.json` provide the local demo reset path and fictional test data.

### Established Patterns
- Agent voice is the Phase 1 default. The NVDA DLL route is the target, but Phase 1 did not test it end to end because NVDA was unavailable.
- Typed input is available as a fallback for voice commands. The speech queue reports completion and interruption so the UI can avoid duplicate output.
- Demo content uses fictional data because speech recognition sends audio to Google STT.

### Integration Points
- The voice app owns the output-mode control, rate controls, spoken runbook prompts, and backup demo assets.
- Phase 4 depends on core's PROT-03 startup and RES-01 result reading, and on Phase 3's real-Claude command set.
- No public-form rehearsal page, fallback run sheet, or backup video is present in the current repository scan; the plan must coordinate the team-owned public form and prepare these assets.

</code_context>

<specifics>
## Specific Ideas

- Keep the live demo user-led, with a pause between describe, fill, read-back, and the confirmation phrase.
- Try the phone hotspot once before switching to clearly identified, locally served offline copies of the demo sites.
- Record the entire three-minute walkthrough as the backup, using only fictional test information.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 4 scope.

</deferred>

---

*Phase: 04-nvda-mode-and-demo-safe*
*Context gathered: 2026-10-17*

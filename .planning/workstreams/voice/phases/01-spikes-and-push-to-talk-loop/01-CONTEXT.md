# Phase 1: Spikes and Push-to-Talk Loop - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The user can hold a key while the form tab is focused, speak or type a command, and hear Blip answer in its own voice, with the transcript on screen. Works first against the voice track's mock server, then against the real server at I1. Includes the risk spikes due by hour 3.

</domain>

<decisions>
## Implementation Decisions

### Voice window
- **D-01:** The voice UI is a separate popup window (not a toolbar popup, not a side panel, not a normal tab). It opens at startup and stays on top so it sits beside the form.

### Push-to-talk
- **D-02:** Push-to-talk is a global hold of **Right Ctrl + Space** via `uiohook-napi`. Hold to talk, release to send. It works from the form tab.

### Interrupting Blip
- **D-03:** The user can interrupt Blip by speaking. As soon as the user speaks, Blip stops and the new utterance starts a new prompt. (User decision, 2026-10-16.) **Conflict:** this requires the mic to be open during Blip's speech, which contradicts VOX-05 ("the mic is never open while Blip speaks"). VOX-05 has been amended (voice REQUIREMENTS.md) to allow barge-in, with the confirm phrase blocked while Blip speaks and for 1 s after. The echo risk (Blip hearing its own voice) is a Phase 1 spike. Changing the confirm-phrase rule touches the gate, so Pranav must sign off.

### Transcript display
- **D-04:** The popup shows a live caption of the current utterance and a finished log of each exchange (what was said, what Blip replied).

### Claude's Discretion
- Exact window size and position, as long as the window stays visible beside the form.
- Spike-driven choices from the Phase 1 spike list (Web Speech in an unfocused window, NVDA live-region behavior, uiohook-napi versus the `chrome.commands` fallback). The fallbacks in the roadmap apply if a spike fails.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestones
- `.planning/workstreams/voice/ROADMAP.md` — Phase 1 success criteria, spike list, shared milestones (M0, I1)
- `.planning/workstreams/voice/REQUIREMENTS.md` — VOX-01..06, VIS-01, DLG-01 (Phase 1 requirements)
- `docs/WORK-SPLIT.md` — voice work packages V1–V3 and the stub/hand-off rules

### Project constraints
- `CLAUDE.md` — Team section (voice owns `apps/voice`, `packages/dialogue`, `dev/mock-server`); safety invariants (the voice UI never decides whether a confirm phrase matched)
- `.planning/PROJECT.md` — project constraints and the Windows/Chrome/NVDA platform

### Research
- `CLAUDE.md` section 5 (Voice) — background-tab speech risk, `uiohook-napi` choice, NVDA controller client, `speechSynthesis` notes

</canonical_refs>

<code_context>
## Existing Code Insights

No application code exists yet (`apps/`, `packages/`, `dev/` are not in the repo). Phase 1 creates the voice UI from scratch.

### Reusable Assets
- None yet.

### Established Patterns
- Stack is fixed by CLAUDE.md: TypeScript, Vite vanilla template for the voice UI, `ws` for the socket, `uiohook-napi` for push-to-talk.

### Integration Points
- The voice UI connects to `dev/mock-server` until I1, then to the real server's `/ui` socket.

</code_context>

<specifics>
## Specific Ideas

- Push-to-talk is "Right Ctrl + Space" held together. Release of either key ends the utterance.
- "Stop" must be recognized while Blip is speaking. Note for the spike: check that Blip's own speech doesn't trigger "stop" through the mic.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-spikes-and-push-to-talk-loop*
*Context gathered: 2026-10-16*
</content>

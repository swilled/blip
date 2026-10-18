# Phase 4 Hand-offs

## HO-10: Core server routing for session speech output

**Owner:** Core (Pranav) for the server hub; voice owns the NVDA adapter in `apps/server/src/voice/`.
**Needed before:** Voice Phase 4 Plan 04-01's end-to-end NVDA tracer can run.
**Status:** Core routing seam implemented in the merged integration. NVDA output remains safely unavailable because the installed Controller Client surface has no per-utterance completion signal; the hub returns to agent voice before sending tracked speech.

Core's server hub owns `apps/server/src/server.ts`, including the current no-op `settings` handler. Implement the core-owned routing seam so the existing `SettingsPayload.outputMode` is stored per voice session and server-issued speech goes through exactly one route. The voice-owned NVDA adapter provides the local native speech operation; browser agent voice remains the default. Cancel and settle the prior route before sending the next item through the selected route. Keep the existing protocol schema and do not enable `both` in the UI.

The server must retain each server-issued `speakId` until an actual NVDA completion or cancellation signal reaches the existing GATE-08 completion state exactly once. A return value that only confirms the DLL call was accepted is not completion. Report NVDA unavailability through an existing status/error message so voice can announce it once and fall back to agent voice. Preserve the existing one-second post-speech guard. Add core-owned routing tests in the core track; voice tests exercise the adapter and agreed interface without editing core-owned files.

The merged core implementation stores the session output mode, interrupts and settles the previous route before changing it, and uses agent voice when safe NVDA completion is unavailable. The voice UI may request screen-reader mode, but the server warning and fallback are authoritative. This closes the routing hand-off; it does not claim an NVDA device acceptance run. Keep `VOX-08` human-needed until audible completion and cancellation each settle exactly one matching `speakId` on a real NVDA workstation.

This hand-off does not authorize voice to modify the core server hub. Any protocol change requires both workstream owners' agreement under `CLAUDE.md` and `docs/WORK-SPLIT.md`.

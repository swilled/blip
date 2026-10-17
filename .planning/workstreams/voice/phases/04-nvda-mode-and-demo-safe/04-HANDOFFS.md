# Phase 4 Hand-offs

## HO-10: Core server routing for session speech output

**Owner:** Core (Pranav) for the server hub; voice owns the NVDA adapter in `apps/server/src/voice/`.
**Needed before:** Voice Phase 4 Plan 04-01's end-to-end NVDA tracer can run.
**Status:** Required hand-off; not implemented or accepted by this planning artifact.

Core's server hub owns `apps/server/src/server.ts`, including the current no-op `settings` handler. Implement the core-owned routing seam so the existing `SettingsPayload.outputMode` is stored per voice session and server-issued speech goes through exactly one route. The voice-owned NVDA adapter provides the local native speech operation; browser agent voice remains the default. Cancel and settle the prior route before sending the next item through the selected route. Keep the existing protocol schema and do not enable `both` in the UI.

The server must retain each server-issued `speakId` until an actual NVDA completion or cancellation signal reaches the existing GATE-08 completion state exactly once. A return value that only confirms the DLL call was accepted is not completion. Report NVDA unavailability through an existing status/error message so voice can announce it once and fall back to agent voice. Preserve the existing one-second post-speech guard. Add core-owned routing tests in the core track; voice tests exercise the adapter and agreed interface without editing core-owned files.

This hand-off does not authorize voice to modify the core server hub. Any protocol change requires both workstream owners' agreement under `CLAUDE.md` and `docs/WORK-SPLIT.md`.

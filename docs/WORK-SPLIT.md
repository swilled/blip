# Work split: who builds what, and when you wait on each other

Each person works through their own workstream roadmap (`workstreams/core/ROADMAP.md`, `workstreams/voice/ROADMAP.md`). This file breaks those phases into **work packages** you can each take on alone, and lists the **hand-offs** where one of you has to deliver something before the other can use the real thing.

**The rule when you're blocked:** if a hand-off is more than 30 minutes late, switch to the stub named below, tell the other person in the status line, and keep going. Don't sit idle.

## Core (Pranav)

| # | Work package | Roadmap phase | Starts | Needs from voice | Stub until then | Done when |
|---|--------------|---------------|--------|------------------|-----------------|-----------|
| C1 | Protocol: zod schemas, fixtures, `PROTOCOL.md` | core P1 | h0 | Sign-off at M0 (h0.75) | — | Frozen at M0 |
| C2 | Loopback server hub, Origin check, role routing | core P1 | h0.75 | — | — | Voice UI connects as `role=voice` |
| C3 | Fake extension, fake brain, REPL | core P1 | h0.75 | — | — | "what's here" answers offline |
| C4 | Extension: DOM snapshot, fills, keepalive | core P2 | h2.5 | — | Fixture snapshots from `fixtures/` | Live form read and filled, values verified |
| C5 | Action kinds (fail-closed rules) | core P2 | h3 | — | — | Every control classified; gated kinds refused |
| C6 | Policy gate, Executor, grants, audit log | core P3 | h8 | Phrase-match rules (voice reviews) | — | Adversarial tests pass in `packages/policy` |
| C7 | Result reading (RES-01/02) | core P3 | h10 | Speech templates (voice) | Plain text reply | Result page read back |
| C8 | AGY Gemini brain: `parseIntent`, generated no-tools agents | core P4 | h12 | Intent handling in the reducer | `--brain=fake` | Starts only with the expected isolated agent; intents valid |
| C9 | Label repair, cache | core P4 | h14 | `labelSource` display (voice) | Baseline labels only | Broken-form labels repaired in background |
| C10 | Injection defense, `injection.html`, real-site fixes | core P5 | h17 | Injection warning text | Flag only, no speech | Seeded page blocked and flagged |
| C11 | One-command startup, `demo-safe` tag, plan-B mode | core P5 | h22 | Demo script | Manual startup | One command works on both machines |

## Voice (teammate)

| # | Work package | Roadmap phase | Starts | Needs from core | Stub until then | Done when |
|---|--------------|---------------|--------|-----------------|-----------------|-----------|
| V1 | Risk spikes: Web Speech, NVDA DLL, push-to-talk, ARIA | voice P1 | h0 | — | — | Decisions written down by h3 |
| V2 | Voice UI shell: PTT, STT, TTS, transcript | voice P1 | h0.75 | M0 protocol | `apps/voice-ui/dev/mock-server.ts` | Works against the mock |
| V3 | Switch UI to the real hub | voice P1 | h6 (I1) | C2 hub, C3 fake extension | Mock server | "what's here" end to end |
| V4 | Pure dialogue reducer: grammar, templates | voice P2 | h5 | Fixtures from C1 | Fixture form model | Reducer tests pass with fixtures |
| V5 | Broken survey form, reset script, demo profile | voice P2 | h2 (idle time) | — | — | Reset restores form and profile |
| V6 | Read-back, confirm states, BLOCKED banner, earcons | voice P2 | h8 | C6 gate events | Fake executor that always replies "blocked" | Bare "yes" refused; phrase path tested |
| V7 | Profile fill, spell, change, undo (grammar side) | voice P3 | h12 | C4 fill actions | Fake fills | Each command works on the fake extension |
| V8 | Guessed-label and injection warnings (speech) | voice P3 | h12 | C9 `labelSource`, C10 flags | Fixture flags | Warning spoken from fixture flag |
| V9 | Public demo form, sensitive-field handoff | voice P3 | h12 | C8 for real AGY Gemini | Fixture form | Form exists by h12 for core to test |
| V10 | NVDA screen-reader mode | voice P4 | h16 | — | Agent-voice mode only | Speech through NVDA, no double speech |
| V11 | Rate control, real-form rehearsals, fallback kit, backup video | voice P4 | h20 | C11 startup, C7 result reading | Manual start | 3 clean runs; video by h36 |

## Hand-offs (who gives what, and when)

| When | From → to | What | Receiver's stub |
|------|-----------|------|-----------------|
| ~h0.75 | core → voice | Protocol frozen (C1) | Voice reviews and signs off |
| ~h2.5 | core → voice | Hub and fakes running (C2, C3) | `dev/mock-server` |
| ~h5 | voice → core | Fixture form models for the reducer (V4) | Core's own fixtures |
| ~h6–8 | core → voice (I1) | Real extension snapshot and fill (C4) | Fake extension |
| ~h8 | voice → core | Phrase-match rules and BLOCKED wording (V6) | Core's rules from the roadmap |
| ~h12 (I2) | core → voice | Gate and Executor (C6), result reading (C7) | Fake executor, plain-text result |
| ~h12 | voice → core | Public demo form created and shared (V9) | Core's own test pages |
| ~h12–14 | core → voice | AGY Gemini brain (C8) | `--brain=fake` |
| ~h17 (I3) | core → voice | Label repair (C9), injection flags (C10) | Fixture flags |
| ~h20 | core → voice | One-command startup (C11) | Manual start |
| ~h30 (Freeze) | both | Demo script agreed, `demo-safe` tagged | — |

## Rules for independent work

- **Branch per package:** `core/c4-extension-snapshot`, `voice/v4-reducer`. Each package is one PR.
- **Post at each hand-off:** what's merged, what's still stubbed, and when the real piece will land.
- **Don't reimplement the other side's piece.** If you need something from the other track, use its stub and ask for the real piece. Duplicating it creates two versions to keep in sync.
- **Protocol changes** after M0 are additive and optional, agreed in a PR before code uses them.
- **Safety stubs must fail closed.** The fake executor blocks everything. Never stub a gate open.

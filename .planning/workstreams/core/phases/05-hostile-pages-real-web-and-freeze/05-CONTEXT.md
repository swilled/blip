# Phase 5: Hostile Pages, Real Web and Freeze - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning
**Mode:** Auto-selected defaults per the user's instruction to use best judgment on the core track

<domain>
## Phase Boundary

Harden the core against seeded page prompt injection, carry a deterministic warning for text addressed to Blip or AI agents, support the team's selected real public form, provide one-command local demo startup, and freeze a demo-ready build with `--brain=fake` as the fallback. This phase keeps the existing default-deny submit authorization, the voice workstream's ownership of its UI and demo form, and the Phase 4 dependency.

</domain>

<decisions>
## Implementation Decisions

### Injection fixture and trust boundary
- **D-01 (auto-selected):** Core owns `tools/test-pages/public/injection.html`, as reserved by Phase 2 decision D-11. Keep the fixture self-contained and synthetic; include hidden instructions, a fake “verified” banner, text asking Blip to click `#pay`, and a lookalike submit button.
- **D-02 (auto-selected):** Page content is untrusted data. Detection and warnings must not grant authority, alter deterministic action kinds, or bypass the Phase 3 Executor and extension guard. Gated attempts remain blocked and auditable.
- **D-03 (clarified):** GATE-07 is a deterministic signal carried only as an optional warning boolean on accepted page state so the voice side can speak its existing DLG-14 warning. Do not put the signal in `FormModel`, model input/prompt projections, or any model-facing representation. The core REPL/test harness may expose the accepted state boolean for integration checks; the voice workstream remains responsible for speech and UI.

### Real public form dependency
- **D-04 (auto-selected):** Use the voice/team-selected, team-owned public form, expected to be Google Forms. Do not substitute an arbitrary public form or a form that records real personal data. Use only fixed, synthetic, non-sensitive values for testing.
- **D-05 (auto-selected):** Keep local widget coverage and code work moving without the public URL. If the team-owned target is still unavailable at execution, record the real-site end-to-end criterion as pending and ask for the target before interacting with an external form.

### Local demo startup and freeze
- **D-06 (auto-selected):** Reuse the existing browser resolver and dedicated profile approach. Do not use the user's regular browser profile. The extension is loaded unpacked once into that profile; keep startup compatible with branded Chrome versions that ignore `--load-extension`.
- **D-07 (auto-selected):** One command should start the core server, open the dedicated browser at the seeded/local demo page, and launch the voice client when its executable or URL is available. The voice UI is voice-owned; core should add only a narrow launch hook and document the missing integration rather than create a replacement UI.
- **D-08 (clarified):** Freeze only after local automated checks and the fake-brain demo path pass. The local `demo-safe` tag must point to the accepted freeze commit on `main`; create it only if absent, and never move an existing tag or push/publish it.

### the agent's Discretion
- Detection heuristics, protocol representation for the GATE-07 signal, audit assertions, script flags, readiness checks, and the exact test matrix, provided they preserve the frozen protocol's additive compatibility and the safety decisions above.
- If the voice app is not present in this checkout, choose the smallest documented configuration hook that allows the teammate's voice client to be launched once its location is supplied.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase goals and requirements
- `.planning/workstreams/core/ROADMAP.md` § Phase 5 and I3/Freeze milestones — scope and success criteria.
- `.planning/workstreams/core/REQUIREMENTS.md` — GATE-06, GATE-07, PROT-03, and the DEMO-03 cross-track dependency.
- `.planning/PROJECT.md` — core value, trust boundary, two-workstream ownership, voice-app intent, and local subscription constraints.

### Frozen safety and protocol contracts
- `PROTOCOL.md` — WebSocket message and snapshot/form-model contract.
- `packages/protocol/src/snapshot.ts` — accepted page snapshot text and element data.
- `packages/protocol/src/form-model.ts` — current model fields and additive extension constraints.
- `.planning/workstreams/core/phases/03-gated-submit-and-result-reading/03-CONTEXT.md` — default-deny action policy, deterministic grants, and the extension re-check.
- `.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-CONTEXT.md` — tool-less structured output, sensitive data boundary, and model output limitations.

### Fixtures and browser startup
- `.planning/workstreams/core/phases/02-real-page-read-and-fill/02-CONTEXT.md` § D-11 — core test-page ownership and the Phase 5 `injection.html` reservation.
- `.planning/workstreams/core/phases/02-real-page-read-and-fill/02-RESEARCH.md` — existing loopback fixture server, browser resolver, extension identity, and dedicated profile pattern; re-verify time-sensitive Chrome behavior before relying on it.
- `tools/test-pages/serve.ts` — loopback-only static test-page server and report API.
- `scripts/browser.ts` and `scripts/ext-chrome.ts` — browser discovery and dedicated-profile launch patterns.
- `scripts/dev.ts` — existing server startup and fake-extension options.
- `apps/extension/test/e2e/` — reusable end-to-end harness and gated-flow coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tools/test-pages/public/` already has local synthetic forms, including a React-controlled form and submit-guard fixtures; the test-page server listens only on loopback and records bounded JSON reports.
- `scripts/browser.ts` resolves Chrome/Edge, while `scripts/ext-chrome.ts` already creates a dedicated browser profile and opens local fixtures.
- The extension E2E harness in `apps/extension/test/e2e/` can exercise the actual extension and the deterministic gated-action path.
- Server snapshots, accepted page state, and `FormModel` are typed in `packages/protocol`; GATE-07 belongs only on accepted page state, never in `FormModel` or model-facing projections. The REPL and server tests can verify the state boolean without depending on voice speech.

### Established Patterns
- Use schema validation at protocol boundaries and keep action risk classification in deterministic core code.
- Page text is untrusted; model results remain data and every gated action must pass both the server Executor and extension guard.
- Test pages run on loopback; the user's normal browser profile is not reused by launch scripts.

### Integration Points
- GATE-06 fixture content is served by `tools/test-pages` and observed by the extension snapshot/server path.
- GATE-07 needs a typed, additive optional boolean from accepted page text through server page state to the voice client; never expose it to `FormModel` or the model. Voice owns speaking the DLG-14 warning.
- PROT-03 composes `scripts/dev.ts`, the dedicated browser launcher, and the voice-owned local client when its launch target exists. This checkout currently contains `apps/extension` and `apps/server`, but no `apps/voice` directory.

</code_context>

<specifics>
## Specific Ideas

- Make injection attempts visible in deterministic audit evidence while proving they cannot request or authorize a gated action.
- Preserve the real form as a team-owned target selected by voice; use synthetic values and leave external form interaction pending until that target is known.
- Keep `--brain=fake` usable for a full local demo rehearsal even if live Claude is unavailable.

</specifics>

<deferred>
## Deferred Ideas

No new capability was added. Real public-form automation remains scoped to the existing Phase 5 criterion; the exact team-owned URL is a cross-track input, not a substitute target to invent.

</deferred>

---

*Phase: 05-hostile-pages-real-web-and-freeze*
*Context gathered: 2026-10-17 via auto-selected defaults*

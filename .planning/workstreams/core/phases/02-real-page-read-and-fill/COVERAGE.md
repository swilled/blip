No remote service or third-party API is integrated in Phase 2: the extension uses Chrome MV3 platform APIs (runtime, tabs, scripting, alarms, storage, webNavigation, dom), the existing loopback server, and local test pages. The only new packages are esbuild, jsdom, @types/chrome, react and react-dom, gated by the blocking-human checkpoint in plan 02-01.

# Phase 2 multi-source coverage audit

Plans: 02-01 extension foundation and service-worker connectivity (wave 1), 02-02 server freshness and classification rules (wave 1), 02-03 extension read path (wave 2), 02-04 developer rig: REPL act path, test pages, launcher (wave 2), 02-05 fills, overlay, refusals, change detection (wave 3), 02-06 verification matrix, I1, manual checklist (wave 4).

Lanes (no `files_modified` overlap inside a wave): lane A (extension) 02-01, 02-03, 02-05, 02-06; lane B (server, policy, rig) 02-02, 02-04. Wave 1: 02-01 and 02-02 in parallel. Wave 2: 02-03 and 02-04 in parallel.

```
SOURCE   | ID       | Feature/Requirement                                              | Plan        | Status  | Notes
-------- | -------- | ---------------------------------------------------------------- | ----------- | ------- | -----
GOAL     | -        | Real page read and fill, only the value the page holds           | 02-01..06   | COVERED |
REQ      | PAGE-01  | Content-script snapshot: names, roles, values, required, options | 02-03, 02-06| COVERED | "about 8k tokens" is applied at the Phase 4 prompt boundary per D-20/F10; Phase 2 sets truncated at the wire caps
REQ      | PAGE-03  | Fail-closed kind for every actionable element                     | 02-02, 02-03, 02-05, 02-06 | COVERED | rules (02-02), wiring (02-03), live refusal (02-05), real pages (02-06)
REQ      | PAGE-05  | Model follows page changes within about 1 s                       | 02-01, 02-02, 02-05, 02-06 | COVERED | keepalive (02-01), server refresh (02-02), signals (02-05), idle test (02-06)
REQ      | ACT-01   | React/Vue-safe typing, never Enter                                | 02-04, 02-05, 02-06 | COVERED |
REQ      | ACT-02   | Select, radio, checkbox                                           | 02-04, 02-05, 02-06 | COVERED |
REQ      | ACT-03   | Active field visibly highlighted                                  | 02-05, 02-06 | COVERED | CSP visibility is manual row M12
REQ      | ACT-04   | Read the DOM value back after every fill                          | 02-04, 02-05, 02-06 | COVERED |
RESEARCH | F1       | Server act path, brain phrases, dev flag                          | 02-04       | COVERED |
RESEARCH | F2       | maxlength clamp, truncated detail                                 | 02-05, 02-04 | COVERED |
RESEARCH | F3       | Synthetic focus/blur when page not OS-focused                     | 02-05       | COVERED |
RESEARCH | F4       | visible semantics (rendered, never viewport)                      | 02-03       | COVERED |
RESEARCH | F5       | No server debounce, post-act refresh, age-based re-snapshot       | 02-02, 02-04 | COVERED |
RESEARCH | F6       | Server trusts RawElement.kind; shared field-kind mapping          | 02-02       | COVERED |
RESEARCH | F7       | exclude_matches, match_about_blank, match_origin_as_fallback      | 02-01       | COVERED |
RESEARCH | F8       | Target-tab selection (Blip's own page excluded)                   | 02-03, 02-05 | COVERED |
RESEARCH | F9       | Qualified ids f<frameId>e<N>                                      | 02-03       | COVERED |
RESEARCH | F10      | 8k-token wording vs D-20                                          | 02-03       | COVERED | follows D-20
RESEARCH | F11      | Chrome not installed, BLIP_BROWSER and Edge fallback              | 02-01, 02-04 | COVERED |
RESEARCH | F12      | D-04 spike shrinks to a confirmation                              | 02-05       | COVERED | first task of the act lane, with a stop-and-report guard
RESEARCH | -        | Zod-free content bundle (Pitfall 3), size gate                    | 02-01, 02-02, 02-03 | COVERED |
RESEARCH | -        | Pure socket policy, alarm, dead-peer, replaced block (Pattern 6)   | 02-01       | COVERED |
RESEARCH | -        | Reload re-injection and idempotent content script (Pattern 8)     | 02-01       | COVERED | manual row M10 confirms
RESEARCH | -        | Frame fan-out, versions, fingerprint history (Pattern 4/5)        | 02-03, 02-05 | COVERED |
RESEARCH | -        | Validation architecture, jsdom limits, e2e smoke without Playwright | 02-01, 02-03, 02-05, 02-06 | COVERED |
RESEARCH | -        | Manual checklist M1-M16 (+ I1, Chrome repeat)                     | 02-06       | COVERED | M13 is automated at the hub because the server never sends click
RESEARCH | S1-S11   | Security domain threats                                           | all plans   | COVERED | see each plan's threat model
CONTEXT  | D-01     | Content-script DOM walk, no debugger (costly)                     | 02-01, 02-03 | COVERED |
CONTEXT  | D-02     | Fill recipe                                                       | 02-05       | COVERED |
CONTEXT  | D-03     | Verify-after-write                                                | 02-05       | COVERED |
CONTEXT  | D-04     | CDP only as fallback; React spike first                           | 02-05       | COVERED | guard: stop and report, do not build CDP
CONTEXT  | D-05     | classifyAction pure in policy                                     | 02-02       | COVERED |
CONTEXT  | D-06     | Extension refuses gated clicks, kind-mismatch                     | 02-05, 02-06 | COVERED |
CONTEXT  | D-07     | Sensitive fields classified in the extension                      | 02-03, 02-04, 02-05 | COVERED |
CONTEXT  | D-08     | Plain esbuild, hand-written manifest, pinned key                  | 02-01       | COVERED |
CONTEXT  | D-09     | Manifest permissions                                              | 02-01       | COVERED |
CONTEXT  | D-10     | Dev loop: ext:build, ext:watch, ext:chrome, .chrome-profile       | 02-01, 02-04 | COVERED |
CONTEXT  | D-11     | Core-owned test pages and server                                  | 02-04       | COVERED |
CONTEXT  | D-12     | Socket, hello, ping/pong, backoff, alarm                          | 02-01       | COVERED |
CONTEXT  | D-13     | MutationObserver, structural vs change signature                  | 02-03, 02-05 | COVERED |
CONTEXT  | D-14     | Navigation signals                                                | 02-05       | COVERED |
CONTEXT  | D-15     | Server issues snapshot.request; newSnapshotVersion after acts     | 02-02, 02-04, 02-05 | COVERED |
CONTEXT  | D-16     | Monotonic per-tab version; stale only when target changed         | 02-02, 02-03, 02-05 | COVERED |
CONTEXT  | D-17     | Coverage: inputs, radio groups, shadow DOM, iframes               | 02-03, 02-05, 02-06 | COVERED | cross-origin frames time-boxed with documented fallback
CONTEXT  | D-18     | Unsupported widgets appear and refuse with detail                 | 02-03, 02-05 | COVERED |
CONTEXT  | D-19     | Highlight overlay                                                 | 02-05       | COVERED |
CONTEXT  | D-20     | Wire caps, truncated, hidden elements with visible false          | 02-03       | COVERED |
CONTEXT  | A-01     | Server act path, phrases, --no-fake-extension                     | 02-04       | COVERED |
CONTEXT  | A-02     | maxlength clamp                                                   | 02-05       | COVERED |
CONTEXT  | A-03     | Synthetic focus/blur                                              | 02-05       | COVERED |
CONTEXT  | A-04     | visible semantics                                                 | 02-03       | COVERED |
CONTEXT  | A-05     | No server debounce; always re-snapshot after act; age rule        | 02-02, 02-04 | COVERED |
CONTEXT  | A-06     | Zod-free classify module with parity test                         | 02-01, 02-02 | COVERED |
CONTEXT  | A-07     | vitest + jsdom 29.1.1, ws smoke, no Playwright; gated installs    | 02-01       | COVERED |
CONTEXT  | A-08     | BLIP_BROWSER and Edge fallback                                    | 02-01, 02-04 | COVERED |
```

Exclusions (not gaps): CDP accessibility-tree snapshot and Input.insertText fill, custom ARIA combobox/listbox filling, contenteditable, file uploads, cross-origin iframe support beyond best effort, model-prompt token trimming (Phase 4), one-command startup and the injection page (Phase 5), and updating CLAUDE.md's stack table (needs both developers) are Deferred Ideas in 02-CONTEXT.md. The policy gate, Executor, grants and gated clicks are Phase 3.

Open items for the orchestrator: the M0 approval line in PROTOCOL.md remains `pending` and is not touched by any Phase 2 plan; typed failure codes `unsupported-page`, `no-target-tab`, `no-content`, `invalid-snapshot` and `not-ready` are new names in an open string field and are not added to PROTOCOL.md without the voice developer's agreement; whether Next, Continue and Save should ever be ungated click-safe kinds is a product decision (research assumption A8) that stays closed.

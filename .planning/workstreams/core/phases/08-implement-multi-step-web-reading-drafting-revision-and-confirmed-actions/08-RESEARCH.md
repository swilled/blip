# Phase 08: Multi-Step Web Reading and Drafting - Research

**Researched:** 2026-10-18  
**Domain:** Bounded browser content tasks, draft state, and deterministic voice confirmation  
**Confidence:** HIGH for repository patterns and constraints; MEDIUM for generic page-item resolution

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Multi-step content tasks
- **D-01:** Treat the user's email example as a generic workflow: open a user-named site, identify requested visible content, read it, summarize on request, draft, revise, read back, and offer a final action. Do not hardcode Gmail, email labels, or one service's DOM.
- **D-02:** Use visible current-page items and user intent to resolve “latest” or similar references. If there are multiple plausible items or recency cannot be established from the page, ask the user to choose. Page text and AGY output cannot select hidden or stale targets.
- **D-03:** Direct reads are bounded and local. A request to summarize, answer a page question, or draft a response is explicit permission to send only the necessary bounded, filtered excerpt to tool-less AGY. Never send credentials, passwords, payment values, or unrequested page content.
- **D-04:** A draft is proposed text, not an action. Keep the draft tied to the source page/thread, recipient/target, and active session. User edits revise the same draft. Re-read the actual current draft field before presenting the updated version.
- **D-05:** Never send automatically after drafting or revision. Read the final draft back, then ask the user to say the exact phrase for that specific action, such as “send this email.” A yes/no question followed by “yes” is not authorization.

### Consequential-action confirmation
- **D-06:** Important actions use a deterministic exact spoken phrase suited to the operation and visible target. Ask for that phrase directly, such as “Can you say ‘send this email’?” for sending a message. A bare “yes” is never enough, even after a prompt. Page text and model output cannot choose or rewrite the confirmation phrase.
- **D-07:** The send phrase redeems one purpose-bound, one-use grant only after the full final-draft read-back completes and the existing confirmation guard has elapsed. Bind it to the exact draft hash, visible recipient/target, source page/thread identity, tab, operation, and tracked `speakId`.
- **D-08:** Stop, cancel, repeat, timeout, page/tab change, draft edit, recipient change, or changed confirmation target clears the pending send grant. Re-read and re-arm after any change.
- **D-09:** Report sent/success only after the current page provides a validated confirmation. A click or successful dispatch alone is not proof.
- **D-10:** The model may compose and revise proposed text from an explicitly requested bounded excerpt, but it cannot choose the recipient, confirmation phrase, authorize send, mint grants, or trigger page actions. The deterministic Executor controls every write and send.

### Test and integration scope
- **D-11:** Use synthetic, email-like and generic content fixtures for end-to-end acceptance. Do not use a real Gmail login, personal mailbox, or private user content in tests.
- **D-12:** Preserve the current voice output contract and do not edit voice-owned implementation files. Core may implement protocol/server/extension support locally; shared protocol or policy changes need written voice-owner review before merge.
- **D-13:** Add deterministic context-specific phrases to the existing exact-phrase vocabulary. Existing submit/result semantics, one-second guard, tracked speech, the bare-yes prohibition, and single Executor remain in force.
- **D-14:** Acceptance tests must show that a bare “yes” or other general affirmation is rejected even immediately after the exact-phrase prompt. Only the matching context-specific spoken phrase may redeem its bound one-use grant after read-back and the guard; wrong, stale, or mismatched phrases must not dispatch.

### the agent's Discretion
- Implement a bounded task/session state machine with explicit user-visible next steps and a clear cancel path.
- Keep model context as small as possible and retain only the minimum source excerpt and draft state needed for an active task.
- Require clarification when the source item, recipient, or draft target is ambiguous.
- Do not introduce autonomous open-ended browsing; each page action must have a typed, user-derived request and pass through the current safety policy.

### Deferred Ideas (OUT OF SCOPE)
- Real mailbox integration, account credentials, personal content, and Gmail-specific DOM adapters are out of scope.
- Editing voice-owned UI/reducer files requires the voice owner to implement or explicitly take that work; Phase 8 keeps core to its own protocol/server/extension ownership.
- Shared requirements and PROJECT changes remain subject to cross-track agreement.
</user_constraints>

## Summary

Phase 7 already supplies generic user-directed browser capture, explicit-only filtered summaries/questions, active page identity, and deterministic extension actions. Keep Phase 8 as a server-owned, per-session task layered over those primitives: resolve a visible current item deterministically, retain only its bounded safe excerpt and a draft binding, use the tool-less content role only for explicit composition/revision, and write through the current supported form-field path. Always read the actual field value back before speaking it.

The existing gate is reusable for lifecycle, tracked speech, cooldown, one-use consumption, and the single Executor, but its send phrase is currently the global `confirm sending`. Phase 8 needs deterministic operation-specific phrase handling (for example, `send this email`) and a stronger task binding that explicitly covers draft hash, recipient/target, source page/thread identity, tab, operation, and `speakId`. Do not use a general affirmation as a shortcut. Written voice-owner review is still absent for shared protocol/policy changes; the exact-phrase vocabulary work must honor that gate.

**Primary recommendation:** add one bounded draft-task state to `Session`; reuse current capture, form writes, tracked `speak.done`, one-second guard, GrantStore/GatePort/Executor, and post-action fresh-page validation. Keep source/draft prompts separate from ordinary value-free intent routing. Clarify when item, recipient, supported field, or recency cannot be established from current visible page state.

## Standard Stack

No new runtime or package is indicated by the repository. Use the existing TypeScript/npm workspace, Zod contracts, and Vitest fixtures; do not add a site SDK or browser-agent framework.

| Existing component | Version observed | Phase 8 use | Confidence |
|---|---:|---|---|
| Node.js | 24.14.0 | Server and test runtime (`package.json` requires >=24) | HIGH, local runtime |
| TypeScript | 6.0.3 | Server/extension/protocol types | HIGH, installed workspace version |
| Zod | 4.6.7 | Closed request/result and model-output validation | HIGH, installed workspace version |
| Vitest | 5.0.5 | Synthetic unit/integration acceptance | HIGH, installed workspace version |
| Antigravity CLI | 1.4.2 | Optional live tool-less composition smoke; use fakes for deterministic tests | HIGH, local CLI version |

**Installation:** None. Add no packages unless implementation uncovers a concrete gap.

## Project Constraints (from CLAUDE.md)

- Keep the TypeScript/npm-workspace stack and local server + thin Chrome extension architecture.
- Page content is untrusted data. AGY roles remain tool-less and isolated; model output is validated data, never action authority. All page writes/sends stay in deterministic core and the Executor.
- Passwords and card numbers are never spoken, logged, or sent to the model. Keep ordinary intent projections value-free; only an explicit content request may send its minimum bounded, filtered excerpt.
- Core owns `packages/protocol`, `packages/policy`, `apps/server` core, and `apps/extension`; voice owns `packages/dialogue`, `apps/voice`, and `apps/server/src/voice`. Phase 8 keeps voice-owned implementation unchanged.
- `packages/protocol` is shared and needs both owners' sign-off. Do not weaken safety invariants or merge protocol/live-policy changes without the required written voice-owner review. Shared PROJECT/requirements changes need cross-track agreement.
- Never enable AGY tools or `--dangerously-skip-permissions`; strip API-key environment variables and reject unexpected tool calls.
- Before repository edits, use the GSD workflow. This research was launched under the parent phase-planning workflow.

No `AGENTS.md` or project skill directories were found; CLAUDE.md reports no project skills.

## Architecture Patterns

### Recommended Project Structure

```text
apps/server/src/session/session.ts          # one ephemeral active task, tied to voice session
apps/server/src/turn.ts                     # user-derived task commands and invalidation
apps/server/src/brain/agy/content-projection.ts # explicit bounded draft/edit projection
apps/server/src/act/gated.ts, grants.ts     # tracked read-back and one-use authorization
apps/extension/src/content/browser-content.ts # current visible page text and identity
apps/extension/src/content/act.ts, fill.ts  # supported field writes and observed values
tools/test-pages/                            # local generic/email-like task fixture
```

### Pattern 1: Explicit page content stays separate from ordinary intent

**What:** Direct reading uses the local bounded capture. Summary, page question, or draft/revision can use a separately typed, filtered projection after an explicit request. Current `projectExplicitPageContentRequest` checks capture identity, caps context at 20 blocks / 4,000 code points, removes sensitive/action-instruction blocks, and omits page URL and target IDs from the AGY prompt. `AgyProvider` returns schema-checked prose only from a tool-less `content` role.

**When to use:** Only for a user-requested summary/question/draft/edit. Direct reads and unrelated turns should not initialize/call the content role.

**Phase 8 adaptation:** Add a distinct draft/revision request and bounded draft output; include only the selected safe excerpt, current draft when revising, and the user's explicit edit instruction. Do not add recipients, target IDs, action kinds, phrases, or browser commands to model output. Deterministic code owns recipient, field, and send action resolution.

**Verified source:** `apps/server/src/brain/agy/content-projection.ts`, `provider.ts`, `turn.ts`; `apps/server/src/browser/content.test.ts`.

### Pattern 2: Draft edits use observed field state

**What:** Current form actions resolve a field from the accepted FormModel, dispatch a typed fill through the extension, screen the result, and return `ActResult.observedValue`. `fillText` supports native text inputs and textareas; it emits input/change, blurs, and waits for settling. The background re-captures after an action before returning an observation.

**When to use:** Drafting into an existing supported page field, then editing that same field. After each write or edit, refresh/accept current page state and read back the DOM's actual value. Never present the model's proposed string as if it were the current draft.

**Limits:** Phase 7 content capture reads visible top-frame headings and paragraphs (`h1`–`h6`, `p`), not arbitrary inbox/list text; it skips forms, textareas, contenteditable regions, hidden elements, and nested frames. The form action path supports native input/textarea fields; unsupported custom editors must fail closed or be left to the user.

### Pattern 3: Reuse tracked, single-use action confirmation

**What:** The existing gate speaks a tracked read-back, waits for `speak.done`, applies the one-second cooldown, arms a 30-second one-use grant, refreshes/revalidates the page, consumes before dispatch, and reports success only from a fresh result snapshot. `confirm.armed` already carries a server-supplied phrase; the voice reducer compares the utterance against that exact token sequence and the voice output bridge reports speech completion. Keep those voice files read-only.

**Phase 8 binding:** Extend the server-side send authorization binding to include the draft SHA-256, visible recipient/action target, source item/page identity (capture/thread), tab, operation, and tracked `speakId`. Hash/bind without putting draft or recipient values in logs. Clear it on all D-08 events. The existing grant fingerprint includes current non-sensitive form values, but its current public binding does not explicitly express capture/thread identity or the Phase 8 draft hash; make those bindings explicit.

**Phrase rule:** Use a deterministic operation/task vocabulary. Choose the phrase from the user-derived task type and supported action, never from page text or AGY. Read it aloud as a direct request (“Can you say ‘send this email’?”). The actual recipient and draft are separately read back and bound into the grant. The current policy phrase for all `send` actions is only `confirm sending`; context-specific matching therefore needs reviewed core/policy work before completion. Do not fall back to a general “yes.”

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Browser page/capture identity | A second tab tracker or reusable global content IDs | `Session.browserCapture`, `BrowserPageIdentity`, `createBrowserExecutor`, existing navigation listeners | Existing system invalidates capture references on page/tab/session changes. |
| Form writes | A new site-specific composer adapter or direct DOM write from server | Existing typed `act.request` / `fill` path and observed result | The extension revalidates live targets, screens values, and verifies the DOM result. |
| Model-driven web actions | Agent tools, generated URLs/recipients, or model-authorized sends | Tool-less content output + deterministic command parser, policy, and Executor | Page text and model prose are untrusted; Intent deliberately has no confirm variant. |
| Confirmation | A second voice reducer or a generic yes/no branch | Existing tracked `speakId`, cooldown, GrantStore, GatePort, and one-use consumption | Preserves the established core authority boundary and guard semantics. |
| Success reporting | Treating a click/dispatch as “sent” | Fresh page snapshot plus validated result interpretation | A successful dispatch is not proof that the page completed the action. |

## Common Pitfalls

### “Latest” without visible evidence

The current capture contract has only heading/paragraph blocks and no record grouping or timestamp field. Do not infer a hidden/stale item or let AGY choose one. Resolve only from uniquely attributable current visible evidence; ask the user when record identity or recency is ambiguous. If acceptance must pick the latest item from a visible list, planning must include a generic bounded item identity/recency capture (no service-specific selectors) and a reviewed additive-contract path.

### Draft proposal mistaken for current page state

AGY output is proposed text. A max-length clamp, page script, or failed write can change/refuse it. Verify the current draft from `ActResult.observedValue` and/or a fresh accepted snapshot after every write/edit; read that value back. Re-read and re-arm after recipient, target, page, or draft changes.

### General affirmation accepted after the phrase prompt

The existing phrase matcher currently maps `send` to `confirm sending`; it must not accept `yes`, `okay`, or another affirmation as a substitute for the Phase 8 phrase. Add immediate-next-utterance regressions for bare yes and other affirmations, plus wrong-operation/wrong-task phrases. Assert zero extension dispatches and a cleared grant. Only the matching voice-originated phrase after completed full read-back and guard may consume once.

### Phrase or recipient selected by untrusted content

Page labels, body text, and model output cannot pick the confirmation phrase, recipient, or target. Keep phrase selection deterministic from the user's task type and action vocabulary; resolve the actual recipient/target against the current page in local code and bind it independently.

### Dispatch reported as success

Use the current post-action refresh/result interpretation. If no validated current-page confirmation appears, report that the outcome could not be verified; do not claim it was sent.

### Shared change before review

Phase 7 verification still records same-origin, `click-safe` visible-link opening as intentionally narrower than general link opening, pending written voice-owner review. Do not broaden link policy to make the workflow work. The Phase 6 written approval artifact is absent. Any new shared protocol or policy change for item identity or phrase vocabulary is a hard review dependency; keep the protocol/policy unchanged until the exact written review exists. Named-site navigation and the synthetic task page can exercise the core flow under the current policy.

## Phase 8 Acceptance Evidence

Use the local synthetic fixture and fake extension/model seams; no real login, mailbox, private content, or live AGY call is needed for deterministic acceptance.

| Case | Evidence required |
|---|---|
| Generic item and recency | A unique visible item can be read; two plausible candidates or missing visible recency asks the user to choose. Hidden/stale content and page instructions never create a target. |
| Content privacy | Direct read makes no AGY call. Explicit summary/draft sends only the selected bounded filtered excerpt and explicit request; credential/password/payment-shaped text is absent. Ordinary intent projection remains value-free. |
| Draft and edit | A tool-less fake returns proposed text only. The server writes to the user/page-derived current field; tests compare proposal with observed DOM value, then revise the same field from an explicit user edit and read back actual value. No send occurs during draft/revision. |
| Confirmation | After final draft and recipient read-back, only the exact task-specific phrase after completed tracked speech and the one-second guard consumes the grant. Bare `yes`, `okay`, `yeah`, wrong phrase, typed input, early phrase, or phrase from another task yields zero dispatch, including when sent immediately after the prompt. |
| Binding/invalidation | Mutate draft, recipient, action target, source identity, URL, tab, session, or speech ID; exercise stop/cancel/repeat/timeout/interruption. Every mismatch clears/invalidates the grant and asserts zero dispatch. Matching phrase dispatches at most once. |
| Result | Simulate a fresh validated confirmation and a missing/ambiguous result. Say “sent” only for the validated success; dispatch alone and stale result never produce success. |
| Injection and model boundary | Seed visible/hidden instructions telling Blip to change target, recipient, phrase, or send. Tool-less output cannot create any of these or call the Executor. |

Existing focused test pattern: `npm test -- --run apps/server/src/browser/acceptance.test.ts apps/server/src/browser/content.test.ts apps/server/src/browser/authorization.test.ts` plus new Phase 8 task/gate acceptance tests. Phase 7's 17-case local fixture and tests are reusable regression coverage; the remaining link breadth limitation stays in force.

## Open Questions

1. **How are current visible “items” grouped and ordered?** Phase 7 exposes bounded headings/paragraphs, not message/list record identity or dates. Recommendation: for the first vertical slice, support only uniquely attributable visible text and explicitly ask on ambiguity; if “latest” selection is a required must-have, add a generic semantic-item capture and review its additive contract before shared edits.
2. **Which deterministic phrase maps to each supported send task?** Current `send` has one generic phrase, while Phase 8 requires operation/target-specific wording. Recommendation: define a small explicit vocabulary keyed by user-derived task/operation, such as “send this email” for an explicitly requested email-like task; if a task has no approved phrase mapping, clarify/refuse. Bind recipient and target separately; never derive phrase from page/model text. Written voice-owner review is required before changing shared phrase policy.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---:|---:|---|
| Node.js / npm | Server and tests | Yes | Node 24.14.0 / npm 11.9 | — |
| Vitest / Zod | Automated acceptance and schemas | Yes | 5.0.5 / 4.6.7 | — |
| Antigravity CLI | Optional provider smoke only | Yes | 1.4.2 | Fake tool-less provider for deterministic tests; do not inspect credentials or use real page content. |
| Chrome executable | Real extension E2E | Not found on PATH or standard Windows install locations in this checkout | — | Synthetic/jsdom/fake-extension integration is available. Real Chrome acceptance needs a machine with Chrome installed. |

**Missing dependency with no live-browser fallback:** Chrome is unavailable here for real extension execution; the required local synthetic acceptance remains runnable without it.

## Sources

### Primary (HIGH confidence)

- `.planning/workstreams/core/phases/08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions/08-CONTEXT.md` — locked scope and confirmation requirements.
- `.planning/workstreams/core/ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` — phase dependency, no shared requirement change, current approval/status gates.
- `CLAUDE.md` — stack, ownership, security, and workflow constraints; no project skills or AGENTS.md found.
- `.planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-CONTEXT.md` and `07-VERIFICATION.md` — current browser primitives and remaining same-origin/click-safe limitation.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-PROPOSAL.md` and `06-EVIDENCE-MATRIX.md` — content privacy boundary, Executor authority, and written voice-review gate.
- `PROTOCOL.md`; `apps/server/src/turn.ts`; `session/session.ts`; `brain/agy/{content-projection,provider,privacy,projection}.ts`; `browser/{authorization,executor}.ts`; `act/{gated,grants,gate-port,voice-gate-adapter}.ts`; `packages/policy/{classify,confirmation}.ts` — current implementations.
- `packages/dialogue/{confirm,effects}.ts`, `apps/server/src/voice/{dialogue-runner,core-gate-port}.ts`, and `apps/voice/src/{main,speak-bridge}.ts` — read-only compatibility boundary.
- `apps/extension/src/content/{browser-content,act,fill,snapshot}.ts`, `apps/extension/src/background/{dispatch,acts,navigation}.ts`, `packages/protocol/src/payloads-browser.ts`, `tools/test-pages/public/browser-control.html`, and `apps/server/src/browser/acceptance.test.ts` — capture/action patterns and local fixture precedent.
- Local environment/package inspection, 2026-10-18 — Node/npm/AGY and installed workspace versions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing installed workspace packages; no new dependency is recommended.
- Architecture: HIGH — direct patterns exist for content capture/projection, form writes, browser identity, tracked speech, and Executor dispatch; generic item grouping remains a bounded design gap.
- Pitfalls: HIGH — current code and Phase 7 verification directly establish privacy, invalidation, exact phrase, and link-policy limits.

**Research date:** 2026-10-18  
**Valid until:** 2026-11-17 for repository patterns; revisit if Phase 7 contracts or voice-owner review changes first.

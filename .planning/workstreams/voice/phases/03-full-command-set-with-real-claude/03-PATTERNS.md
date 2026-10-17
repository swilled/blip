# Phase 3: Full Command Set with Real Claude - Pattern Map

**Mapped:** 2026-10-17  
**Files analyzed:** 9 candidate files/areas  
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/dialogue/src/reduce.ts` | controller/reducer | event-driven | `packages/dialogue/src/reduce.ts` | exact |
| `packages/dialogue/src/read-fill.ts` | controller/command handler | request-response | `packages/dialogue/src/read-fill.ts` | exact |
| `packages/dialogue/src/fields.ts` | utility | transform | `packages/dialogue/src/fields.ts` | exact |
| `packages/dialogue/src/templates.ts` | utility | transform | `packages/dialogue/src/templates.ts` | exact |
| `packages/dialogue/src/state.ts` and `effects.ts` | model / effect contract | event-driven | `packages/dialogue/src/state.ts`, `packages/dialogue/src/effects.ts` | exact |
| `apps/server/src/voice/dialogue-runner.ts` | service / effect adapter | event-driven | `apps/server/src/voice/dialogue-runner.ts` | exact |
| `packages/dialogue/src/*feature*.test.ts` | test | transform and event-driven | `packages/dialogue/src/fields.test.ts`; `dev/mock-server/src/dialogue-runner.test.ts` | role-match |
| `fixtures/demo/profile.template.json` and form-model fixtures | fixture/config | transform | `fixtures/demo/profile.template.json`; `fixtures/forms/survey-form.model.json` | exact |
| A separate profile/autocomplete module, only if the planner chooses to add one | utility | transform | `packages/dialogue/src/fields.ts` | partial; no dedicated profile mapper exists |

Phase 3 should stay in voice-owned dialogue and runner code. Real Claude, label repair, injection detection, protocol authoring, and the authoritative action gate are core-owned dependencies, not Phase 3 voice files. The existing `apps/server/src/voice/dialogue-runner.ts` is the closest runner integration point; keep any cross-track interface changes coordinated with the handoffs documented in `03-RESEARCH.md`.

## Pattern Assignments

### `packages/dialogue/src/reduce.ts` (controller/reducer, event-driven)

**Analog:** `packages/dialogue/src/reduce.ts` (tracked)

Keep command handling pure and grammar-first. Dispatch existing event types to focused handlers, process deterministic commands before falling through to `parseIntent`, and return effects instead of performing I/O. Do not let model output directly execute page actions.

**Imports and reducer dispatch** (lines 1-6, 36-52):

```typescript
import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";
import { cleanTitle, normalizeCommand, plural } from "./normalize";
import { cancelEffect, speakEffect } from "./state";
import { handleActResult, handleFillUtterance, handleOptionPick, handleReadUtterance } from "./read-fill";

export function reduce(
  state: DialogueState,
  event: DialogueEvent,
  ctx: DialogueContext,
): { state: DialogueState; effects: Effect[] } {
  if (event.type !== "utterance") {
    if (event.type === "act.result") return handleActResult(state, event, ctx);
    if (event.type === "intent.reply") return answer(state, event.text);
  }
```

**Grammar-first fallback** (lines 73-98):

```typescript
const norm = normalizeCommand(raw);
if (norm === "") return { state, effects: [] };

const submitResult = handleSubmitUtterance(state, norm, raw, event, ctx);
if (submitResult !== null) return submitResult;
const readResult = handleReadUtterance(state, norm, raw, ctx);
if (readResult !== null) return readResult;
const fillResult = handleFillUtterance(state, norm, raw, ctx, event.utterance.sttConfidence);
if (fillResult !== null) return fillResult;
return { state, effects: [{ kind: "parseIntent", text: raw }] };
```

Add exact deterministic commands to the relevant handler before the final structured-intent fallback. Preserve the current state-mode guards so a new command cannot interrupt readback or gated submission unexpectedly.

---

### `packages/dialogue/src/read-fill.ts` (controller/command handler, request-response)

**Analog:** `packages/dialogue/src/read-fill.ts` (tracked)

Add dialogue actions as small functions that return `{ state, effects }`. Reuse field resolution and normalized forms, make sensitive fields take the focus-and-handoff route, and treat `act.result` plus the refreshed form as the source of truth.

**Sensitive handoff and fill effects** (lines 97-109, 116-132):

```typescript
function handoffSensitive(state: DialogueState, field: Field, form: FormModel): DialogueResult {
  const label = spokenLabel(field, fieldNumber(form, field));
  const spoken = speakEffect(state, `${label} is sensitive. I can't fill it. I moved to the field so you can type it.`, "answer", { interruptible: true });
  return { state: spoken.state, effects: [{ kind: "focus", fieldId: field.id }, spoken.effect] };
}

function issueValueEffect(state: DialogueState, field: Field, value: string, kind: "fill" | "select", optionValue?: string): DialogueResult {
  const next: DialogueState = {
    ...state,
    mode: "awaiting-value",
    readCursor: null,
    currentFieldId: field.id,
    pendingOptions: null,
    pendingFill: { fieldId: field.id, replaced: field.hasValue },
    previousValues: storeOldValue(state, field),
  };
  return {
    state: next,
    effects: [kind === "fill"
      ? { kind: "fill", fieldId: field.id, value }
      : { kind: "select", fieldId: field.id, optionValue: optionValue ?? value }],
  };
}
```

**Observed result handling** (lines 246-287):

```typescript
const pending = state.pendingFill;
if (pending === null || pending.fieldId !== event.fieldId || ctx.form === null) return { state, effects: [] };
const field = ctx.form.fields.find((item) => item.id === event.fieldId);
if (!field) return { state, effects: [] };
if (field.sensitive !== "none" || event.error === "sensitive-field") {
  return handoffSensitive(state, field, ctx.form);
}
const observed = event.observedValue;
if (!event.ok || observed === null || observed === undefined || observed === "") {
  // Speak failure; do not echo the dictated value.
}
```

For profile batch fill, snapshot each safe pre-write value and each value observed after the write. Keep one undo record per successful command, skip fields that are ambiguous, already populated, unmatched, or sensitive, and only restore when the current observed value still matches Blip's write.

---

### `packages/dialogue/src/fields.ts` (utility, transform)

**Analog:** `packages/dialogue/src/fields.ts` (tracked)

Keep field lookup deterministic and separate from command prose. Use the existing one-based page ordering, sanitized spoken labels, explicit match result unions, and sensitive-safe digest behavior.

**Enabled fields and label provenance** (lines 8-18):

```typescript
/** Enabled fields use the same page order that spoken numbering uses. */
export function fillableFields(form: FormModel): Field[] {
  return form.fields.filter((field) => !field.disabled).slice().sort((a, b) => a.order - b.order);
}

export function spokenLabel(field: Field, n: number): string {
  const label = cleanSpoken(field.label);
  if (!label) return `unlabeled field ${n}`;
  return isLowConfidenceLabel(field) ? `probably ${label}` : label;
}
```

**Ambiguity and privacy-safe digest** (lines 112-133, 139-145):

```typescript
const candidates = fillableFields(form).flatMap((field) => {
  const label = normalizeCommand(cleanSpoken(field.label)).split(" ").filter(Boolean);
  if (label.length === 0) return [];
  const exactLeading = containsAtStart(leading, label);
  const partialLeading = !exactLeading && containsContiguous(label, leading);
  if (!exactLeading && !partialLeading) return [];
  return [{ field, label, score: exactLeading ? label.length : leading.length }];
});
const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
const best = candidates.filter((candidate) => candidate.score === bestScore);
if (best.length > 1) {
  return { kind: "ambiguous", labels: best.map(({ field }) => cleanSpoken(field.label)) };
}

export function formDigest(form: FormModel): string {
  return form.fields.slice().sort((a, b) => a.order - b.order).map((field) => {
    const base = `${field.id}:${field.hasValue}`;
    return field.sensitive === "none" ? `${base}:${field.value ?? ""}` : base;
  }).join("|");
}
```

Profile mapping belongs in local deterministic logic. Parse the autocomplete detail-token list, match only explicitly supported field-name tokens to local profile keys, and return matched/ambiguous/unmatched outcomes; do not compare the whole autocomplete string or pass profile values to `parseIntent`.

---

### `packages/dialogue/src/templates.ts` (utility, transform)

**Analog:** `packages/dialogue/src/templates.ts` (tracked)

Keep response construction pure and based on the current form. Reuse `spokenLabel`, `cleanSpoken`, and the project's speech conversion helpers. Sensitive values must only produce presence or handoff text.

**Page-observed fill echo** (lines 57-66):

```typescript
export function echoText(field: Field, observedDisplay: string | null, replaced: boolean): string {
  const label = spokenLabel(field, 1);
  if (field.sensitive !== "none") {
    return observedDisplay ? `${label}, entered, hidden.` : `I tried to fill ${label}, but the page shows nothing.`;
  }
  const value = observedDisplay === null ? "" : spokenValue(observedDisplay, field);
  if (!value) return `I tried to fill ${label}, but the page shows nothing.`;
  return `${label}, ${value}.${replaced ? " Replacing the old value." : ""}`;
}
```

**Required-field response** (lines 105-115):

```typescript
export function requiredEmptyText(form: FormModel): string {
  const missing = requiredEmpty(form);
  if (missing.length === 0) return "All required fields are filled.";
  const fields = fillableFields(form);
  const labels = missing.map((field) => spokenLabel(field, fields.indexOf(field) + 1));
  if (missing.length >= 4) {
    return `I can't submit yet. ${missing.length} required fields are empty: ${joinAnd(labels)}.`;
  }
  return `I can't submit yet. ${joinAnd(labels)} ${missing.length === 1 ? "is" : "are"} required and empty.`;
}
```

For the new orientation and missing-required responses, preserve page order, counts-first wording, batches of at most three when the missing list is long, and refusal to state current page facts when the snapshot is unavailable. For guessed labels, disclose only evidence present in the core form/snapshot contract; otherwise say the label is uncertain.

---

### `packages/dialogue/src/state.ts` and `effects.ts` (model/effect contract, event-driven)

**Analogs:** `packages/dialogue/src/state.ts`, `packages/dialogue/src/effects.ts` (tracked)

Represent ongoing undo/disclosure/read pacing as reducer state and use typed effects for side effects. State must not contain sensitive values. Existing speech sequencing is the local pattern for reducer-minted identifiers:

```typescript
export function speakEffect(
  state: DialogueState,
  text: string,
  category: PayloadOf<"speak">["category"],
  opts?: { interruptible?: boolean },
): { state: DialogueState; effect: SpeakEffect } {
  const speakId = `b${state.seq}`;
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      lastSpoken: category === "filler" ? state.lastSpoken : text,
      outstanding: [...state.outstanding, speakId],
    },
    effect: {
      kind: "speak",
      speakId,
      text,
      category,
      interruptible: opts?.interruptible ?? true,
    },
  };
}
```

The real implementation uses the category type from `PayloadOf<"speak">` and increments `seq`; keep that exact typed/state transition pattern. Add state only for minimal non-sensitive metadata: one undo batch of field ids and safe before/written values, plus the field/snapshot revision needed to avoid repeating or omitting a guessed-label disclosure. Add any new runner operation to the `Effect` union in `effects.ts`; keep effect payloads typed and data-only.

---

### `apps/server/src/voice/dialogue-runner.ts` (service/effect adapter, event-driven)

**Analog:** `apps/server/src/voice/dialogue-runner.ts` (tracked)

The runner is the adapter from pure reducer effects to the hub, page action handlers, and fresh snapshots. Keep all page I/O here and return fresh observations to the reducer.

**Effect dispatch** (lines 183-216):

```typescript
switch (effect.kind) {
  case "speak":
    sendSpeakEffect(hub, effect);
    if (effect.category !== "filler") session.lastSpoken = effect.text;
    return;
  case "parseIntent":
    if (options.parseIntent && context) await options.parseIntent(effect.text, context);
    else await dispatch({ type: "intent.reply", text: "I didn't understand that." });
    return;
  case "fill":
  case "select":
  case "focus":
    await runAct(effect, session, hub, context);
    return;
  case "refreshForm":
    await refreshSnapshot(session, "post-act");
    await dispatch({ type: "form.changed" }, context);
    return;
}
```

Route profile fills through the existing typed action/result path and refresh before announcing results or deciding whether undo is safe. Consume core-provided injection and label metadata at this boundary; do not implement core detection/repair or bypass the GatePort.

---

### `packages/dialogue/src/*feature*.test.ts` (tests, transform/event-driven)

**Analogs:** `packages/dialogue/src/fields.test.ts` (tracked); `dev/mock-server/src/dialogue-runner.test.ts` (tracked)

Use Vitest, construct form variants from parsed repository fixtures, and assert both the reducer result and the safety invariant. `fields.test.ts` provides the direct unit-test fixture/helper pattern (lines 1-4, 28-42) and scenario names that state the behavioral rule (lines 44-58, 92-103). The mock-runner test drives utterances and `speak.done` through registered handlers and inspects emitted hub frames (lines 295-319); use that for runner-level sequencing and observed-page integration.

Tests for this phase should cover: profile matches/skips/existing values; no profile values in `parseIntent` payloads; page-observed echoes; batch undo guarded by the live current value; spell character/punctuation rendering; current versus unavailable snapshots; required-list batching; label disclosure once per revision; sensitive presence-only handoff; and injection warning preemption. Use the mock runner or fixtures until core's real BRAIN/PAGE/GATE contracts land.

---

### `fixtures/demo/profile.template.json` and form-model fixtures (fixture/config, transform)

**Analogs:** `fixtures/demo/profile.template.json` (tracked); `fixtures/forms/survey-form.model.json` (tracked)

Use fictional, local-only profile values. `profile.template.json` is deliberately simple and contains only `name`, `email`, and `tel` keys (lines 1-5); extend it only with fictional values needed by the demo. Use parsed form-model fixtures to represent autocomplete tokens, current values, required fields, low-confidence provenance, sensitive fields, and injection flags. Keep HO-9's core five-field fixture boundary for integration until the snapshot override is supported; don't make the new survey page a dependency of core integration.

## Shared Patterns

### Pure reducer and grammar-first behavior

**Sources:** `packages/dialogue/src/reduce.ts:36-98`, `packages/dialogue/src/effects.ts:6-21`  
**Apply to:** all dialogue command changes. Return typed effects; keep I/O in the runner. Try local exact grammar before the structured-intent fallback.

### Observed page state is authoritative

**Sources:** `packages/dialogue/src/read-fill.ts:246-287`, `packages/dialogue/src/templates.ts:57-66`, `apps/server/src/voice/dialogue-runner.ts:209-216`  
**Apply to:** fill, change, undo, orientation, and required-field summaries. Refresh and use the page's observed result; never echo dictated intent as a successful write or report stale snapshots as current.

### Sensitive values stay local and masked

**Sources:** `packages/dialogue/src/read-fill.ts:97-109`, `packages/dialogue/src/templates.ts:57-65`, `packages/dialogue/src/fields.ts:139-145`  
**Apply to:** profile fill, spell/change, undo, speech, and model requests. Sensitive fields use focus and presence-only confirmation; exclude values from state, speech, transcript/logging, and model input.

### Core-owned contracts stay upstream

**Sources:** `docs/WORK-SPLIT.md:1-20,33-37`, `03-RESEARCH.md` Integration Boundaries and Readiness  
**Apply to:** real Claude, label repair, GATE-07, and the action gate. Plan explicit fixture/contract checkpoints and keep core implementation out of voice-owned files.

## No Analog Found

| File/area | Role | Data Flow | Reason |
|---|---|---|---|
| A standalone profile/autocomplete mapper, if introduced | utility | transform | No dedicated profile-to-autocomplete mapper exists. Prefer extending existing field utilities unless separation materially improves testability. |
| Core real-Claude, label-repair, injection-scanner, or authoritative GatePort implementation | service/policy | request-response | Core owns these changes; Phase 3 voice plans consume agreed contracts and fixtures rather than implementing them. |

## Metadata

**Analog search scope:** `packages/dialogue/src`, `apps/server/src/voice`, `dev/mock-server/src`, `fixtures/demo`, `fixtures/forms`  
**Tracked-source gate:** all named analog files were verified with `git ls-files`.  
**Pattern extraction date:** 2026-10-17

# Architecture Research

**Domain:** Voice agent that reads, repairs, fills, and submits web forms for blind users (local Node/TS server, headless Claude via the Agent SDK, Chrome MV3 extension, browser-based voice UI)
**Researched:** 2026-10-16
**Confidence:** MEDIUM-HIGH overall. The Agent SDK capabilities this design depends on (`tools: []`, `startup()` warm processes, `outputFormat`, PreToolUse hooks, `settingSources: []`) and MV3 WebSocket keepalive are verified in official docs (HIGH). NVDA live-region behaviour, Web Speech in background windows, and `outputFormat` combined with `startup()` are not verified (LOW-MEDIUM). Each is flagged where it comes up.

---

## 0. The Big Decisions (read this first)

1. **"Intent-as-data", not an agentic tool loop, is the default path.** The model is called as a *pure function* with structured output and **no tools at all** (`tools: []`, no `mcpServers`). There are two kinds of call: `repairFormModel(snapshot) -> FormRepair` and `parseIntent(utterance, context) -> Intent`. Deterministic server code carries out every effect.
   - *Why:* an MCP tool loop costs one model round trip per tool call. "Fill name, email, phone, then speak" is about 5 turns × 2–5 s, so 10–25 s. That is unusable by voice. One structured call takes about 2–4 s.
   - *Security:* a model with zero tools cannot be prompt-injected into clicking anything.
   - *Relation to the PROJECT.md decision:* this refines "only custom MCP tools; policy gate in the MCP click tool". The gate moves *below* the MCP layer into a single **Executor** choke point. Any future MCP tools (an optional "agent mode" stretch for open-ended requests) call the same Executor, so the gate stays in deterministic code either way. **The roadmap should record this as a decision.**
2. **The dialogue state machine is deterministic server code**, a pure reducer that returns effects. The model never owns conversation state. Each call receives a compact, explicit context, so no hidden conversational memory can be poisoned across turns.
3. **The confirm phrase is matched by code against the raw transcript, and the model's output schema has no "confirm" variant at all.** The model can *request* a gated action. It cannot *grant* one, structurally.
4. **Action `kind` is computed by rules in `packages/policy`, and computed twice:** in the extension at snapshot time, and again on the live DOM element at act time. Anything the model says about kind is discarded.
5. **The form model is built by code first, then repaired by the model.** Baseline extraction gives an instant answer. The model only patches labels and grouping in the background. Repairs are cached by URL plus structural hash.
6. **Every side can be mocked.** `fake-extension` (fixture snapshots plus an in-memory form), `fake-brain` (regex intents plus baseline-only form model), and a `repl` (typed voice client) mean neither developer waits on the other or on Claude rate limits.

---

## Standard Architecture

### System Overview

```
 ┌──────────────────────── Chrome (one browser, two surfaces) ─────────────────────────┐
 │                                                                                      │
 │  ┌──────────── Voice UI page (http://127.0.0.1:7777/) ───────────┐  [Person B]       │
 │  │  PTT / typed box │ Web Speech STT │ speechSynthesis TTS │      │                   │
 │  │  aria-live log   │ earcons        │ settings (mode, rate)│     │                   │
 │  └──────────────────────────┬────────────────────────────────────┘                   │
 │                             │ ws  role=voice                                         │
 │  ┌──────────── MV3 extension ─┼──────────────────────────────────┐  [Person A]       │
 │  │ Service worker: ws client, keepalive, tab tracking,          │                    │
 │  │   chrome.commands (global hotkey) -> ptt relay               │                    │
 │  │ Content script (all_frames): extract() act() observe()       │                    │
 │  │   highlight() announce() [in-page live region]               │                    │
 │  └──────────────────────────┬───────────────────────────────────┘                    │
 └─────────────────────────────┼─────────────────────────────────────────────────────────┘
                               │ ws  role=extension   (Origin-checked)
 ┌─────────────────────────────┴──── Agent server (Node, TS) ───────────────────────────┐
 │  WS Hub (roles, Origin allowlist, envelopes, req/resp correlation)      [A]          │
 │      │                                                                               │
 │      ├── Session: activeTab, snapshotVersion, FormModel, cache          [A]          │
 │      │                                                                               │
 │      ├── Dialogue reducer (pure): state + event -> state + effects      [B]          │
 │      │     utterance router (grammar first) │ read-back text │ profile map           │
 │      │                                                                               │
 │      ├── Effect runner ──► Executor ──► Policy gate ──► BrowserPort     [A]          │
 │      │                       (single choke point for ALL page actions)               │
 │      │                                                                               │
 │      ├── Brain (BrainPort): warm pool of Claude processes               [A]          │
 │      │     repairFormModel (Sonnet-class)  parseIntent (Haiku-class)                 │
 │      │     tools: [] · settingSources: [] · empty cwd · outputFormat json_schema     │
 │      │                                                                               │
 │      └── SpeechPort: route speak -> voice UI | extension live region | NVDA [A+B]    │
 │                                                                                      │
 │  Static: serves voice-ui build + /fixtures/forms/*.html (demo & broken forms)        │
 └──────────────────────────────────────────────────────────────────────────────────────┘
           Disk: profile.json · .blip-cache/repairs/*.json · audit.log
```

### Component Responsibilities

| Component | Owner | Responsibility | Talks to | Must NOT |
|---|---|---|---|---|
| **Content script** (`apps/extension/src/content`) | A | DOM walk produces `Snapshot` (controls, buttons, links, headings, alerts, nearby text). Assigns `data-blip-id`. Computes labelSource and kind via `@blip/policy`. Carries out `act` ops (native value setter plus `input`/`change` events). MutationObserver produces `page-changed`. In-page live region for screen-reader mode. Field highlight. | Service worker (`chrome.runtime` messaging) | Hold AI logic or credentials. Send values of sensitive fields. Press Enter. Click a gated element without a grant flag. |
| **Service worker** (`apps/extension/src/sw`) | A | One WebSocket to the server. Keepalive ping every 20 s. Reconnect with backoff. Track active tab. Route server requests to the right tab/frame. `chrome.commands` global hotkey relayed as a `ptt` event. Optional `chrome.debugger` AX-tree augmentation. | Server (ws), content scripts | Make decisions. Relay anything it can't schema-validate. |
| **WS Hub** (`apps/server/src/hub`) | A | Accepts connections, checks `Origin` against an allowlist, binds a role on `hello`, validates every envelope with zod, correlates request/response by `id`/`replyTo`, applies timeouts. | Everything | Accept `utterance` from any role except `voice`. Accept connections from web-page origins. |
| **Session store** (`apps/server/src/session`) | A | Single source of truth: active tab, URL, `snapshotVersion`, `structuralHash`, current `FormModel` (baseline merged with repair), last values read back from the DOM, undo stack. | Dialogue, Executor, Brain | Be mutated by the model directly. |
| **Dialogue reducer** (`packages/dialogue`) | B | Pure `(state, event, ctx) -> {state, effects[]}`. Utterance router (grammar first, model fallback). Read-back and description text (counts before lists, short sentences). Spelling. Profile-to-field mapping. Confirm flow states. | Nothing directly. It emits effects. | Do I/O. Call Claude. Touch the DOM. |
| **Effect runner** (`apps/server/src/effects`) | A | Interprets effects: `speak`, `act`, `snapshot`, `brain.parseIntent`, `arm-confirm`, `earcon`, `state-push`. Feeds results back to the reducer as events. | Dialogue, Executor, Brain, SpeechPort | Bypass the Executor for page actions. |
| **Executor + Policy gate** (`apps/server/src/executor` + `packages/policy`) | A | **The only path to `BrowserPort.act`.** Checks op against the FormModel (target exists, not sensitive, not disabled). Re-checks kind. For gated kinds, verifies and consumes a `ConfirmGrant`. Writes an audit log. Verifies after writing (reads the DOM value back). | BrowserPort, Session | Be importable by the Brain module. Enforce this with a lint rule or by never passing it in. |
| **Brain** (`apps/server/src/brain`) | A | Warm pool of Claude Code subprocesses (`startup()`). Prompt templates. Zod-validated structured output. Referential-integrity checks (ids exist). Discards stale results (snapshotVersion mismatch). Per-URL repair cache. | Session (read), Claude subprocess | Have tools. Receive sensitive values or profile values. Have its output trusted beyond schema and ids. |
| **SpeechPort** (`apps/server/src/speech`) | A (routing) / B (voice-UI side) | Routes `speak` by output mode. *Agent voice* goes to the voice UI (speechSynthesis). *Screen-reader mode* goes to the in-page live region (via extension) and/or the NVDA Controller Client (server-side). Tracks `speak.done` for sequencing. | Voice UI, Extension, NVDA DLL | Arm a confirm before the read-back's `speak.done` arrives. |
| **Voice UI** (`apps/voice-ui`) | B | PTT and typed fallback. Web Speech STT (final transcripts only are sent). TTS queue with interrupt. Earcons. Visible transcript log (aria-live). Shows the expected confirm phrase. Settings. | Server (ws) | Decide whether a phrase matches (the server decides). Hold dialogue state beyond display. |

---

## Recommended Project Structure

pnpm workspaces (or npm workspaces). One `tsconfig.base.json`, shared lint. Each developer mostly lives in their own top-level folders.

```
blip/
├── PROTOCOL.md                      # SHARED: change only by agreement (both approve PR)
├── package.json                     # workspaces, root scripts: dev, build, test, demo
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── protocol/        [SHARED, A merges]  zod schemas = the contract
│   │   ├── src/envelope.ts                # Envelope, hello/welcome, roles
│   │   ├── src/extension.ts               # snapshot/act/page-changed/announce msgs
│   │   ├── src/voice.ts                   # utterance/speak/confirm/state msgs
│   │   ├── src/snapshot.ts                # RawElement, Snapshot
│   │   ├── src/form-model.ts              # Field, ActionTarget, FormModel, FormRepair
│   │   ├── src/intent.ts                  # Intent union (NO confirm variant)
│   │   └── fixtures/                      # booking.snapshot.json, booking.formmodel.json,
│   │                                      # broken.snapshot.json, result-errors.snapshot.json
│   ├── policy/          [A]  security-critical, pure, unit-tested, used by server AND extension
│   │   ├── src/classify.ts                # element -> ActionKind + reasons (rules only)
│   │   ├── src/phrases.ts                 # kind -> confirm phrase table; normalize(); matches()
│   │   ├── src/grant.ts                   # ConfirmGrant mint/verify/consume
│   │   └── test/                          # adversarial cases ("yes", injected labels, etc.)
│   └── dialogue/        [B]  pure reducer + text generation
│       ├── src/machine.ts                 # states, events, reducer
│       ├── src/effects.ts                 # Effect union (stable contract with effect runner)
│       ├── src/grammar.ts                 # deterministic command router
│       ├── src/speech-text.ts             # describe(), readBack(), spell(), counts-first lists
│       ├── src/profile-map.ts             # autocomplete token / label synonym -> profile key
│       └── test/                          # reducer tests against protocol fixtures
├── apps/
│   ├── extension/       [A]  MV3, built with Vite/CRXJS or plain esbuild
│   │   ├── manifest.json                  # minimum_chrome_version 116, commands(global)
│   │   ├── src/sw/                        # ws-client.ts, tabs.ts, commands.ts, debugger.ts (opt)
│   │   └── src/content/                   # extract.ts, label-heuristics.ts, act.ts,
│   │                                      # observe.ts, highlight.ts, announce.ts
│   ├── server/          [A]
│   │   ├── src/index.ts                   # wiring; flags --brain=fake|claude
│   │   ├── src/hub/                       # ws server, origin check, router
│   │   ├── src/session/                   # session store, structural hash, cache
│   │   ├── src/effects/                   # effect runner (consumes @blip/dialogue effects)
│   │   ├── src/executor/                  # executor + gate enforcement + audit log
│   │   ├── src/brain/                     # claude-pool.ts, repair.ts, intent.ts, prompts/,
│   │   │                                  # fake-brain.ts
│   │   ├── src/speech/                    # SpeechPort routing, nvda.ts (koffi, optional)
│   │   └── src/baseline/                  # snapshot -> baseline FormModel (pure code)
│   └── voice-ui/        [B]  Vite + vanilla TS or Preact (keep it tiny)
│       ├── src/ws.ts, src/stt.ts, src/tts.ts, src/ptt.ts, src/earcons.ts, src/ui.ts
│       └── dev/mock-server.ts             # 40-line stand-in until server skeleton lands
├── tools/
│   ├── fake-extension/  [A, hour 1-2]  connects as role=extension, serves fixtures,
│   │                                   applies acts to in-memory form, emits page-changed
│   └── repl/            [A, hour 1-2]  connects as role=voice; stdin -> utterance; prints speak
├── fixtures/forms/      [B]  booking.html (clean), broken.html (unlabeled/div-buttons/
│                             color-only errors), injection.html (seeded prompt injection),
│                             result-ok.html, result-errors.html. Served by server.
├── profile/profile.example.json   [B]   (real profile.json gitignored)
└── .planning/                       # GSD; workstreams core (A) / voice (B)
```

### Structure Rationale

- **`packages/protocol` is the only truly shared code.** Both people import it. Changes go through a small PR that both approve, plus a matching `PROTOCOL.md` edit. Fixtures live here so both tracks test against the same data.
- **`packages/policy` is separate from the server** because the extension needs the same `classify()` to re-check kind on the live element at act time. Security-critical code lives in one small, heavily tested package owned by one person (A).
- **`packages/dialogue` is B's package even though it runs inside the server.** It is pure (no I/O), so B can develop and test it with fixtures and the repl without A's code running. The only coupling is the `Effect` union, which the effect runner (A) interprets. Freeze that union early.
- **`apps/server/src/index.ts` is the one wiring hotspot.** A owns it. B asks for wiring changes rather than editing it, or they agree on a single `registerDialogue()` call site that never changes.

---

## The Form Model

### Two layers: Snapshot (raw, from extension) feeds FormModel (repaired, in server)

The extension does **cheap, deterministic** extraction and labelling. The server builds a **baseline FormModel** in code in milliseconds. The model only **patches** what code was unsure of. This gives an instant first answer and makes the model optional for clean forms.

**Label resolution order (content script, code):** this approximates the accessible-name computation.

1. `aria-labelledby` text → `labelSource: "aria"`, confidence 0.95
2. `aria-label` → `"aria"`, 0.95
3. `<label for>` or a wrapping `<label>` → `"label"`, 0.95
4. `title` → `"aria"`, 0.7
5. Nearest preceding visible text within the same row/cell/fieldset (≤ 80 chars, ≤ ~150 px) → `"nearby-text"`, 0.6
6. `placeholder` → `"placeholder"`, 0.5 (flag it: placeholder vanishes on input)
7. `name` / `id` attribute humanised (`first_name` becomes "first name") → `"inferred"`, 0.3
8. Nothing → `"inferred"`, 0.0, sent to the model for repair

The model's repairs always carry `labelSource: "inferred"` with the model's confidence. Speech rule: any field with `labelSource ∈ {inferred}` or confidence < 0.7 is announced with a hedge ("probably *phone number*, I'm guessing from the layout"). This is the PROJECT requirement "say when it guessed".

### Zod schemas (`packages/protocol/src/snapshot.ts`, `form-model.ts`)

```ts
import { z } from "zod";

export const LabelSource = z.enum(["aria", "label", "nearby-text", "placeholder", "inferred"]);

export const FieldType = z.enum([
  "text", "email", "tel", "url", "number", "date", "time", "password",
  "textarea", "select", "radio-group", "checkbox", "combobox", "file", "unknown",
]);

export const Sensitivity = z.enum(["none", "password", "card-number", "card-cvc", "otp", "ssn"]);

// ---- Raw snapshot from the extension (no model involved) ----
export const RawElement = z.object({
  id: z.string(),                       // "e17" == data-blip-id, stable for this page life
  frameId: z.number().int().default(0),
  tag: z.string(),                      // input|select|textarea|button|a|div...
  inputType: z.string().optional(),     // raw type attr
  role: z.string(),                     // computed-ish ARIA role
  labelCandidates: z.array(z.object({   // ALL candidates, best first; server picks
    text: z.string().max(200),
    source: LabelSource,
    confidence: z.number().min(0).max(1),
  })),
  describedBy: z.string().max(300).optional(),   // aria-describedby text (hints/errors)
  name: z.string().optional(),
  autocomplete: z.string().optional(),           // WHATWG token, drives profile fill
  required: z.boolean(),
  requiredSource: z.enum(["attr", "aria", "asterisk", "none"]),
  invalid: z.boolean(),                          // aria-invalid or :invalid after interaction
  errorText: z.string().max(300).nullable(),     // nearest error-ish text (role=alert, .error, describedby)
  value: z.string().nullable(),                  // null when sensitive != "none"
  checked: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string(), selected: z.boolean() })).optional(),
  sensitive: Sensitivity,
  disabled: z.boolean(),
  visible: z.boolean(),
  group: z.string().max(120).optional(),         // fieldset legend / section heading
  order: z.number().int(),                       // document order
  // action-ish elements only:
  text: z.string().max(200).optional(),          // button/link visible text
  buttonType: z.enum(["submit", "button", "reset"]).optional(), // EFFECTIVE type (<button> default = submit)
  inForm: z.boolean().optional(),
  href: z.string().optional(),
  kind: z.lazy(() => ActionKind).optional(),     // classified by @blip/policy in the extension
  kindReasons: z.array(z.string()).optional(),
});

export const Snapshot = z.object({
  snapshotId: z.string(),
  version: z.number().int(),            // monotonically increasing per tab
  tabId: z.number().int(),
  url: z.string(),
  origin: z.string(),
  title: z.string().max(200),
  headings: z.array(z.object({ level: z.number().int(), text: z.string().max(200) })).max(40),
  alerts: z.array(z.string().max(300)).max(20),   // role=alert/status, live regions, toasts
  stepHint: z.string().max(100).optional(),       // "Step 2 of 4" if detected
  elements: z.array(RawElement).max(250),
  truncated: z.boolean(),
  structuralHash: z.string(),           // hash of (tag,type,name,role,labelCandidate[0]) per element; EXCLUDES values
  capturedAt: z.number(),
});

// ---- Server-side form model (baseline + repair merged) ----
export const ActionKind = z.enum([
  "fill", "select", "check",            // field operations (always ungated)
  "click-safe",                         // ungated button/link (e.g. "show password", "add another")
  "submit", "pay", "delete", "send", "navigate-cross-domain",   // GATED
]);
export const GATED_KINDS = ["submit", "pay", "delete", "send", "navigate-cross-domain"] as const;

export const Field = z.object({
  id: z.string(),
  role: z.string(),
  type: FieldType,
  label: z.string().max(120),
  labelSource: LabelSource,
  confidence: z.number().min(0).max(1),
  hint: z.string().max(200).optional(),          // format hints ("MM/DD/YYYY")
  required: z.boolean(),
  autocomplete: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  value: z.string().nullable(),                  // LAST VALUE READ FROM DOM, not intended value
  sensitive: Sensitivity,
  error: z.string().max(300).nullable(),
  group: z.string().max(120).optional(),
  disabled: z.boolean(),
  order: z.number().int(),
});

export const ActionTarget = z.object({
  id: z.string(),
  label: z.string().max(120),
  kind: ActionKind,                              // from @blip/policy rules ONLY
  kindReasons: z.array(z.string()),              // ["button type=submit inside form", "text matches /pay|purchase/"]
  primary: z.boolean(),                          // the form's main submit
  href: z.string().optional(),
});

export const FormModel = z.object({
  snapshotVersion: z.number().int(),
  structuralHash: z.string(),
  url: z.string(),
  title: z.string(),                             // repaired form title ("Hotel booking")
  step: z.string().optional(),                   // "Step 2 of 4: Guest details"
  fields: z.array(Field),
  actions: z.array(ActionTarget),
  groups: z.array(z.object({ name: z.string(), fieldIds: z.array(z.string()) })),
  pageErrors: z.array(z.string()),               // errors not tied to a field
  repairStatus: z.enum(["baseline", "pending", "repaired", "failed"]),
});

// ---- What the MODEL may return (a patch, never a full model) ----
export const FormRepair = z.object({
  title: z.string().max(80),
  step: z.string().max(80).optional(),
  fieldPatches: z.array(z.object({
    id: z.string(),                              // MUST exist in snapshot; else dropped
    label: z.string().max(80),
    confidence: z.number().min(0).max(1),
    hint: z.string().max(120).optional(),
    group: z.string().max(60).optional(),
  })),
  actionLabels: z.array(z.object({ id: z.string(), label: z.string().max(60) })), // label only, NOT kind
  errorAssignments: z.array(z.object({ fieldId: z.string(), error: z.string().max(200) })),
});
```

**Merge rules (server, code):** patches apply only to ids that exist. A patch never changes `kind`, `required` (unless the asterisk heuristic said "none" and the model claims required, in which case it is a hint only), `value`, `sensitive`, or `type`. A model label replaces the baseline label only when the baseline `labelSource ∈ {placeholder, inferred}` or baseline confidence < 0.6. Every repaired label is length-capped and stripped of control characters and of anything that looks like an instruction (heuristic). See Pitfalls.

### Kind classification rules (`packages/policy/src/classify.ts`): fail closed

Evaluate in order. The first match wins. Record a reason string for each match (it makes a good demo).

1. `<a href>` whose registrable domain differs from the page's → `navigate-cross-domain`
2. Text, aria-label, value, or `formaction` matches `/\b(pay|purchase|buy|place order|checkout|complete order|donate)\b/i`, or the element sits near card fields → `pay`
3. Matches `/\b(delete|remove|cancel (my )?(account|subscription|booking)|close account|unsubscribe)\b/i` → `delete`
4. Matches `/\b(send|post|publish|share|message)\b/i` → `send`
5. Effective `type=submit` (**`<button>` with no type inside a `<form>` is submit**), `input[type=submit|image]`, any element with `form`/`formaction` attributes, or text matching `/\b(submit|book|reserve|confirm|register|sign up|apply|continue|next|save|finish)\b/i` → `submit`
6. `type=button` or a non-form element with a click handler **and** text matching an explicit allowlist (`show|hide|add another|expand|more info|help|back`) → `click-safe`
7. **Default for anything unclassified: `submit`** (fail closed). It is better to ask once too often.

Treat "Continue"/"Next" as `submit`. Multi-step checkouts commit data server-side on "Continue", and the confirm phrase for step navigation can be the lighter "continue form". Also: *fill ops must never synthesize Enter*, because implicit form submission would bypass the click gate.

---

## PROTOCOL.md (draft, copy to repo root in hour 0)

### Transport

- One WebSocket server at **`ws://127.0.0.1:7777/ws`**. Use `127.0.0.1`, not `localhost`: on Node 17+ on Windows, `localhost` can resolve to `::1` and miss an IPv4-bound server. HTTP on the same port serves the voice UI and `/fixtures/forms/*`.
- **Origin allowlist**, checked on the upgrade request:
  - `chrome-extension://<EXT_ID>` → may claim `role: "extension"`.
  - `http://127.0.0.1:7777` → may claim `role: "voice"`.
  - No Origin (Node tools) → only when the server runs with `--dev`, and only for `voice`/`extension` fakes.
  - Anything else → reject. *Any website can open a WebSocket to localhost.* Without this check, a malicious page could send `utterance: "submit booking"`.
- JSON text frames only. Every frame is an `Envelope`. Unknown or invalid frames → `error` reply, never a crash.
- Keepalive: the extension sends `ping` every 20 s (keeps the MV3 service worker alive; Chrome 116+). The server replies `pong`.

### Envelope and handshake

```ts
export const Role = z.enum(["extension", "voice"]);

export const Envelope = z.object({
  v: z.literal(1),
  id: z.string(),                 // uuid / nanoid, unique per frame
  type: z.string(),               // discriminator, e.g. "act.request"
  replyTo: z.string().optional(), // set on responses
  ts: z.number(),
  payload: z.unknown(),           // validated per-type by the schemas below
});

// client -> server (first frame, required within 2 s)
export const Hello = z.object({ role: Role, clientVersion: z.string(), protocolVersion: z.literal(1) });
// server -> client
export const Welcome = z.object({ sessionId: z.string(), serverVersion: z.string(), brain: z.enum(["claude", "fake"]) });
export const ErrorMsg = z.object({ code: z.string(), message: z.string(), fatal: z.boolean() });
```

### Extension ↔ Server

| type | dir | payload | notes |
|---|---|---|---|
| `snapshot.request` | S→E | `{ tabId?: number, reason: "page-load"\|"user"\|"post-act"\|"refresh" }` | E replies `snapshot.result` (timeout 8 s) |
| `snapshot.result` | E→S | `{ snapshot: Snapshot }` or `{ error }` | |
| `act.request` | S→E | `ActRequest` (below) | E replies `act.result` (timeout 5 s) |
| `act.result` | E→S | `ActResult` | |
| `page.changed` | E→S | `{ tabId, url, reason: "navigation"\|"mutation"\|"tab-activated", structuralHash?: string }` | debounced 500 ms; server decides whether to re-snapshot |
| `announce` | S→E | `{ text: string, politeness: "polite"\|"assertive" }` | in-page live region for NVDA mode |
| `highlight` | S→E | `{ targetId: string \| null }` | visual aid for sighted demo audience |
| `ptt` | E→S | `{ source: "global-hotkey" }` | relayed from `chrome.commands` (toggle only; there is no keyup) |
| `ping` / `pong` | E↔S | `{}` | |

```ts
export const ActOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("fill"),   targetId: z.string(), value: z.string() }),
  z.object({ op: z.literal("select"), targetId: z.string(), optionValue: z.string() }),
  z.object({ op: z.literal("check"),  targetId: z.string(), checked: z.boolean() }),
  z.object({ op: z.literal("focus"),  targetId: z.string() }),     // used for password/card: user types
  z.object({ op: z.literal("click"),  targetId: z.string() }),
  z.object({ op: z.literal("scroll-into-view"), targetId: z.string() }),
]);

export const ActRequest = z.object({
  actId: z.string(),
  tabId: z.number().int(),
  snapshotVersion: z.number().int(),     // E rejects if its current version differs AND target changed
  action: ActOp,
  expectedKind: ActionKind,              // server's classification
  gate: z.object({                       // present ONLY for gated kinds
    grantId: z.string(),
    kind: ActionKind,
  }).optional(),
});

export const ActResult = z.object({
  actId: z.string(),
  ok: z.boolean(),
  error: z.enum([
    "target-not-found", "stale-snapshot", "kind-mismatch",   // live re-classification disagreed
    "gate-required", "sensitive-field", "disabled", "exception",
  ]).optional(),
  detail: z.string().max(300).optional(),
  observedValue: z.string().nullable().optional(), // DOM value read back after fill/select (verify-after-write)
  liveKind: ActionKind.optional(),
  newSnapshotVersion: z.number().int().optional(),
});
```

Extension act rules: re-run `classify()` on the **live** element. If `liveKind` is gated and (`gate` is absent or `gate.kind !== liveKind`), refuse with `kind-mismatch`/`gate-required`. Refuse `fill` on `sensitive != "none"` (the server should only send `focus` for those).

### Voice UI ↔ Server

| type | dir | payload | notes |
|---|---|---|---|
| `utterance` | V→S | `{ utteranceId, text: string(max 500), source: "voice"\|"typed", sttConfidence?: number, alternatives?: string[] }` | final transcripts only |
| `ptt` | V→S | `{ state: "start"\|"end" }` | on start the server stops speech and cancels the pending brain turn (barge-in by key) |
| `speak.done` | V→S | `{ speakId, interrupted: boolean }` | required for read-back → arm sequencing |
| `settings` | V→S | `{ outputMode: "agent-voice"\|"screen-reader"\|"both", rate?: number, verbosity?: "short"\|"normal" }` | |
| `control` | V→S | `{ cmd: "stop"\|"repeat"\|"reconnect-browser" }` | "stop" also works via a button and a hotkey |
| `speak` | S→V | `{ speakId, text: string, category: "answer"\|"filler"\|"readback"\|"confirm-prompt"\|"error"\|"result", interrupt: boolean, spell?: boolean }` | the UI queues it; `interrupt` flushes the queue |
| `earcon` | S→V | `{ name: "listening"\|"thinking"\|"done"\|"blocked"\|"error" }` | non-verbal latency cue |
| `confirm.armed` | S→V | `{ grantId, phrase: string, kind: ActionKind, actionLabel: string, expiresAt: number }` | UI displays "Say: *submit form*". Informational only. |
| `confirm.cleared` | S→V | `{ grantId, reason: "executed"\|"cancelled"\|"expired"\|"page-changed"\|"value-changed" }` | |
| `state` | S→V | `{ dialogue: DialogueStateName, page: { url, title, step?, fieldCount, requiredEmpty: number } \| null, focusFieldId?: string, busy: boolean, extensionConnected: boolean, brain: "claude"\|"fake" }` | pushed on every change |
| `transcript` | S→V | `{ utteranceId, heardAs: string, routedTo: "grammar"\|"model" }` | debug/demo panel |

```ts
export const DialogueStateName = z.enum([
  "no-page", "ready", "describing", "awaiting-value", "reading-back",
  "awaiting-confirm", "executing", "awaiting-result", "reading-result",
]);
```

### Intent (model output for `parseIntent`; also produced by the grammar)

```ts
export const Intent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("describe") }),                         // "what's on this page"
  z.object({ type: z.literal("read_form") }),
  z.object({ type: z.literal("whats_required") }),
  z.object({ type: z.literal("what_went_wrong") }),
  z.object({ type: z.literal("read_back") }),
  z.object({ type: z.literal("fill_profile") }),
  z.object({ type: z.literal("go_to_field"), fieldId: z.string() }),
  z.object({ type: z.literal("set_fields"), fills: z.array(z.object({ fieldId: z.string(), value: z.string().max(300) })).max(20) }),
  z.object({ type: z.literal("spell"), fieldId: z.string() }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("request_action"), actionId: z.string() }),  // REQUEST only; never executes a gated kind
  z.object({ type: z.literal("click_safe"), actionId: z.string() }),      // executor re-checks kind
  z.object({ type: z.literal("answer"), text: z.string().max(300) }),     // free-form question answered from the model
  z.object({ type: z.literal("clarify"), question: z.string().max(200) }),
  z.object({ type: z.literal("unknown") }),
]);
// There is deliberately NO "confirm" / "approve" / "submit_now" variant.
```

### Mockability matrix

| Real side | Mock | Who builds | When |
|---|---|---|---|
| Extension | `tools/fake-extension` (fixture snapshot, in-memory field values, emits `page.changed` after a gated click with `result-*.snapshot.json`) | A | hour 1–2 |
| Voice UI | `tools/repl` (stdin → `utterance`, prints `speak`, auto-sends `speak.done`) | A | hour 1–2 |
| Server (for voice UI before skeleton lands) | `apps/voice-ui/dev/mock-server.ts` (echo + scripted speak/state) | B | hour 0–1 |
| Claude | `--brain=fake` (grammar-only intents, baseline-only form model, a 1.5 s artificial delay to exercise filler/earcon) | A | hour 2 |

---

## Architectural Patterns

### Pattern 1: Pure reducer with effects (dialogue)

**What:** `reduce(state, event, ctx) -> { state, effects }`. Events: `utterance`, `intent.parsed`, `act.result`, `speak.done`, `page.changed`, `formmodel.updated`, `timer.expired`, `ptt.start`. Effects: `speak`, `earcon`, `act`, `snapshot`, `parseIntent`, `armConfirm`, `clearConfirm`, `pushState`, `startTimer`.
**When:** always, for conversation logic. It is testable without Chrome, Claude, or a microphone, and it is B's main deliverable.
**Trade-offs:** slightly more ceremony than imperative async code, but it makes the confirm flow auditable and testable. For a hackathon the payoff is that B can test everything with `vitest` plus fixtures.

```ts
// packages/dialogue/src/machine.ts (sketch)
export function reduce(s: DState, e: DEvent, ctx: Ctx): { state: DState; effects: Effect[] } {
  // 1. Confirm gate comes FIRST, on raw transcript, before any routing or model call.
  if (s.name === "awaiting-confirm" && e.type === "utterance") {
    if (ctx.policy.matchesPhrase(e.text, s.phrase)) {
      return { state: { ...s, name: "executing" },
               effects: [{ type: "act", action: s.pendingClick, grantRequest: s.grantId }] };
    }
    if (ctx.policy.isBareAffirmative(e.text)) // "yes", "ok", "sure", "do it"
      return { state: s, effects: [say(`To ${s.verb}, say: ${s.phrase}.`)] };
    return { state: toReady(s), effects: [clearConfirm(s.grantId, "cancelled"), say("Okay, not submitting.")] };
  }
  if (e.type === "utterance") {
    const g = grammar(e.text, ctx.form, s);        // deterministic, ~1 ms
    if (g) return handleIntent(s, g, ctx);
    if (s.name === "awaiting-value")               // dictation for a known field: no model needed
      return handleIntent(s, { type: "set_fields", fills: [{ fieldId: s.fieldId, value: normalizeDictation(e.text, s.fieldType) }] }, ctx);
    return { state: { ...s, busy: true }, effects: [{ type: "parseIntent", text: e.text }, { type: "startTimer", id: "filler", ms: 700 }] };
  }
  // ...
}
```

### Pattern 2: Single-choke-point Executor with capability grants (policy gate)

**What:** `executor.run(op, grantId?)` is the only function that can reach `BrowserPort.act`. For a gated kind it calls `policy.consumeGrant(grantId, binding)`. The grant is minted only by the effect runner when it handles `armConfirm` (after the read-back finished speaking). It is redeemed only when the dialogue matched the phrase from a `role=voice` utterance.

```ts
// packages/policy/src/grant.ts
export interface ConfirmGrant {
  grantId: string; kind: ActionKind; targetId: string; phrase: string;
  snapshotVersion: number; structuralHash: string; valuesHash: string;  // hash of all field values read back
  url: string; armedAt: number; expiresAt: number; matched: boolean; used: boolean;
}
// verify: !used && matched && now < expiresAt && same targetId/kind/snapshotVersion/valuesHash/url
```

**Gate enforcement, end to end (defence in depth):**

| # | Layer | Guarantee |
|---|---|---|
| 1 | Model capability | Brain processes run with `tools: []`, no `mcpServers`, `settingSources: []`, empty temp `cwd`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, plus a PreToolUse hook that denies everything (belt and braces). The model can only emit JSON. |
| 2 | Output schema | `Intent` has no confirm variant. `request_action` only starts the read-back. The model cannot express "approved". |
| 3 | Kind by rules | `kind` comes from `@blip/policy.classify()` in the extension. Model output never sets it. Merge rules ignore it. |
| 4 | Phrase from table | The phrase comes from a fixed table keyed by kind (`submit → "submit form"`, `pay → "confirm payment"`, `delete → "confirm delete"`, `send → "send it now"`, `navigate-cross-domain → "leave this site"`). An optional noun is chosen from a fixed whitelist (`booking`, `order`, `application`, `message`) by keyword match on the page title. **Page text never reaches the phrase verbatim**, so a page that labels its button "yes" cannot make "yes" the phrase. |
| 5 | Arming sequence | Arming happens only after the read-back `speak.done` arrives with `interrupted=false` and every required field is filled (or the user explicitly heard "two required fields are empty"). |
| 6 | Match in code | Normalize (lowercase, strip punctuation and filler "um/uh/please") and require an exact token-sequence match. No fuzzy match and no model. Only utterances from the `voice` role socket count. |
| 7 | Binding and expiry | The grant is bound to target, kind, snapshotVersion, valuesHash, and url. TTL 30 s. Single use. Any `page.changed`, value change, or non-matching utterance clears it. |
| 8 | Live re-check | The extension re-classifies the live element and refuses gated clicks without a matching `gate`. |
| 9 | Transport | The Origin allowlist stops web pages from connecting. Role binding stops the extension from sending utterances. |
| 10 | Audit | Every gated attempt (allowed or blocked) goes to `audit.log` and to the debug panel, a strong demo moment ("blocked: injection asked to submit"). |

### Pattern 3: Baseline-now, repair-later (latency)

**What:** answer from the code-built model immediately, with the model's repair as a background enhancement. Tag every async result with `snapshotVersion` and drop stale ones.

```ts
// apps/server/src/session/on-snapshot.ts (sketch)
async function onSnapshot(snap: Snapshot) {
  session.formModel = baseline(snap);                         // < 10 ms
  const cached = cache.get(snap.origin + new URL(snap.url).pathname, snap.structuralHash);
  if (cached) { session.formModel = merge(session.formModel, cached); return emit("formmodel.updated"); }
  if (needsRepair(session.formModel)) {                       // any field conf < 0.6 or no title
    session.formModel.repairStatus = "pending";
    brain.repair(trimForModel(snap)).then(r => {
      if (snap.version !== session.snapshotVersion) return;   // stale
      cache.put(key, snap.structuralHash, r);                 // disk-persisted -> demo pre-warm
      session.formModel = merge(session.formModel, r);
      emit("formmodel.updated");                              // dialogue may say "I worked out the 2 unlabeled fields"
    }).catch(() => (session.formModel.repairStatus = "failed"));
  }
}
```

### Pattern 4: Warm process pool for headless Claude

**What:** use the Agent SDK's `startup()` to pre-spawn a Claude Code subprocess and finish the initialize handshake before a prompt exists. Each brain call claims a warm process, runs one stateless prompt, and the pool immediately warms a replacement. Keep 1 warm `repair` worker (Sonnet-class) and 1–2 warm `intent` workers (Haiku-class).
**Why stateless per call:** no context growth, no cross-turn injection memory, and deterministic inputs. The dialogue state passed in is a compact summary (current field, last 3 turns, form-model digest).
**Trade-offs:** about 230–260 MB per spare process (documented for `prewarm()`; `startup()` is likely similar). Three spares is fine on a laptop.
**Fallback if `outputFormat` + `startup()` misbehaves:** one long-lived streaming-input session per role, with prompts that demand JSON only, `zod.safeParse` on the result text, and one retry. **Verify in the first brain spike (A, around hour 7).**

```ts
import { startup } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const baseOpts = (model: string, schema: object) => ({
  model, tools: [], mcpServers: {}, settingSources: [], cwd: EMPTY_DIR, maxTurns: 1,
  outputFormat: { type: "json_schema" as const, schema },
  hooks: { PreToolUse: [{ hooks: [async () => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "no tools" } })] }] },
  env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
  systemPrompt: INTENT_SYSTEM_PROMPT,
});
const intentSchema = z.toJSONSchema(Intent, { target: "draft-7" });   // SDK validates draft-07
let warm = startup({ options: baseOpts(INTENT_MODEL, intentSchema) });
async function parseIntent(prompt: string) {
  const w = await warm; warm = startup({ options: baseOpts(INTENT_MODEL, intentSchema) }); // re-warm
  for await (const m of w.query(prompt)) if (m.type === "result")
    return m.subtype === "success" && m.structured_output ? Intent.parse(m.structured_output) : { type: "unknown" };
}
```

---

## Data Flow

### Flow 1: Page load and form model (background, before the user speaks)

```
tab navigates ─► content script (document_idle) extract() ─► SW ─ws─► page.changed{navigation}
server: snapshot.request ─► content extract() ─► snapshot.result (50–300 ms)
server: baseline(snapshot) ─► FormModel{repairStatus: baseline}   (< 10 ms)
       ├─ cache hit (origin+path+structuralHash) ─► merge ─► repaired     (instant)
       └─ miss & needsRepair ─► Brain.repair (warm Sonnet, 3–8 s) ─► merge ─► formmodel.updated
dialogue: formmodel.updated (state=ready) ─► optional short cue: earcon "done" (no auto-talk unless the user asked)
```

### Flow 2: Utterance → effect (the hot path)

```
[PTT] ─► voice UI STT final ─► utterance ─► Hub (role=voice ✓) ─► dialogue.reduce
   ├─ awaiting-confirm? ─► policy.matchesPhrase (code) ─► executor (grant) ─► act.request ─► extension
   ├─ grammar hit (~1 ms)  ─► effects (speak / act / readBack)            ≈ 0.3 s to first audio
   ├─ awaiting-value       ─► normalizeDictation ─► act fill ─► echo value ≈ 0.4 s
   └─ miss ─► parseIntent (warm Haiku) ─► Intent.parse ─► id integrity check ─► effects
              t+400 ms earcon "thinking"; t+1500 ms speak "One moment." (once per turn)
act.result{observedValue} ─► session.fields[id].value = observedValue ─► speak echo using OBSERVED value
```

### Flow 3: Submit (gated)

```
"submit" (grammar) or Intent{request_action: e42}
  ─► executor.preflight(e42): kind=submit (rules) ─► dialogue: reading-back
  ─► speak(readBack grouped; empty required called out; category=readback)
  ─► speak.done{interrupted:false} ─► effect armConfirm ─► grant minted (bound, 30 s)
  ─► speak "To submit, say: submit form."  + confirm.armed → UI shows phrase
  ─► utterance "submit form" (role=voice) ─► matchesPhrase ✓ ─► grant.matched
  ─► executor.run(click e42, grantId) ─► consumeGrant ✓ ─► act.request{gate} ─► extension live re-classify ✓ ─► click
  ─► page.changed{navigation|mutation} ─► snapshot ─► baseline result reading:
       alerts + invalid fields + errorText per field (code) ─► speak "Booking confirmed…" or "2 errors: Email: …"
       (model summary of the result page is optional/background)
any other utterance / value change / page.changed / timeout ─► confirm.cleared ─► "Okay, not submitting."
```

### Flow 4: Sensitive fields

```
snapshot: sensitive=password|card-* ─► value=null (never leaves page) ─► FormModel keeps the field
user: "fill the password" ─► executor refuses fill ─► act focus ─► speak "Password field focused. Type it now; I won't hear it."
```

### State Management: who owns what

| State | Owner (single writer) | Readers |
|---|---|---|
| DOM truth (values, focus) | Page / extension | Server via snapshot and `observedValue` |
| Snapshot, FormModel, snapshotVersion, cache | Server Session (A) | Dialogue (read-only ctx), Brain |
| Dialogue state (incl. pending confirm) | Dialogue reducer (B) in server | Voice UI via `state` push |
| Grants | Policy (A), minted and consumed only via the Executor | none |
| TTS queue, STT session, PTT | Voice UI (B) | Server via `speak.done` / `ptt` |
| Profile | `profile.json` on disk, read by `profile-map` (B) in server | never sent to the model |
| Model conversation | **none persistent** (stateless calls) | |

---

## Latency Architecture

| User request | Model needed? | Path | Target time to first audio |
|---|---|---|---|
| "What's on this page?" | No (baseline). Uses repair if ready. | grammar → describe() | < 0.5 s |
| "Read the form" / "What's required?" / "Read back" | No | grammar → speech-text | < 0.5 s |
| "Fill from my profile" | No | autocomplete tokens → profile keys; label-regex synonyms fallback | < 1 s (+ echo per field) |
| Dictating a value while a field is focused | No | normalizeDictation (email "at"/"dot", digits, "capital") | < 0.5 s |
| "Go to email" / "change phone to 555…" / "spell email" | Usually no | grammar with fuzzy label match (token overlap ≥ 0.6); falls to the model when ambiguous | < 0.5 s, or 2–3 s |
| "Submit" / "confirm payment" | **Never** | grammar → gate | < 0.5 s |
| Free-form ("put my work address", "what's a PNR?") | Yes (intent, Haiku-class) | warm process | 1.5–3 s + filler |
| Unlabeled-field repair, form title/step | Yes (repair, Sonnet-class) | background on page load; cached | 0 s perceived if pre-warmed |
| Result page | No for errors/alerts. Optional model summary. | baseline error extraction | < 1 s |

Rules:
- **Grammar first, model last.** The command list in PROJECT.md (what's here, read the form, fill from profile, go to field X, change X to Y, spell X, what's required, what went wrong, read back, undo, stop, submit) is small enough for regexes plus a fuzzy field matcher. Expect 70–80% of demo utterances never to touch Claude.
- **Earcon before words.** At 400 ms play a soft "thinking" tick. At 1.5 s say "One moment" once. Never stack fillers.
- **`ptt.start` is barge-in.** It stops TTS and cancels (drops) the in-flight brain result by bumping a turn counter.
- **Pre-warm the demo.** Visit each demo form once before presenting. Repairs persist in `.blip-cache/`, so the live demo hits the cache.
- **Trim before the model.** Send only the elements with conf < 0.8 plus their neighbours, headings, and alerts, capped at about 4–6k tokens. Never send values, profile data, or sensitive fields.

---

## Build Order and Integration Milestones

Hours are from kickoff and assume about 40 h total. **A = Pranav (core)**, **B = teammate (voice)**.

| Hour | Person A (core) | Person B (voice) | Shared milestone |
|---|---|---|---|
| 0–0.75 | Draft `packages/protocol` zod and `PROTOCOL.md` (this section) | Review protocol. Hand-write `booking.formmodel.json` and a snapshot fixture from the demo form. Draft the Effect union. | **M0: protocol frozen v1** (both sign off) |
| 0.75–2.5 | Server skeleton: hub, Origin/role check, hello, `--brain=fake`, `tools/repl`, `tools/fake-extension` | Voice UI shell: ws client, typed box, `speechSynthesis` queue, aria-live log, `dev/mock-server.ts` | **M1 (~h2.5):** `pnpm dev` → server + fake-extension; B's UI connects as voice and gets `welcome` and `state` |
| 2.5–7 | Extension: SW ws + keepalive + reconnect. Content `extract()` with label heuristics. `act()` (native setter, select, check, click, focus). `page.changed` observer. Test on `fixtures/forms/*.html`. | `packages/dialogue`: reducer, grammar, describe/readBack/spell text, counts-first lists, profile-map, confirm states. Vitest against fixtures. | |
| 5–9 | `packages/policy`: classify rules plus adversarial tests, phrase table, matcher, grants. Executor plus audit log. Effect runner wired to the dialogue. | Web Speech STT + PTT (in-page key + `ptt` from extension global hotkey, toggle mode). **Spike: does STT work while the voice-UI window is not focused?** (see Pitfalls) | **M2 (~h9):** full loop with fake-extension + fake-brain via voice: describe, fill, read back, gated submit with phrase |
| 7–11 | Brain: `startup()` warm pool, `tools: []`, structured output spike, repair prompt, intent prompt, cache, stale-drop | Demo forms: `booking.html`, `broken.html`, `result-*.html`. `profile.example.json`. Output-mode setting. Earcons. | |
| **~12** | **Integration I1:** real extension + real server + real voice UI on `booking.html` (fake brain OK) | | **M3: end-to-end on a real page, gate demonstrated** |
| 12–20 | Real Claude brain in the loop. Result-page error reading. Sensitive-field focus flow. `injection.html` defenses and tests. Cross-domain nav gating. | Screen-reader mode: `announce` to in-page live region, test with NVDA. NVDA Controller path decision (with A for koffi). Speech-text polish ("I guessed"). | **M4 (~h20):** real public form + broken form repaired by Claude + injection blocked |
| 20–30 | Optional: `chrome.debugger` AX-tree augmentation; agent-mode MCP tools (stretch); perf (trim, cache) | Demo script, rehearsal, NVDA coexistence tuning, typed fallback everywhere, one-command startup polish | **M5 (~h30): feature freeze** |
| 30–end | Bugfix only, pre-warm cache, backup video | Rehearse, pitch | |

**Dependency notes:**
- M0 blocks everything. Keep it to 45 minutes and freeze it. Additive, optional fields are allowed later without a meeting.
- B is never blocked on A after M1: fake-extension, fake-brain, and repl cover all of A's side.
- A is never blocked on B: the repl covers voice, and `@blip/dialogue` can start as a stub reducer A writes in 20 minutes (grammar for describe/fill/submit only) until B's lands.
- The policy and executor (A) must exist before M2, because B's confirm states need real grants to test the end-to-end gate.
- Brain work is deliberately last on A's critical path. Everything is demoable without Claude, which protects against subscription rate limits or auth hiccups during the event.

---

## Scaling Considerations

Single user, single machine. "Scale" means "what breaks first during a 40-hour build and a live demo".

| Concern | What breaks first | Mitigation |
|---|---|---|
| Subscription rate limits | Many repair calls while iterating on prompts | Disk cache keyed by structuralHash. `--brain=fake` for UI work. Haiku-class for intents. |
| Large DOMs (real sites) | Snapshot > 250 elements; token blowup | Visible controls only, form-scoped when a `<form>` exists, trim text to 200 chars, `truncated` flag spoken ("This page is long; I'm reading the main form.") |
| Warm process memory | 3 spares ≈ 0.75 GB | Fine on dev laptops. Drop to 1 spare if needed. |
| SW lifecycle | Socket drops after idle | 20 s ping (Chrome 116+). Reconnect with backoff. Server shows `extensionConnected:false` in `state` and speaks it. |
| Model-stale results | User moved on, an old intent arrives | Turn counter + snapshotVersion tags. Drop mismatches. |

---

## Anti-Patterns

### Anti-Pattern 1: Letting Claude drive the conversation via a tool loop
**What people do:** give the model `get_snapshot / fill_field / click / speak / ask_user` and let it loop.
**Why it's wrong:** 2–5 s per tool round trip compounds to 10–25 s per user turn. The model owns state you can't test. Every tool is an injection target. The confirm gate becomes "please don't call click".
**Do this instead:** stateless structured-output calls, a deterministic reducer, and one Executor. Keep MCP tools only for a stretch "agent mode" that still routes through the Executor.

### Anti-Pattern 2: Matching the confirm phrase with the model, or fuzzily
**What people do:** ask the model whether the user confirmed, or use similarity ≥ 0.8.
**Why it's wrong:** "yes, submit it" or a page-injected string can pass. The core value depends on this check.
**Do this instead:** normalize plus an exact token match in `@blip/policy`, on a raw transcript from the voice socket, in the `awaiting-confirm` state only.

### Anti-Pattern 3: Deriving the confirm phrase or the action kind from page text
**What people do:** phrase = "say " + button label, or ask the model "is this button a submit?".
**Why it's wrong:** an attacker labels the pay button "Cancel", or makes its label "yes".
**Do this instead:** rules-based kind (fail closed) and a phrase from a fixed table.

### Anti-Pattern 4: Reading back intended values instead of DOM values
**What people do:** echo what the user said.
**Why it's wrong:** sites reformat, truncate (maxlength), or reject input silently, and the user trusts a wrong read-back.
**Do this instead:** `act.result.observedValue` is the only source for echo and read-back.

### Anti-Pattern 5: Setting `.value` directly in the content script
**What people do:** `el.value = "x"`.
**Why it's wrong:** React/Vue controlled inputs ignore it, and the value reverts on the next render.
**Do this instead:** call the native setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v)`), then dispatch `input` and `change` with `bubbles: true`, then read back. Fall back to CDP `Input.insertText` via `chrome.debugger` only for stubborn widgets (stretch).

### Anti-Pattern 6: The WebSocket server trusts anything on localhost
**Why it's wrong:** any webpage can `new WebSocket("ws://127.0.0.1:7777/ws")`.
**Do this instead:** an Origin allowlist plus role binding at `hello`.

### Anti-Pattern 7: Speaking through the voice-UI page's live region in screen-reader mode
**Why it's wrong:** NVDA generally announces live regions only in the document the user is in, which is the form tab, not the voice-UI tab (MEDIUM confidence; verify).
**Do this instead:** route `announce` to an off-screen live region injected into the *form* page by the content script, or use the NVDA Controller Client from the server. Pick one by hour ~16.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| Claude (subscription) | `@anthropic-ai/claude-agent-sdk` `startup()` + `WarmQuery.query()`, `outputFormat` json_schema (draft-07 via `z.toJSONSchema(..., {target:"draft-7"})`) | `tools: []` removes all built-ins (documented). `settingSources: []` + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` stop user CLAUDE.md/memory leaking in. `setModel()` exists for streaming sessions. |
| Web Speech API (Chrome) | `webkitSpeechRecognition` (cloud-backed in Chrome) + `speechSynthesis` in the voice-UI page | Needs network. Behaviour when the window is unfocused is unverified, so spike it early. |
| NVDA | (a) in-page aria-live via extension `announce`; (b) `nvdaControllerClient.dll` `nvdaController_speakText(wchar_t*)` via koffi from the server | (b) works regardless of focus. The DLL is x64. LOW-MEDIUM confidence, owned jointly. |
| Chrome commands | `"global": true`, `Ctrl+Shift+[0-9]` | Only `onCommand` (no keyup), so PTT via hotkey is **toggle**: press to start, STT end-of-speech stops it. True hold-to-talk needs a native key hook (out of scope). |
| chrome.debugger (optional) | `Accessibility.getFullAXTree`, `Input.insertText` | Shows a "debugging this browser" infobar (MEDIUM). Detaches when DevTools opens. Not on the critical path. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| Content script ↔ SW | `chrome.runtime.sendMessage` / ports, typed with protocol schemas | Content script per frame (`all_frames: true`). Cross-origin payment iframes are ignored by design (sensitive). |
| SW ↔ Server | WebSocket envelopes | Request/response with `replyTo`. Server timeouts 5 s act, 8 s snapshot. |
| Voice UI ↔ Server | WebSocket envelopes | The UI is a dumb terminal plus audio I/O. |
| Dialogue ↔ Effect runner | In-process function calls; the `Effect`/`DEvent` unions are the contract | B owns the reducer, A owns the runner. Freeze the unions at M0. |
| Effect runner ↔ Executor ↔ Policy | In-process; the Executor is the only importer of `BrowserPort.act` | Enforce with an eslint `no-restricted-imports` rule in `brain/`. |
| Brain ↔ Session | Brain receives a trimmed snapshot/context and returns zod-validated data | The Brain never imports the executor or the hub. |

---

## Sources

- Claude Agent SDK TypeScript reference (options `tools`, `disallowedTools`, `settingSources`, `outputFormat`, `startup()`, `prewarm()`, Query methods `interrupt`/`setModel`/`streamInput`): https://code.claude.com/docs/en/agent-sdk/typescript (HIGH)
- Custom tools, including "`tools: []` — All built-ins are removed. Claude can only use your MCP tools", tool naming `mcp__server__tool`, tool search and `alwaysLoad`: https://code.claude.com/docs/en/agent-sdk/custom-tools (HIGH)
- Hooks (PreToolUse deny, precedence "deny > defer > ask > allow"): https://code.claude.com/docs/en/agent-sdk/hooks (HIGH)
- Structured outputs (draft-07, `structured_output`, `error_max_structured_output_retries`): https://code.claude.com/docs/en/agent-sdk/structured-outputs (HIGH)
- Streaming input mode: https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode (HIGH)
- Hosting / subprocess model, `startup()` pre-warm, `settingSources: []`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`: https://code.claude.com/docs/en/agent-sdk/hosting (HIGH)
- Subscription usage for Agent SDK (personal use OK; status of credit-pool change): https://support.claude.com/en/articles/15036540 (MEDIUM, via search summary)
- Chrome: WebSockets in extension service workers (Chrome 116+, 20 s keepalive): https://developer.chrome.com/docs/extensions/mv3/tut_websockets (HIGH)
- Chrome `commands` API (global shortcuts `Ctrl+Shift+[0-9]`, `onCommand` only): https://developer.chrome.com/docs/extensions/reference/api/commands (HIGH)
- Chrome `debugger` API (available domains; detach on DevTools open): https://developer.chrome.com/docs/extensions/reference/api/debugger (HIGH); infobar behaviour from training knowledge (MEDIUM)
- NVDA Controller Client API: https://www.mintlify.com/nvaccess/nvda/development/advanced/controller-client (unofficial mirror, LOW-MEDIUM); TWBlue accessible_output2 wrapper showing `c_wchar_p` signature (LOW)
- Web Speech in background tabs: no authoritative source found (LOW). Spike required.
- Prior art for DOM extraction: Nanobrowser (Apache-2.0) `buildDomTree` approach, referenced in the source plan (not re-verified)

---
*Architecture research for: voice form agent for blind users (Blip)*
*Researched: 2026-10-16*

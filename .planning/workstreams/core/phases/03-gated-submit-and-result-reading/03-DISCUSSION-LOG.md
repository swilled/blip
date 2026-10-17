# Phase 3: Gated Submit and Result Reading - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md`.

**Date:** 2026-10-17
**Phase:** 03-gated-submit-and-result-reading
**Mode:** discuss (`--auto`)
**Areas discussed:** confirmation phrase policy, result evidence, audit privacy

---

## Confirmation phrase policy

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed literal phrase per action kind | Stable phrases independent of page-provided text; exact normalized words only, no “yes” or aliases. | ✓ |
| Phrase template with the page's action label | More target-specific, but page content would influence the phrase the user is asked to say. | |
| One shared phrase for every gated kind | Simplest phrase, but less distinct across different irreversible actions. | |

**Auto choice:** Fixed literal phrase per kind (recommended for deterministic matching and independence from untrusted labels).
**Selected table:** submit → “submit booking”; pay → “confirm payment”; delete → “confirm deletion”; send → “confirm sending”; cross-domain navigation → “leave this site”.
**Notes:** Keep the phrase match on the voice-role socket after completed speech and the one-second cooldown. This preserves GATE-08 and the existing protocol contract.

---

## Result evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit page evidence only | Confirm success only from captured confirmation/status content; read all field-linked errors; say unverified if neither appears. | ✓ |
| Infer success from navigation or completed click | Faster, but action dispatch/navigation does not show what the server accepted. | |
| Always report the result as unknown | Safest wording but discards the explicit confirmation and validation evidence already in the snapshot contract. | |

**Auto choice:** Explicit page evidence only (recommended to satisfy RES-01 without false success).
**Notes:** Error reports follow document order, include labels, and “what went wrong” repeats current errors.

---

## Audit privacy

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal structured local event | Record action kind, target id, outcome, and refusal code; omit page content, URL, values, transcript, and phrase. | ✓ |
| Include action labels and page URL | More convenient for humans, but can expose personal or untrusted page content in logs. | |
| Keep no audit entry | Smaller implementation, but violates the Phase 3 requirement that every attempt appears in the audit log. | |

**Auto choice:** Minimal structured local event (recommended by the existing payload-free logger).
**Notes:** No persistent audit database or UI is added for this phase.

---

## the agent's Discretion

- Grant representation and expiry scheduling, hash encoding, and extension proof details, subject to the fixed binding and one-use requirements.
- Deterministic bounded rules for explicit confirmation text and field/page errors.
- Browser-level interception mechanism for `form.submit()`, with the requirement unchanged and a direct-call browser test required.

## Deferred Ideas

- Voice UI sign-off, persistent audit history, model-based interpretation, and Phase 5 injection-warning scope stay outside Phase 3.

## External research applied

- WHATWG HTML Standard, form submission: `HTMLFormElement.submit()` bypasses the submit event; `requestSubmit()` participates in validation and fires a submit event. This is why the Phase 3 plan must test both APIs separately.

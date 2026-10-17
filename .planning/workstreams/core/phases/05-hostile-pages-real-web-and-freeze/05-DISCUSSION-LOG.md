# Phase 5: Hostile Pages, Real Web and Freeze - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md`.

**Date:** 2026-10-17
**Phase:** 5-hostile-pages-real-web-and-freeze
**Areas discussed:** injection fixture ownership, public form target, local startup, freeze

The user asked the assistant to use its judgment on the core track and authorized completing the remaining work. The workflow's auto mode therefore selected the recommended implementation defaults without asking new preference questions.

## Injection fixture and trust boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Core-owned local fixture | Add the seeded adversarial page under `tools/test-pages/public/` and exercise it locally | ✓ |
| Put fixture in voice-owned forms | Reuse `fixtures/forms/` even though Phase 2 assigned it to voice | |

**Auto-selected choice:** Core-owned local fixture, consistent with Phase 2 D-11.
**Notes:** Page text remains untrusted data; the deterministic grant and extension checks remain authoritative.

## Public form target

| Option | Description | Selected |
|--------|-------------|----------|
| Team-owned form selected by voice | Use the shared target with fixed synthetic, non-sensitive test values | ✓ |
| Choose an unrelated public form | Select a form without team ownership or an agreed destination | |

**Auto-selected choice:** Use the team's target. If its URL is missing at execution, finish local work and leave the external run pending until it is supplied.

## Startup and freeze

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated profile and reusable launcher | Start the server/browser with an isolated profile; invoke the voice client through its configured launch target | ✓ |
| User's regular browser profile | Reuse the normal profile and its extension state | |
| Push a freeze tag | Publish `demo-safe` to a remote | |

**Auto-selected choice:** Use a dedicated profile, keep voice UI ownership with voice, and create only a local `demo-safe` tag after checks pass.
**Notes:** No voice app exists in this checkout, so the exact command/URL is an external integration input.

## the agent's Discretion

- Research and choose deterministic injection detection and the additive protocol representation.
- Choose local test assertions, readiness checks, and the smallest compatible startup configuration hook.

## Deferred Ideas

- No additional product scope was introduced.

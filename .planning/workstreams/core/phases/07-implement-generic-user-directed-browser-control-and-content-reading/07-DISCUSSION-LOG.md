# Phase 7: Generic Browser Control and Content Reading - Discussion Log

> Audit trail for the user's implementation direction. Decisions are captured in `07-CONTEXT.md`.

**Date:** 2026-10-18  
**Phase:** 07-implement-generic-user-directed-browser-control-and-content-reading  
**Areas discussed:** generic scope, destination safety, content privacy, ownership

---

## Product scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add Gmail-specific commands | Hardcode the example service and behavior | |
| Build generic browser primitives | Use the user's email example as a capability story, not a site-specific integration | ✓ |

**User's choice:** The email story is an example of what Blip should be capable of; do not hardcode it.

## Destination and confirmation behavior

**User's choice:** Use the already captured Phase 6 decisions: derive destinations from the user's words, read back the resolved host, and wait for explicit confirmation. Important actions use context-specific exact spoken phrases; a bare “yes” does not authorize them.

## Content and model use

**User's choice:** Explicit requests to read, summarize, or draft may use bounded page content under the Phase 6 privacy boundary. Direct content reads remain local. No site credentials or sensitive values go to AGY.

## Implementation ownership

**User's choice:** Proceed with core implementation. Keep voice-owned files untouched and hold shared protocol/live-policy changes for written voice-owner review before merge.

## Deferred Ideas

- Multi-step reading, summarizing, drafting, editing, and sending is tracked in Phase 8.

## Link policy follow-up

After Phase 7 implementation, the user selected the same-origin safe-GET route and reported that their teammate was comfortable with it. Ordinary same-origin HTTP(S) GET links are now direct after a unique explicit user selection. Cross-origin and action-like links still need a target-specific spoken phrase. This choice applies only to browser link navigation and does not change button or form-action classification. The exact code and additive protocol diff remain unmerged pending written voice-owner review.

# Phase 8: Multi-Step Web Reading and Drafting - Discussion Log

> Audit trail for the user's product example and confirmation decision. Decisions are captured in `08-CONTEXT.md`.

**Date:** 2026-10-18  
**Phase:** 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions  
**Areas discussed:** workflow scope, page privacy, draft confirmation

---

## Workflow scope

**User's direction:** Support an end-to-end, multi-step web task such as opening a mail service, reading a recent message, summarizing on request, drafting a response, applying edits, and offering to send. This is a capability example; do not hardcode Gmail or the example's exact words.

## Send confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| A bare “yes” after a direct prompt | Treat the affirmative answer as permission to send | |
| Exact context-specific phrase | Ask for an exact phrase such as “send this email” tied to the current final draft | ✓ |

**User's choice:** Ask for a context-specific exact phrase for important actions. A bare “yes” does not authorize sending.

## Privacy and ownership

**Captured decisions:** Only explicitly requested, bounded, filtered page excerpts may reach tool-less AGY for summaries or drafts. Use synthetic fixtures, keep voice-owned files unchanged, and hold shared protocol/policy changes for written review before merge.

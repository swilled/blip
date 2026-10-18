# GATE-07 Warning Signal: Voice-Owner Contract Proposal

**Status:** Awaiting the voice-track owner's direct decision  
**Date prepared:** 2026-10-17

## Proposed additive fields

- `Snapshot.untrustedInstructionDetected?: boolean`
- `StatePayload.page.untrustedInstructionDetected?: boolean`

Both fields are optional booleans. `true` means the deterministic local detector found warning-worthy page text. `false` or absence means no warning signal is present. Older peers may omit the fields.

## Data and authority boundaries

- The fields carry only a boolean. They do not carry matched page text, phrases, URLs, query data, form values, or detector details.
- The signal is warning-only. It cannot authorize an action, change an action kind, grant permission, satisfy read-back, or satisfy confirmation.
- The voice track retains ownership of DLG-14 speech and UI. Core only provides the accepted warning boolean.

## Required decision

The voice-track owner must reply directly with one of these exact decisions:

- `APPROVE EXACT FIELDS` — explicitly covers both field paths above and the warning-only/data-minimizing semantics in this proposal.
- `DEFER` — leaves GATE-07 wire delivery and voice speech pending; local detector tests may proceed.

Core-owner approval, silence, or approval of a different shape does not authorize edits to `packages/protocol` or its consumers. Plan 05-05 remains locked until the voice-track owner's direct approval is recorded.

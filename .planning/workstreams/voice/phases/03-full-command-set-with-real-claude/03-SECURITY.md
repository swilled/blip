---
phase: 03-full-command-set-with-real-claude
slug: full-command-set-with-real-claude
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-18
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|-----------|-------------|---------------|
| Browser extension to voice server | The extension produces a page snapshot that the server treats as untrusted page data. | Page title, labels, field metadata, action metadata, and sensitivity markers; sensitive field values remain absent. |
| User speech to dialogue runner | Speech is classified before transcript emission and reducer/model routing. | Utterance text; sensitive or unknown-context utterances are withheld. |
| Dialogue reducer to speech and intent parser | Deterministic grammar may produce user-facing responses; unmatched requests receive value-free form metadata. | Tracked speech effects and sanitized metadata; no field values are sent to intent parsing. |
| Voice server to core GatePort | Confirmation and action authority remain in the connected core gate. | Action identity, kind, title, and digest; no page text grants authority. |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | I | Sensitive speech, spell/change handlers, transcript and intent routing | high | mitigate | Classify sensitive assignments; redact speech in transcripts; fail closed for missing/stale context and protected dialogue modes; allow sensitive-field handoff only through deterministic field resolution. | closed |
| T-03-02 | I | Profile context, intent request, logs, undo state | high | mitigate | Keep profile values in local deterministic context; project value-free metadata to intent parsing; omit sensitive values from undo and emitted frames. | closed |
| T-03-03 | T | Profile mapping and conditional undo | high | mitigate | Match only explicit autocomplete tokens and restore only when the live value still matches Blip's recorded write. | closed |
| T-03-04 | I | Orientation and sensitive-field templates | high | mitigate | Build speech from a current snapshot and mask sensitive values in read-back and orientation. | closed |
| T-03-05 | E | Injection-warning ordering and confirmation gate | high | mitigate | Warn before page responses; keep action authority in the deterministic core gate and preserve digest/read-back checks. | closed |
| T-03-06 | S | Guessed-label evidence | medium | mitigate | Disclose label confidence/source and sanitize page-derived spoken text. | closed |
| T-03-07 | E | Real-page warning and authoritative action gate | high | mitigate | Human I3 run confirmed warning before description and no gate on the seeded injection page; automated tests verify warning order and zero gate arms. | closed |
| T-03-08 | I | Profile and sensitive-field integration | high | mitigate | Redact sensitive utterances, omit field values from intent metadata, and verify safe profile skip behavior on the live form. | closed |
| T-03-SC | T | Package-manager installs | high | mitigate | No dependency installation was required; no package manifest or lockfile changed during Phase 3. | closed |

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 9 | 9 | 0 | gsd-security-auditor |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18

The live Microsoft Form run had no eligible profile matches and did not exercise a positive sensitive-field entry. Source review and runner tests cover those privacy boundaries. The connected local synthetic submit test is not evidence of external data submission.

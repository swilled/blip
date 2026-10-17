---
phase: "02"
slug: "fill-and-gated-submit-on-the-broken-form"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-17"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Chrome page to local bridge | The content bridge observes and fills only the local broken survey; it refuses clicks. | Form labels, field values, and bounded fill/select/focus actions. |
| Local bridge to mock server | The unpacked extension connects to the loopback demo server under its pinned extension origin. | Snapshots, action results, and page-change notifications. |
| Voice UI to dialogue runner | Voice commands and tracked speech events reach deterministic server-side dialogue logic. | User utterances, `speakId` completion, and sanitized form state. |
| Reset CLI to OS and repository | The local reset copies fictional profile data, verifies owned runner records, and starts the demo with argument arrays. | PID/run identity and fictional profile fields. |
| Dialogue runner to submit gate | The development gate remains fail-closed until core provides the grant-bound Executor. | A distinct confirmation attempt; no real submit action in this phase. |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | `broken.html` command text | Undeclared | mitigate | Fixture test ensures the page contains no confirmation command phrase. | closed |
| T-02-02 | Information disclosure | Restored form values | Undeclared | mitigate | Autocomplete is disabled; page reset covers load/pageshow; values are not persisted. | closed |
| T-02-03 | Elevation | Decoy submit control | Undeclared | mitigate | Decoy has no action kind; model selection keeps the gated primary action and fails closed. | closed |
| T-02-04 | Tampering | Out-of-scope core files | Undeclared | accept | Accepted risk AR-01 documents the ownership boundary; core-owned contracts and executor remain with core. | closed |
| T-02-05 | Tampering | Confirmation phrase matching | Undeclared | mitigate | Exact token-sequence matching; no alternative phrase set. | closed |
| T-02-06 | Information disclosure | Spoken templates | Undeclared | mitigate | Sensitive values are represented as entered/hidden and not interpolated. | closed |
| T-02-07 | Spoofing | Confirmation phrase source | Undeclared | mitigate | Confirmation phrase comes from the server confirmation event, not form text. | closed |
| T-02-08 | Tampering | Page labels in speech | Undeclared | mitigate | Page strings pass through bounded `cleanSpoken` sanitization. | closed |
| T-02-09 | Denial of service | Hostile text matching | Undeclared | mitigate | Input length bounds and token-list comparisons; no regex is built from labels. | closed |
| T-02-10 | Tampering | Field matching | Undeclared | mitigate | Longest-unique match; ambiguous labels ask instead of filling. | closed |
| T-02-11 | Tampering | Confirmation banner | Undeclared | mitigate | Banner uses `textContent`; tests reject HTML injection. | closed |
| T-02-12 | Spoofing | Voice UI confirmation | Undeclared | mitigate | UI contains no phrase-match authority; server owns confirmation decisions. | closed |
| T-02-13 | Repudiation | Stale confirmation banner | Undeclared | mitigate | Banner clears on matched grant end, socket close, and state transitions. | closed |
| T-02-14 | Information disclosure | Duplicate announcement | Undeclared | accept | Accepted risk AR-02 records the low-impact static, non-assertive banner announcement. | closed |
| T-02-15 | Tampering | Bare-value fill | Undeclared | mitigate | Fill guards, field-specific echo, and prior-value tracking constrain bare fills. | closed |
| T-02-16 | Information disclosure | Sensitive fields | Undeclared | mitigate | Sensitive fields cannot be voice-filled or echoed; tests use marker values. | closed |
| T-02-17 | Tampering | Label-based field hijack | Undeclared | mitigate | Longest-unique field resolution returns ambiguity rather than guessing. | closed |
| T-02-18 | Tampering | Select option values | Undeclared | mitigate | Options map values to labels; empty placeholders are excluded. | closed |
| T-02-19 | Elevation | Model reachability during confirmation | Undeclared | mitigate | Reducer blocks model effects while confirmation is active; fill is deterministic. | closed |
| T-02-20 | Repudiation/Information | Dialogue logging | Undeclared | mitigate | Dialogue package has no console logging of utterances or values. | closed |
| T-02-21 | Tampering | Bare yes or near-phrase submit | Undeclared | mitigate | Exact phrase matching is required; refusals are the default branch. | closed |
| T-02-22 | Spoofing | Self-confirmation during speech | Undeclared | mitigate | Tracked speak completion and the 1-second window block confirmation during/after speech. | closed |
| T-02-23 | Elevation | Confirmation without heard read-back | Undeclared | mitigate | Only uninterrupted, correlated read-back completion with unchanged digest arms confirmation. | closed |
| T-02-24 | Elevation | Model approving submission | Undeclared | mitigate | Model effects are excluded from read-back, confirmation, and execution states. | closed |
| T-02-25 | Tampering | Page text becoming confirmation phrase | Undeclared | mitigate | Phrase source is the confirmation event, never the page snapshot. | closed |
| T-02-26 | Tampering | Double redemption or replay | Undeclared | mitigate | Executing state ignores repeated utterances; gate redemption remains single-use. | closed |
| T-02-27 | Information disclosure | Sensitive values in read-back | Undeclared | mitigate | Read-back reports presence without revealing sensitive values. | closed |
| T-02-28 | Elevation | Runner issuing a gated click | Undeclared | mitigate | Act request types expose fill/select/focus only; no click kind is emitted. | closed |
| T-02-29 | Elevation | Development gate approving submit | Undeclared | mitigate | Stub gate has no success result and always refuses redemption. | closed |
| T-02-30 | Spoofing | Non-voice confirmation sender | Undeclared | mitigate | Runner requires the voice role; tests reject extension-role confirmation. | closed |
| T-02-31 | Tampering | Hostile page driving localhost | Undeclared | accept | Accepted risk AR-03 documents the loopback static demo surface; reset has no HTTP/socket trigger and core Host/Origin checks remain in force. | closed |
| T-02-32 | Spoofing | Confirmation timing | Undeclared | mitigate | Runner forwards correlated speech completion; exact 1-second boundary is tested. | closed |
| T-02-33 | Information disclosure | Runner logging | Undeclared | mitigate | Voice runner does not log utterance text, labels, or field values. | closed |
| T-02-34 | Denial of service | Gate or extension timeout | Undeclared | mitigate | Snapshot/action timeouts return failure and allow the serialized queue to continue. | closed |
| T-02-35 | Tampering | Core-owned files edited | Undeclared | accept | Accepted risk AR-04 records that core-owned submit integration remains a hand-off; this phase keeps its development gate fail-closed. | closed |
| T-02-36 | Tampering | Hostile page triggering reset | Undeclared | mitigate | Reset is a local CLI and adds no HTTP reset listener or socket message. | closed |
| T-02-37 | Elevation | Process spawn injection | Undeclared | mitigate | Reset uses argument arrays with no shell; tests assert the spawn contract. | closed |
| T-02-38 | Tampering | Stale or tampered PID record | Undeclared | mitigate | Reset validates PID, run token, repo root, and process command line before stopping; stale records are ignored. | closed |
| T-02-39 | Information disclosure | Demo profile contents | Undeclared | mitigate | Committed profile template uses fictional `example.com` and 555 data; working copy is gitignored. | closed |
| T-02-40 | Tampering | Stale values after page restore | Undeclared | mitigate | Page reload/pageshow resets values; navigation notifications invalidate runner state; human history/restore checks passed. | closed |

*Severity was not recorded in the Phase 2 plan threat tables. All mitigations were verified at ASVS L1. Any accepted threat that reopens is treated as critical until a severity is assigned.*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-02-04 | Core-owned protocol, policy, extension, and Executor changes remain outside this voice phase; voice-owned server dialogue code is in scope. | Phase 2 plan | 2026-10-17 |
| AR-02 | T-02-14 | A static, non-assertive banner can duplicate an announcement in some assistive-technology setups; impact is limited to repeated information. | Phase 2 plan | 2026-10-17 |
| AR-03 | T-02-31 | The loopback demo serves its static form and health check. It exposes no reset action; the bridge is pinned to its extension origin, and the core Host/Origin checks remain unchanged. | Phase 2 plan | 2026-10-17 |
| AR-04 | T-02-35 | Production gate/Executor integration is owned by core under HO-8; until it lands, the voice runner refuses submission. | Phase 2 plan | 2026-10-17 |

*Accepted risks follow the explicit `accept` dispositions in the Phase 2 plans. Their presence here closes the audit documentation requirement; AR-04 remains a human-needed integration dependency, not a claim that production submission works.*

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-17 | 40 | 40 | 0 | gsd-security-auditor; Codex |

The auditor initially reported the four `accept` dispositions as open because the phase accepted-risks log did not yet exist. They are now documented above; all other declared mitigations were verified in implementation. No summary contained an unregistered `## Threat Flags` entry.

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-17

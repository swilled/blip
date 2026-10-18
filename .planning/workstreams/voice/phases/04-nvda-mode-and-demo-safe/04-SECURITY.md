---
phase: "04"
slug: "nvda-mode-and-demo-safe"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-18"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Voice window to loopback server | The existing local WebSocket carries session speech settings and tracked items. | User utterance text, selected output mode, speakId |
| Server to NVDA Controller Client DLL | Form-derived speech can reach a local native output adapter only when safe completion is available. | Page-derived speech text and speakId |
| NVDA completion to GATE-08 state | Completion or cancellation controls when tracked speech is settled. | speakId and completion state |
| Command input to speech-rate state | Typed or recognized commands can change only the current window's bounded rate. | Command text and numeric rate |
| Public page to result speech | Page labels, validation text, and confirmation are untrusted observed data. | Page-derived strings and result snapshot |
| Demo profile/audio to public room | Rehearsal values, transcripts, and any recording may be audible or visible to attendees or an STT service. | Fictional values, audio, and local video |
| Venue network to offline fallback | Network failure changes the demo source and requires an explicit offline disclosure. | Site availability and presenter speech |
| Local fixture to browser | Offline copies must remain self-contained and must not submit to the live form. | Local HTML, values, and required-field messages |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Spoofing | NVDA completion / speakId | high | mitigate | `apps/server/src/voice/nvda.ts` and its tests fail closed when no safe per-item completion signal exists; DLL dispatch acceptance cannot settle a speakId. | closed |
| T-04-02 | Tampering | Output-mode transition | high | mitigate | `apps/voice/src/output-mode.ts` cancels and settles the old route before sending the new setting; focused tests cover exclusive modes and transition order. | closed |
| T-04-03 | Tampering | Local rate command dispatch | medium | mitigate | `apps/voice/src/speech-rate.ts` accepts only exact normalized faster/slower commands and clamps the session rate; tests cover bounds and ordinary-command pass-through. | closed |
| T-04-04 | Tampering | Page validation and result text | high | mitigate | Core result interpretation requires matching page-observed evidence, treats page strings as data, preserves the submit gate, and reports unverified outcomes when evidence is insufficient. The live-form rehearsal remains pending in `04-DEMO-RUNBOOK.md`. | closed |
| T-04-05 | Information Disclosure | Demo profile, transcript, and video | high | mitigate | `04-DEMO-RUNBOOK.md` requires fictional values, forbids personal data, keeps the video local and outside the repository, and requires inspection before freeze. Actual recording and review remain human-needed. | closed |
| T-04-06 | Denial of Service | NVDA, STT, live site, and venue network | medium | mitigate | The runbook specifies typed input after one clear STT miss, one hotspot attempt, exclusive speech fallback, and offline disclosure before local copies. Physical rehearsal remains human-needed. | closed |
| T-04-SC | Tampering | Package installs | high | mitigate | No packages were added in Phase 4; the executor followed the package-legitimacy stop rule. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`.*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party).* 

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 7 | 7 | 0 | GSD secure-phase review |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18

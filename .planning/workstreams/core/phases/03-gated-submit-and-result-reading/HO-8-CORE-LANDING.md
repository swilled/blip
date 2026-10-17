# HO-8 Core Landing

**Date:** 2026-10-17

## Implemented

- Every successfully sent speech has a tracked `speakId`. The server accepts `speak.done` only for the current ID, so delayed completion for stopped or repeated speech cannot satisfy the gated read-back barrier.
- Stop speech interrupts and gets its own tracked ID. Repeat speech gets a fresh tracked ID while preserving the original repeat text.
- Submit's sole fixed confirmation phrase is **“submit survey”**. The server still rejects aliases, old “submit booking” wording, bare yes, page-derived phrases, and model-authored approval.
- The gated Executor consumes the current Session's one-use grant into an opaque proof. Its GatePort is scoped to that same grant store and constructs a click only from the consumed proof, bound to grant, action kind, target, tab, and snapshot version. The independent extension guard remains active.

## Verification

- Root typecheck passed.
- Focused HO-8/gate/speech tests: 112 passed.
- Full unit suite: 81 files passed, 13 skipped; 870 tests passed, 22 skipped.
- Dedicated-profile Edge E2E: 13 files passed, 1 skipped; 23 tests passed, 1 skipped. After the final one-use GatePort guard, the gated-flow Edge scenario was rerun and passed (1/1).

## Repair-cache identity

The validated Phase 4 synthetic entry is keyed by origin `https://synthetic.example`, path `/form/contact`, and structural hash `synthetic-structure-v1`. Its cache filename identity is `70612d344025925053df33efb988dcb682161c4f73aa81d88ac3becd9ea244b6`.

This is not the demo form's cache identity. The current demo opens `/injection.html` from a test-page server on an ephemeral port, and Phase 4 validated no patch for that fixture. The exact demo repair-cache identity and prewarm remain unverified; no persistent cache was inspected or fabricated.

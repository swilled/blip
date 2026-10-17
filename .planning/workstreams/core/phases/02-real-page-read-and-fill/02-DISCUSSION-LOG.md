# Phase 2: Real Page Read and Fill - Discussion Log

> Audit trail only. Not consumed by downstream agents.

**Date:** 2026-10-16

## Areas presented
1. Read and fill engine
2. Extension dev setup
3. Page-change detection
4. Coverage limits

## User response
User selected all four areas and delegated the decisions: "do whatever you think best but just consider all of this". No per-question answers; Claude decided each point and recorded it in 02-CONTEXT.md.

## Decisions that depart from existing docs (flagged for the user)
- D-01: content-script DOM walk instead of CDP-primary (CLAUDE.md stack table). Matches the frozen protocol and REQUIREMENTS PAGE-01.
- D-08: plain esbuild instead of WXT (CLAUDE.md names it as the fallback).

## Alternatives considered
- CDP `Accessibility.getFullAXTree` + `Input.insertText` as primary: better accessible names and trusted events, but needs the `debugger` permission, the infobar flag, and a second capture path.
- WXT: typed entrypoints and HMR, but an extra framework for a two-file extension.
- Polling for page changes: simpler but misses the 1 s budget or wastes CPU; MutationObserver + structural hash chosen.

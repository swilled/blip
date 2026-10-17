# Contributing to Blip

Two developers, two tracks, one repo. Read this before your first commit. The setup steps are in [docs/TEAM-SETUP.md](docs/TEAM-SETUP.md); the plan is in [.planning/](.planning/).

## Tracks and ownership

| Track | Owner | Code | Planning |
|-------|-------|------|----------|
| `core` | Pranav | `packages/policy`, `apps/server` (hub, Executor, brain), `apps/extension`, `tools/fake-*`, `tools/repl` | `.planning/workstreams/core/` |
| `voice` | Teammate | `apps/voice`, `packages/dialogue`, `apps/server/src/voice/`, `dev/mock-server`, `fixtures/forms/` | `.planning/workstreams/voice/` |
| shared | both | `packages/protocol` (the contract) | `.planning/PROJECT.md`, `REQUIREMENTS.md`, `research/`, `config.json` |

Set your workstream once per machine: `setx GSD_WORKSTREAM core` (or `voice`), then restart your terminal and Claude Code.

**Outside your track:** ask first, then make the change in a small PR and tag the owner. Don't edit the other track's code silently.

## Branches and merges

- Branch from `main`: `core/<short-name>` or `voice/<short-name>`.
- Keep branches short-lived. Merge at least once a day and at every checkpoint.
- Open a PR for every merge, even small ones. The other person reviews anything that touches the shared contract or the safety gate.
- Rebase or merge `main` into your branch before opening the PR. Resolve conflicts on your side.
- Never force-push `main`. Never commit to `main` directly during the build.

## The shared contract (`packages/protocol`)

- It is frozen at M0 (~h0.75). After that, changes need both of you to approve in the PR.
- Change the zod schema and its fixtures in the same commit, and update `PROTOCOL.md` too.
- Both sides' mocks must still pass after the change. Run the fixture tests before pushing.
- Protocol changes are additive where possible. Renaming or removing a field is a breaking change, so announce it first.

## Safety invariants (don't weaken without both of you agreeing)

- The model never acts on the page. Claude is only called through tool-less structured-output calls. Every action goes through the Executor.
- Gated actions (submit, pay, delete, send, cross-domain) are default-deny. The confirm phrase is matched in code, and only on utterances from the voice socket.
- Agent SDK sessions keep the lockdown: `tools: []`, `settingSources: []`, `strictMcpConfig: true`, `permissionMode: "dontAsk"`, an empty working directory, `ANTHROPIC_API_KEY` stripped, and the tool list asserted at startup. Never `bypassPermissions`.
- Passwords and card numbers are never spoken, logged, or sent to the model.
- Any PR that touches the Executor, the policy gate, or the lockdown config needs the other person's review.

## Planning files

- Only `/gsd-*` commands write to `.planning/`. Don't hand-edit your workstream's `ROADMAP.md` or `STATE.md`.
- Shared planning files (`PROJECT.md`, master `REQUIREMENTS.md`, `CLAUDE.md`) change rarely. Say in the PR description when you change one.
- Never commit `.planning/active-workstream`. It's gitignored, and each machine sets its workstream via the environment instead.

## Commit messages

- Short imperative subject, under 72 characters: `fix: reject non-extension Origin on ws upgrade`.
- Use a prefix: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.
- Add a body only when the reason isn't obvious from the diff.

## Checkpoints

| When | Checkpoint | Done when |
|------|------------|-----------|
| ~h0.75 | M0 | Protocol frozen; both sides' fixtures pass |
| ~h6–8 | I1 | Voice UI talks to the real server; "what's here" works end to end |
| ~h12 | I2 | Full loop on the broken form, including the blocked submit |
| ~h20 | I3 | Real Claude, real public form, injection page blocked |
| ~h30 | Freeze | Tag `demo-safe`; only demo fixes after this |

Post a short status at each checkpoint: what's merged, what's blocked, what you need from the other person.

## Daily loop

1. `/gsd-progress`, then pull `main`.
2. Work on your branch with `/gsd-plan-phase N` → `/gsd-execute-phase N` → `/gsd-verify-work`.
3. Push your branch and open a PR. Note anything the other person must know.
4. Before you stop: merge what's ready, and tell the other person if you're blocked.

## Demo rules

- Don't run GSD sessions during judging. They share your subscription quota with Blip.
- Don't change the demo forms or the fictional profile without telling the other person; the reset script depends on them.

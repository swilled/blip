# Blip: Teammate Setup (voice track)

You own the **voice** track: the voice window, push-to-talk, speech in and out, NVDA mode, the dialogue logic (`packages/dialogue`) and the demo assets. Pranav owns **core**: the protocol, the server, the extension, the safety gate and the AGY Gemini provider. The full plan is in `.planning/workstreams/voice/ROADMAP.md`.

## 1. One-time setup (about 15 min)

1. **Install:** Node 24 LTS, Git, Chrome, [NVDA](https://www.nvaccess.org/download/), and the Antigravity CLI. Sign in through an interactive `agy` session with your own Antigravity subscription. Claude Code is still used for the GSD planning commands below.
2. **Verify the CLI:** run `agy --version` and `agy models`. The server uses the CLI's cached subscription login and Gemini Flash; no Gemini API key is required.
3. **Clone the repo:**
   ```powershell
   git clone https://github.com/swilled/blip.git
   cd blip
   ```
4. **Install GSD Core** (the planning tool we use):
   ```powershell
   npx @opengsd/gsd-core@latest --claude --global
   ```
   If you have the old `get-shit-done` installed, add `--config-dir "$HOME\.claude"`. That limits its cleanup to Claude Code and leaves Cursor and Copilot alone.
5. **Point GSD at your workstream.** Run this once, then restart your terminal and editor:
   ```powershell
   setx GSD_WORKSTREAM voice
   ```
   Every `/gsd-*` command now reads and writes only `.planning/workstreams/voice/`, so you and Pranav never edit the same planning files.
6. Restart Claude Code. Run `/gsd-progress` in the repo; it should report the **voice** workstream, Phase 1.

## 2. Your phases

| Phase | What you'll have at the end | Target |
|-------|-----------------------------|--------|
| 1. Spikes and push-to-talk loop | Hold a key while the form tab is focused, speak or type, and hear Blip answer, with a live transcript | h0–8 |
| 2. Fill and gated submit on the broken form | On the local broken survey form: fields read out, dictation, read-back, and submit only on "submit survey" | h6–12 |
| 3. Full command set with real AGY Gemini | Profile fill, spell, change, undo, "where am I", guessed-label and injection warnings, password handoff | h12–20 |
| 4. NVDA mode and demo-safe | Works with NVDA and on the real public form; fallback kit and backup video | h20–36 |

**Hours 0–3 are spikes.** Check whether speech recognition and speech synthesis still work when the voice window isn't focused, whether NVDA can be driven through its controller DLL, and which push-to-talk hotkey approach works. Record what you decide. Everything after depends on it.

## 3. Shared checkpoints with Pranav

| When | Checkpoint | You do |
|------|------------|--------|
| ~h0.75 | **M0**: protocol frozen | Review and approve `packages/protocol` together before either of you builds on it |
| ~h6–8 | **I1**: walking skeleton | Voice window connects to Pranav's real server; "what's here" works end to end |
| ~h12 | **I2**: gated submit works | Full loop on the broken form, including the blocked submit |
| ~h20 | **I3**: real AGY Gemini | Local synthetic form, label repair, injection page blocked |
| ~h30 | **Freeze** | Tag `demo-safe`; only demo fixes after this |

Until I1, build against your own `dev/mock-server`, so you're never waiting on Pranav.

## 4. Daily loop

```
/gsd-progress              where am I, what's next
/gsd-discuss-phase N       (optional) talk through the phase first
/gsd-plan-phase N          research + plan
/gsd-execute-phase N       build it (atomic commits)
/gsd-verify-work           check it actually works
```

Git:
- Work on `voice/<thing>` branches.
- Pull `main` often and merge small pieces often.
- Don't edit core-owned code (`apps/extension`, `packages/policy`, the server's Executor and brain) without asking. Changes to `packages/protocol` need both of you to agree.

## 5. How we work together

The full rules are in [CONTRIBUTING.md](../CONTRIBUTING.md). The short version: branch as `voice/<name>`, merge small and often, open a PR for each merge, and get Pranav's review on anything that touches `packages/protocol` or the safety gate.

## 6. Rules that protect the demo

- Blip never submits without a full read-back and the exact phrase. A bare "yes" never counts.
- The mic is off while Blip is speaking, so Blip can't confirm itself.
- Passwords and card numbers are never spoken, logged, or sent to the model.
- Don't run GSD sessions during judging. They share your subscription quota with Blip.

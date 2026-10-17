# Phase 2 browser runbook

This workspace builds the MV3 extension, runs it against the local fixture pages, and tests its page reads and actions in a dedicated browser profile.

## Build and automated checks

From the repository root, run:

```powershell
npm run typecheck
npm run ext:typecheck
npm run pages:build
npm run ext:build
npm test
npm run ext:smoke
```

The E2E tests are skipped unless `BLIP_E2E_BROWSER=1` is set. They resolve Chrome first and Edge second. Set `BLIP_BROWSER` to an executable path to choose another local browser. Each E2E run creates a unique child profile under `.chrome-profile/` and stops only the process it spawned.

```powershell
$env:BLIP_E2E_BROWSER = '1'
npx vitest run apps/extension/test/e2e --no-file-parallelism
Remove-Item Env:BLIP_E2E_BROWSER
```

The longer idle/outage check takes at least 115 seconds and is opt-in:

```powershell
$env:BLIP_E2E_BROWSER = '1'
$env:BLIP_E2E_LONG = '1'
npx vitest run apps/extension/test/e2e/idle.e2e.test.ts --no-file-parallelism
Remove-Item Env:BLIP_E2E_LONG
Remove-Item Env:BLIP_E2E_BROWSER
```

## Visible developer run

1. Build the extension and fixture bundle with `npm run ext:build` and `npm run pages:build`.
2. Start the app server with `npm run dev -- --no-fake-extension --fake-delay 0`.
3. In another terminal, run `npm run ext:chrome`. It opens the fixture site in the `.chrome-profile/ext-chrome` profile. Load `apps/extension/dist` as an unpacked extension once, then reload the extension after later builds.
4. Confirm readiness from the app server log: `connection bound role=extension`. There is no `/healthz` endpoint for extension readiness.

The current browser resolver selects `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` on this machine. Its recorded file version is Edge **155.0.4283.45**. Chrome is not present in the resolver's searched locations here. Use `BLIP_BROWSER` to override the choice.

## Coverage and known limits

- The real-browser matrix covers vanilla and React controlled fields, validation, maxlength read-back, readonly refusal, privacy redaction, gated action refusal, submit suppression, a 250-element wire cap, frames, shadow DOM, CSP, page changes, and reconnect behavior.
- The fixture reports are page-side evidence. Their event records include event names and target metadata, never typed values.
- Native text inputs, textareas, selects, radio groups, and checkboxes have write paths. File inputs, contenteditable fields, and custom ARIA widgets do not have a Phase 2 write adapter; they fail closed or return an unsupported-widget result.
- Same-origin and cross-origin frame read/fill succeeded in the local Edge 155 E2E run. A visible frame that cannot be captured still produces the bounded alert `Part of this page could not be read.`
- The wire snapshot sets `truncated` only when its 250-element cap cuts the element list. The approximately 8k-token model-prompt trim is planned for Phase 4 and is not inferred from a Phase 2 snapshot.

## Manual browser checklist

All manual rows remain **Pending** until someone completes them in the visible dedicated profile and records the result below. Automated headless results do not complete manual rows.

**Local browser/version:** pending manual run (automated E2E used Edge 155.0.4283.45)  
**M17 mode:** pending — record either real voice UI or REPL  
**Teammate Chrome/version for M18:** pending  
**I1 sign-off:** pending

| # | Manual check | Pass criterion | Status | Browser/version and notes |
|---|---|---|---|---|
| M1 | Load unpacked `apps/extension/dist` | Extension ID is `gipmmdbdhebfpfoabhdpkenijaljeclp`; server logs `connection bound role=extension`; no `ws origin rejected` line | Pending | |
| M2 | React form: fill name, then invalid email while the voice/REPL window has OS focus | Page validation appears and clears as values change; blur validation appears; reply uses the DOM value | Pending | |
| M3 | Vanilla form: fill the `maxlength=8` promo field with more than eight characters | DOM keeps eight characters; reply reports what the page accepted or safely reports that the value changed | Pending | |
| M4 | Set a select and radio option; check and uncheck the checkbox through REPL | Page state changes; checking an already checked box is a no-op | Pending | |
| M5 | Fill the implicit-Enter-submit fixture | Form does not submit and the page report shows no key events | Pending | |
| M6 | Reveal the delayed field | `/state` reports the new field within about one second without another utterance | Pending | |
| M7 | Navigate the SPA fixture with `history.pushState` | Form model updates to the new route and fields within about 1.1 seconds | Pending | |
| M8 | Stop the app server for 40 seconds, then restart it | Extension reconnects without a browser/page refresh; server logs a new extension bind | Pending | |
| M9 | Leave the extension idle for two minutes with the server running | Socket remains connected and no extra extension connection is bound | Pending | |
| M10 | Reload the extension without refreshing the page tab | Snapshot still works after content-script reinjection | Pending | |
| M11 | Try same-origin and cross-origin iframe fixtures | Frame fields have qualified IDs and fill works, or the bounded unavailable-frame alert is spoken | Pending | |
| M12 | Use the strict-CSP fixture | Field highlight outline remains visible | Pending | |
| M13 | Try the div button, cross-origin link, and submit-like buttons | Each gated click is refused and the page stays unchanged | Pending | |
| M14 | Focus a password/card field and type a test sentinel by hand | Replies and logs omit it; snapshot/model show only sensitivity and whether a value exists | Pending | |
| M15 | Open the 300-field fixture | Snapshot has at most 250 elements; `truncated` is true because the element cap cuts the page; fields precede links | Pending | |
| M16 | Keep a form tab open, switch to the voice page tab, then ask what is here | REPL still describes the form tab rather than the voice page | Pending | |
| M17 | Perform the I1 describe/fill checks through one voice client | Record the selected mode (real voice UI or REPL), spoken read-back, and result | Pending | |
| M18 | Teammate repeats connection and fill checks on Chrome | Record Chrome version and the connection/fill result before I1 sign-off | Pending | |

Record `Pass`, `Fail`, or `Not applicable` for every row and include the browser/version. Keep M18 pending until the teammate's Chrome repeat is recorded.

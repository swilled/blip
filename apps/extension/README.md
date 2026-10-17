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
Run the browser suite with `--no-file-parallelism` to avoid startup contention when several local browser instances would otherwise launch at once.

```powershell
$env:BLIP_E2E_BROWSER = '1'
npx vitest run apps/extension/test/e2e --no-file-parallelism
Remove-Item Env:BLIP_E2E_BROWSER
```

The longer idle/outage check takes at least 160 seconds and is opt-in:

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

M1-M17 were checked in the visible dedicated Edge profile and their results are recorded below. M18 was tested with the local Google Chrome for Testing build because stable Chrome is not installed. The browser E2E suite is run separately from the visible checks.

**Local browser/version:** Edge 155.0.4283.45 (visible dedicated profile)

**M17 mode:** REPL

**M18 browser/version:** Google Chrome for Testing 151.0.7922.34 (automated E2E)

**Core I1:** Pass through REPL; the shared voice UI sign-off remains with the voice track.

| # | Browser check | Pass criterion | Status | Browser/version and notes |
|---|---|---|---|---|
| M1 | Load unpacked `apps/extension/dist` | Extension ID is `gipmmdbdhebfpfoabhdpkenijaljeclp`; server logs `connection bound role=extension`; no `ws origin rejected` line | Pass | Edge 155.0.4283.45; dedicated visible profile loaded from `apps/extension/dist`; pinned service-worker ID and extension bind confirmed |
| M2 | React form: fill name, then invalid email while the voice/REPL window has OS focus | Page validation appears and clears as values change; blur validation appears; reply uses the DOM value | Pass | REPL terminal held OS focus; browser `document.hasFocus()` was false; invalid email error appeared/cleared, required-note blur error appeared, replies matched DOM values |
| M3 | Vanilla form: fill the `maxlength=8` promo field with more than eight characters | DOM keeps eight characters; reply reports what the page accepted or safely reports that the value changed | Pass | Edge 155.0.4283.45; REPL fill `ABCDEFGHIJK`; DOM kept `ABCDEFGH`; safe update error spoken |
| M4 | Set a select and radio option; check and uncheck the checkbox through REPL | Page state changes; checking an already checked box is a no-op | Pass | Edge 155.0.4283.45; room=`deluxe`, bed=`king`; checkbox toggled both ways and repeated check stayed true |
| M5 | Fill the implicit-Enter-submit fixture | Form does not submit and the page report shows no key events | Pass | Edge 155.0.4283.45; REPL filled `Search query`; page reports had no Enter key or submit event |
| M6 | Reveal the delayed field | `/state` reports the new field within about one second without another utterance | Pass | Real extension state frame changed `fieldCount` 0→1 in 84 ms after reveal; no utterance sent |
| M7 | Navigate the SPA fixture with `history.pushState` | Form model updates to the new route and fields within about 1.1 seconds | Pass | Real extension state moved to `/spa/step-two` in 87 ms; `Contact email` fill then succeeded via voice client |
| M8 | Stop the app server for 40 seconds, then restart it | Extension reconnects without a browser/page refresh; server logs a new extension bind | Pass | Edge 155.0.4283.45; server rebound extension after 40 seconds; same SPA tab and entered email value persisted |
| M9 | Leave the extension idle for two minutes with the server running | Socket remains connected and no extra extension connection is bound | Pass | Edge 155.0.4283.45; 120 seconds idle, no server-side extension close or extra bind |
| M10 | Reload the extension without refreshing the page tab | Snapshot still works after content-script reinjection | Pass | Reloaded unpacked extension via `chrome.runtime.reload()`; same tab/timeOrigin/value remained, then voice fill read back `reload@example.com` |
| M11 | Try same-origin and cross-origin iframe fixtures | Frame fields have qualified IDs and fill works, or the bounded unavailable-frame alert is spoken | Pass | Edge 155.0.4283.45; live voice-role fills succeeded in both same-origin and cross-origin frames with DOM read-back |
| M12 | Use the strict-CSP fixture | Field highlight outline remains visible | Pass | Edge 155.0.4283.45; strict-CSP fill displayed the cyan border and dark outline (`.chrome-profile/gsd-next-m12-csp.png`) |
| M13 | Try the div button, cross-origin link, and submit-like buttons | Each gated click is refused and the page stays unchanged | Pass | Visible isolated Edge; Book room, Pay now, Privacy policy, and Show details returned `gate-required` with no new page events |
| M14 | Focus a password/card field and type a test sentinel by hand | Replies and logs omit it; snapshot/model show only sensitivity and whether a value exists | Pass | Visible Edge; focused-field keyboard input (CDP) entered synthetic sentinels; model kept only sensitivity/hasValue and speech, logs, reports omitted them |
| M15 | Open the 300-field fixture | Snapshot has at most 250 elements; `truncated` is true because the element cap cuts the page; fields precede links | Pass | Visible Edge; 250 elements, truncated=true, Field 250 included, Field 251 omitted, field category precedes links |
| M16 | Keep a form tab open, switch to the voice page tab, then ask what is here | REPL still describes the form tab rather than the voice page | Pass | Edge 155.0.4283.45; Blip `/healthz` tab was active, voice reply still described Hotel booking. Used the local Blip page as the voice-tab stand-in because Core has no voice UI. |
| M17 | Perform the I1 describe/fill checks through one voice client | Record the selected mode (real voice UI or REPL), spoken read-back, and result | Pass | REPL; described “Hotel booking” and spoke “Full name is now Ada Lovelace.” |
| M18 | Repeat connection and fill checks on Chrome | Extension connects and describe/fill completes with DOM read-back | Pass | Google Chrome for Testing 151.0.7922.34; serial browser E2E passed 20 tests, including production-origin extension binding and real voice-role describe/fill/read-back |

Record `Pass`, `Fail`, or `Not applicable` for every row and include the browser/version. The optional long idle/outage E2E is skipped in the standard browser suite; M8 and M9 were separately checked in visible Edge.

---
status: complete
phase: 02-real-page-read-and-fill
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md, 02-09-SUMMARY.md, 02-10-SUMMARY.md, 02-11-SUMMARY.md, 02-12-SUMMARY.md, 02-13-SUMMARY.md, 02-14-SUMMARY.md, 02-15-SUMMARY.md, 02-16-SUMMARY.md, 02-17-SUMMARY.md, 02-18-SUMMARY.md, 02-19-SUMMARY.md, 02-20-SUMMARY.md
started: 2026-10-17T04:55:30Z
updated: 2026-10-17T05:30:46Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Start the app and dedicated browser profile from a clean app process. The server starts without errors, the extension connects as `role=extension`, and a basic page-description request returns data from the live form.
result: pass
verified_by: automated agent run (`npm run ext:smoke` bound the production extension in a fresh isolated Edge profile; `voice-path.e2e.test.ts` returned “Hotel booking” from the live fixture and confirmed the extension-connected state)

### 2. M1 Load the unpacked extension
expected: The dedicated profile shows the pinned extension ID, the server logs `connection bound role=extension`, and there is no origin rejection.
result: pass
verified_by: agent in visible Edge 155.0.4283.45 dedicated profile; loaded `apps/extension/dist`, confirmed service-worker target `gipmmdbdhebfpfoabhdpkenijaljeclp`, and observed `connection bound role=extension` with no origin rejection

### 3. M2 React form and validation
expected: With the voice/REPL window focused, filling name and invalid email shows and clears validation correctly; blur validation appears and replies use DOM values.
result: pass
verified_by: agent using the actual REPL while its dedicated terminal held OS focus; React page reported `document.hasFocus() === false`, invalid-email validation appeared, cleared after valid email, and required-note blur validation appeared; replies matched the DOM values

### 4. M3 Maxlength read-back
expected: Filling the eight-character promo field with a longer string leaves eight characters in the DOM, and the reply reports the accepted value or safely reports a change.
result: pass
verified_by: agent filled `ABCDEFGHIJK` through REPL in the visible Edge fixture; DOM retained `ABCDEFGH`, and the reply safely reported the update could not be completed

### 5. M4 Native select, radio, and checkbox actions
expected: Select and radio values change; checking and unchecking the checkbox changes page state; checking an already checked box is a no-op.
result: pass
verified_by: agent used REPL in the visible Edge fixture; room=`deluxe`, bed=`king`, breakfast checked then unchecked, then repeated check kept it true

### 6. M5 Enter does not submit
expected: Filling the implicit-Enter fixture does not submit the form and produces no key events.
result: pass
verified_by: agent filled `Search query` in visible Edge through the foreground REPL; fixture page reports showed input/change/focus events and no Enter key or submit event

### 7. M6 Delayed field reveal
expected: The newly revealed field appears in `/state` within about one second without another utterance.
result: pass
verified_by: agent observed voice-role state frames with no utterances; `fieldCount` changed from 0 to 1 84 ms after the fixture's reveal report

### 8. M7 SPA navigation refresh
expected: After `history.pushState`, the form model updates to the new route and fields within about 1.1 seconds.
result: pass
verified_by: agent triggered the fixture's `history.pushState`; state changed to `/spa/step-two` in 87 ms, then filling `Contact email` succeeded and spoke the DOM value

### 9. M8 Server outage reconnect
expected: After stopping the app server for 40 seconds and restarting it, the extension reconnects without a browser or page refresh.
result: pass
verified_by: agent stopped the dev server for 40 seconds, restarted on 7777, and observed a new extension bind; the same Edge tab remained at `/spa/step-two` with its `ada@example.com` value intact

### 10. M9 Two-minute idle stability
expected: After two minutes idle with the server running, the socket stays connected and there is no extra extension bind.
result: pass
verified_by: agent left the visible Edge extension connected and idle for 120 seconds; server session remained open with no extension close or additional bind event

### 11. M10 Extension reload without page refresh
expected: Reloading the extension while leaving the page tab open restores snapshot behavior without refreshing that tab.
result: pass
verified_by: agent invoked `chrome.runtime.reload()` on the unpacked extension service worker; server logged close/rebind, the same page target retained its `performance.timeOrigin` and entered value, and a post-reload voice fill read back successfully

### 12. M11 Same-origin and cross-origin frames
expected: Frame fields have qualified IDs and fill works, or the bounded unavailable-frame alert is spoken.
result: pass
verified_by: agent filled `Message for this frame` through the live voice role in both same-origin and cross-origin iframe fixtures; both replies matched the DOM values

### 13. M12 Strict-CSP highlight
expected: The field highlight outline remains visible on the strict-CSP fixture.
result: pass
verified_by: agent filled the strict-CSP form in visible Edge; captured screenshot `.chrome-profile/gsd-next-m12-csp.png` shows the cyan border and dark outline around the field

### 14. M13 Gated clicks are refused
expected: Div buttons, cross-origin links, and submit-like buttons are refused and the page remains unchanged.
result: pass
verified_by: agent used a visible isolated Edge profile and real extension act channel; Book room, Pay now, Privacy policy, and Show details each returned `gate-required` with no page-event changes

### 15. M14 Sensitive-value privacy
expected: Password/card values are omitted from replies and logs; snapshots show only sensitivity and whether a value exists.
result: pass
verified_by: agent used focused-field browser keyboard input in visible Edge; model retained only `sensitive` and `hasValue`, while speech, model, server logs, and page reports omitted both sentinels

### 16. M15 Large-page cap
expected: The 300-field fixture returns at most 250 elements, sets `truncated: true` at the wire cap, and lists fields before links.
result: pass
verified_by: agent used the visible Edge fixture and real extension; the 300-field page returned exactly 250 elements, `truncated: true`, fields before links, with Field 250 included and Field 251 excluded

### 17. M16 Focused page targeting
expected: With a form tab open, switching to the voice page tab still makes “what is here” describe the form tab.
result: pass
verified_by: agent kept the Vanilla form tab open, activated Blip's `127.0.0.1:7777/healthz` tab, confirmed it was active, and received the same Hotel booking description through the voice client; health page stood in for the unavailable voice UI

### 18. M17 I1 through a voice client
expected: One voice client completes describe/fill and speaks back the DOM value; record whether this used the real voice UI or REPL.
result: pass
verified_by: agent using the actual typed REPL with the real Edge extension and live vanilla fixture; REPL described “Hotel booking” and spoke “Full name is now Ada Lovelace.” Mode: REPL

### 19. M18 Chrome repeat
expected: The extension connects on Chrome and completes describe/fill with DOM read-back; record the browser version.
result: pass
verified_by: agent run on Google Chrome for Testing 151.0.7922.34; serial real-browser E2E suite passed 20 tests, including production-origin extension binding and the real voice-role describe/fill/read-back path. The requested self-test was run in the local Chrome-for-Testing build because stable Chrome is not installed.

## Summary

total: 19
passed: 19
issues: 0
pending: 0
skipped: 0
blocked: 0

## Additional Verification

- `npm test`: 61 files passed, 638 tests passed, 19 skipped (live-browser tests are opt-in by default).
- `npm run typecheck` and `npm run ext:typecheck`: both passed.
- Real-browser E2E with Google Chrome for Testing 151.0.7922.34 and `--no-file-parallelism`: 10 files passed, 20 tests passed, 1 optional long idle/outage test skipped. M8 and M9 were separately verified manually in Edge 155.0.4283.45.
- Enabling all browser E2E files in parallel caused startup timeouts under concurrent browser load; the serial run passed.

## Gaps

None.

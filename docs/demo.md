# Local voice demo

The demo uses the Phase 3 dialogue reducer connected to core's refresher, one-use grant store, and gated Executor. The fake brain is the offline default; use AGY for I3. AGY runs Gemini through the signed-in Antigravity CLI subscription. Both modes open the local synthetic survey and use repository-local browser profiles. No public URL or real form data is involved.

## One-time extension setup

The extension must be loaded once into the demo's dedicated browser profile:

1. Run `npm run demo -- --brain=fake` and leave the dedicated browser window open. If the extension is not installed, the launcher prints `DEMO_SETUP_REQUIRED` and keeps waiting.
2. In that window, open `chrome://extensions` or `edge://extensions` and turn on Developer mode.
3. Choose **Load unpacked** and select this repository's `apps/extension/dist` directory.
4. Wait for `DEMO_READY`. The voice window opens after the extension connects.

The launcher uses `.chrome-profile/demo` for the extension and `.chrome-profile/demo-voice` for the voice UI. It does not read or reuse the normal browser profile and does not close unrelated browser windows. After rebuilding the extension, reload it from the extensions page in the dedicated profile.

## I2: connected gate with the fake brain

Start the real extension, reducer, local survey and voice UI:

```powershell
npm run demo -- --brain=fake
```

Use fictional values in the Community Survey. Ask Blip to fill the required name and email fields, then say **submit survey**. Wait for the read-back and confirmation prompt to finish, and say the exact phrase **submit survey**. The connected extension should submit once; the page reports that the local submit was observed and that no data was sent. The core Executor checks the read-back speech ID, cooldown, current page and one-use grant before dispatch.

`--smoke` checks only server, extension, voice-window and selected-page readiness. It does not exercise speech or the gate.

## I3: Gemini through the AGY subscription with the same connected gate

Install the Antigravity CLI and sign in once using your Antigravity account. Then run the same local flow with the AGY brain:

```powershell
npm run demo -- --brain=agy
```

This starts two persistent headless `agy` CLI sessions using Gemini Flash: one for intent routing and one for label repair. They use the CLI's cached subscription login, not a Gemini API key. Each role gets a generated `tools: []` agent and an isolated temporary working directory; any reported tool execution stops the role. Utterances the reducer does not handle are routed to the model. Model output cannot arm or redeem a gated action; confirmation still follows the reducer and core Executor path. If CLI startup or authentication fails, the launcher exits instead of silently switching to fake mode.

Use the synthetic survey only. I3 evidence should include a successful Gemini-routed turn and the connected-gate submit flow; `--smoke` is not that evidence.

## Browser selection and optional voice URL

The launcher uses Chrome first, then Edge. Set `BLIP_BROWSER` to choose an executable:

```powershell
$env:BLIP_BROWSER = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
npm run demo -- --brain=fake
```

The built-in voice client is served from this checkout. To connect a different local voice client, set `BLIP_VOICE_URL` to an HTTP URL on `127.0.0.1` or `localhost` with an explicit port:

```powershell
$env:BLIP_VOICE_URL = "http://127.0.0.1:5173/"
npm run demo -- --brain=fake
```

The launcher allowlists only that exact loopback origin. HTTPS, remote hosts, credentials, non-HTTP schemes and URLs without an explicit port are rejected.

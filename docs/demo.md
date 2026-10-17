# Local demo launcher

The core demo starts the fake brain, the loopback test-page host, and a browser in the repository-local `.chrome-profile/demo` profile. It opens the synthetic injection fixture at `http://127.0.0.1:<port>/injection.html`. The launcher never uses the browser's normal profile and never passes the removed `--load-extension` switch.

## One-time unpacked extension setup

The extension must be loaded once into this dedicated profile:

1. Run `npm run demo -- --brain=fake` and leave its dedicated browser window open. If the extension is not installed, the launcher prints `DEMO_SETUP_REQUIRED` and keeps waiting.
2. In that window, open `chrome://extensions` (or `edge://extensions`) and turn on Developer mode.
3. Choose **Load unpacked** and select this repository's `apps/extension/dist` directory.
4. Confirm the launcher reports `DEMO_READY` after the app server observes the extension connection. The running command continues into the demo.

The command creates the dedicated profile automatically. Loading the extension in another browser profile does not satisfy readiness for this launcher. After rebuilding the extension, open the extensions page in the same dedicated profile and reload the unpacked extension.

## Run the local demo

Start a persistent local rehearsal with the fake brain:

```powershell
npm run demo -- --brain=fake
```

Run the isolated smoke and exit after the real unpacked extension connects to the server:

```powershell
npm run demo -- --brain=fake --smoke
```

The smoke succeeds only after both the server observes an extension connection and the dedicated profile contains that extension. A successful run prints:

```text
BLIP_DEMO_SMOKE=PASS extension-connected=true profile=dedicated
```

If the extension is absent, the launcher prints `DEMO_SETUP_REQUIRED`, exits with code 2, and does not print the success marker. If the dedicated extension is present but fails to connect, it prints `DEMO_EXTENSION_TIMEOUT`. Persistent mode prints `DEMO_READY` only after extension-connected readiness; press Ctrl+C to stop the owned browser and local servers.

## Browser selection

The launcher uses the existing browser resolver: Chrome first, then Edge. Set `BLIP_BROWSER` to choose a specific compatible executable. For example, in PowerShell:

```powershell
$env:BLIP_BROWSER = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
npm run demo -- --brain=fake
```

Every launch uses `.chrome-profile/demo`; the launcher does not read or reuse the normal browser profile. It opens the local fixture first. Voice is opened only after extension readiness and only when an explicit local target is configured.

## Optional voice client

This checkout has no voice client (`apps/voice` is absent). Without `BLIP_VOICE_URL`, the launcher reports that voice is not configured and does not create a substitute UI. PROT-03 voice-window evidence remains pending.

When the voice client is available, set `BLIP_VOICE_URL` to its HTTP URL on `127.0.0.1` or `localhost`, with an explicit port. The launcher allowlists only that URL's origin and opens that URL after the extension connects:

```powershell
$env:BLIP_VOICE_URL = "http://127.0.0.1:5173/"
npm run demo -- --brain=fake
```

Remote hosts, HTTPS, non-HTTP schemes, credentials, and URLs without an explicit port are rejected because the current server role allowlist accepts exact loopback HTTP origins only. `--brain=claude` is available explicitly, but the fake brain is the offline default.

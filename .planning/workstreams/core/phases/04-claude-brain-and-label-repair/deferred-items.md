# Deferred Items

## 04-09 verification command expands to the full server suite

- **Observed:** `npm test -- --project @blip/server -- apps/server/test/claude-sdk-live-check.test.ts` runs all 28 server test files in this workspace. The unrelated `apps/server/test/cli.test.ts` case `--dev --port 0 prints one listening line and serves a no-Origin voice client` intermittently exceeded its 5-second timeout on two runs.
- **Verification:** The direct focused verifier suite passed 12/12 tests. The final prescribed run passed 336/336 tests after two earlier timeout observations.
- **Disposition:** Deferred as unrelated to the approved verifier change; no CLI test or implementation changes were made.

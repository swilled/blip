---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-11
check: synthetic-demo-repair-cache
phase05RepairCacheApproval: approve-05-11-synthetic-survey-cache
approvalUsed: true
claimConsumed: true
preflightPassed: true
status: live-passed
maxSeconds: 900
maxDispatches: 8
stage: complete
elapsedMs: 11037
dispatchTotal: 3
bootstrapDispatches: 2
promptDispatches: 1
intentDispatches: 1
repairDispatches: 2
intentEmptyToolsAccepted: true
repairEmptyToolsAccepted: true
extensionConnected: true
voiceConnected: true
exactDemoIdentity: true
cacheIdentitySha256: ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2
repairedLabelCount: 2
cacheFilePresent: true
reloadedFromCache: true
dispatchesUnchangedOnCacheReload: true
---

# Phase 5 Synthetic Demo Repair Cache Live Check

One bounded, one-use Claude check against the self-hosted synthetic survey only. The report stores no prompts, page prose, model output, field values, credentials, account state, or provider errors.

- Exact page: http://127.0.0.1:7791/demo-form.html
- Cache directory: .chrome-profile/demo-repair-cache-v1 (the launcher's dedicated cache)
- Dispatches: 3/8; bootstrap 2; prompts 1.
- Both extension and voice WebSocket roles were connected during the check; these flags are captured before the harness closes its owned browser/socket resources.
- Result: live-passed; final stage complete; elapsed 11037 ms.
- Exact identity key: ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2.

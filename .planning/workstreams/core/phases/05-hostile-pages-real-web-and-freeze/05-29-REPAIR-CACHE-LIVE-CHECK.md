---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-29
check: synthetic-demo-repair-cache
phase05RepairCacheApproval: approve-05-29-synthetic-survey-cache
authorizationBasis: user-standing-authorization-for-bounded-synthetic-checks
approvalUsed: true
claimConsumed: true
preflightPassed: true
status: live-passed
maxSeconds: 900
maxDispatches: 8
stage: complete
elapsedMs: 15931
dispatchTotal: 2
bootstrapDispatches: 2
promptDispatches: 0
intentDispatches: 1
repairDispatches: 1
intentNoToolsAgentAccepted: true
repairNoToolsAgentAccepted: true
intentStartupFailure: none
repairStartupFailure: none
extensionConnected: true
voiceConnected: true
exactDemoIdentity: true
cacheIdentitySha256: ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2
repairedLabelCount: 2
repairStatus: repaired
repairStatusTrace: repaired
repairDiagnostics: repair-cache-hit
pageChangedCount: 1
cacheFilePresent: true
cacheRefreshForced: false
cacheFileUpdated: false
reloadedFromCache: true
dispatchesUnchangedOnCacheReload: true
agyIntentTurnCompleted: false
trackedReadbackObserved: false
exactConfirmationAccepted: false
submitCount: 0
userUtteranceCount: 0
---

# Phase 5 Synthetic Demo Repair Cache Live Check

One bounded, one-use AGY CLI check against the self-hosted synthetic survey only. The report stores no prompts, page prose, model output, field values, credentials, account state, or provider errors.

- Exact page: http://127.0.0.1:7791/demo-form.html
- Cache directory: .chrome-profile/demo-repair-cache-v1.
- Dispatches: 2/8; bootstrap 2; prompts 0.
- Result: live-passed; final stage complete; elapsed 15931 ms.
- Exact identity key: ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2.

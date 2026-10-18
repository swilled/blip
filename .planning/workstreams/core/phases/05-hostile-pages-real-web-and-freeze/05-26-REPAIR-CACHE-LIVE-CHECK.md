---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-26
check: synthetic-agy-i3-and-repair-cache
phase05RepairCacheApproval: approve-05-26-synthetic-survey-cache
authorizationBasis: user-standing-authorization-for-bounded-synthetic-checks
approvalUsed: true
claimConsumed: true
preflightPassed: true
status: live-passed
maxSeconds: 900
maxDispatches: 8
stage: complete
elapsedMs: 24144
dispatchTotal: 4
bootstrapDispatches: 2
promptDispatches: 2
intentDispatches: 2
repairDispatches: 2
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
repairStatusTrace: pending,repaired
repairDiagnostics: repair-started,repair-applied,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit,repair-cache-hit
pageChangedCount: 2
cacheFilePresent: true
reloadedFromCache: true
dispatchesUnchangedOnCacheReload: true
agyIntentTurnCompleted: true
trackedReadbackObserved: true
exactConfirmationAccepted: true
submitCount: 1
userUtteranceCount: 7
---

# Phase 5 AGY I3 and Repair Cache Live Check

One bounded, one-use AGY CLI check against the self-hosted synthetic survey only. The report stores no prompts, page prose, model output, field values, credentials, account state, or provider errors.

- Exact page: http://127.0.0.1:7791/demo-form.html
- Cache directory: isolated temporary directory.
- Dispatches: 4/8; bootstrap 2; prompts 2.
- Result: live-passed; final stage complete; elapsed 24144 ms.
- Exact identity key: ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2.
- AGY intent roundtrip completed: true.
- Tracked read-back observed: true.
- Exact confirmation accepted: true.
- Local submit count: 1.
- Synthetic voice utterances: 7/8.

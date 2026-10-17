---
phase04DiagnosticApproval: approve-04-12-synthetic-diagnostics
approvalUsed: true
authorizedBy: user explicitly authorized repeated bounded synthetic checks on 2026-10-17
maxSeconds: 900
maxDispatches: 8
data: fixed synthetic inputs only
---

# Phase 04-12 SDK startup diagnostics

This fresh one-use plan-specific approval is covered by the user's authorization for repeated bounded synthetic checks. It does not permit credential/auth inspection, environment-value inspection, real page/user data, tool execution, or weakening the empty-tool startup gate.

## Result

Status: `failed`  
Stage: `initialization`  
Elapsed: `4027 ms`  
Prompt counts: intent `0`, repair `0`, total `0`  
Bootstrap counts: intent `1`, repair `0`, total `1`  
Dispatch counts: intent `1`, repair `0`, total `1`  
Intent startup: first/last event `system_init`; event count `1`; init received `true`; empty tools accepted `true`; bootstrap result accepted `false`; failure category `bootstrap_result_rejected`  
Repair startup: no events or milestones  
Tool count: unavailable  
Subsequent prompts after block: `0`

The fixed synthetic intent bootstrap result reached local validation and was rejected. Its content was discarded and is not recorded. No ordinary probe or repair bootstrap ran. The plan-scoped approval is consumed; `.used` remains as a tombstone.

---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-10-17T19:08:46.494Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | deviation | apps/server/src/voice/dialogue-runner.ts |  | Sensitive handoff utterances must be redacted before transcript frames and excluded from model intent parsing. | open |  | 2026-10-17T19:08:46.494Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "03",
    "file": "apps/server/src/voice/dialogue-runner.ts",
    "line": null,
    "description": "Sensitive handoff utterances must be redacted before transcript frames and excluded from model intent parsing.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-17T19:08:46.494Z",
    "resolved_at": null,
    "milestone": null
  }
]
````

---
status: resolved
trigger: "Microsoft Forms is readable, but Blip does not correctly identify which questions are required."
created: 2026-10-18
updated: 2026-10-18
---

## Symptoms

expected: Blip reports the current required status for each Microsoft Forms question accurately, using page-observed markers and labels.
actual: The user reports that Blip reads the form but labels questions with visible required markers as optional/not required. An earlier run also reported "no required fields are empty" despite visible markers; a later run listed Employment type, Department, Leave type, Leave date, and Return date as required.
errors: No runtime error was reported.
timeline: Reproduced during the Phase 4 Microsoft Forms check on 2026-10-18, after speech repairs.
reproduction: Open the supplied team-owned Microsoft Form in the dedicated form profile and ask Blip "what's required?"; compare its field names/status with the visible required markers. Do not submit the form.

## Current Focus

bug_class: bohrbug
hypothesis: Microsoft Forms exposes mandatory state as an empty question-level requiredStar note with aria-label="Required to answer"; requiredStateOf only sees control attributes and visible text in label candidates, so it drops the note and emits required=false.
test: Revert-and-reconfirm, extension suite, typecheck, and build passed. Ask for the live Microsoft Forms required-status check against the newly built extension.
expecting: Blip reports Employment type, Department, Leave type, Leave date, and Return date as required; optional questions remain optional; no submission is attempted.
next_action: Resolved after the user confirmed the updated build reported the required questions correctly and omitted optional questions; no submission was attempted.

reasoning_checkpoint:
  hypothesis: "A Microsoft Forms question-level requiredStar marker is outside the control's attributes and textContent label candidates, so requiredStateOf returns none and the baseline FormModel announces optional."
  confirming_evidence:
    - "User reports visible required questions were spoken as optional/not required."
    - "requiredStateOf currently recognizes only control required, control aria-required=true, and an asterisk in a label candidate; the wire type has no question-marker field."
    - "Microsoft Forms DOM examples use an empty data-automation-id=requiredStar note with aria-label='Required to answer'; textContent-based label extraction cannot read that aria-label."
  falsification_test: "Reapplying the bounded marker predicate must make the target test pass without changing the adjacent optional result."
  fix_rationale: "Read the recognized Forms marker only from the control's nearest questionItem; this preserves native/ARIA/asterisk precedence and prevents markers in adjacent questions from leaking."
  blind_spots: "The supplied form's client-rendered live DOM was not accessible in this session; the fixture is based on the documented Forms question structure, not a capture from the user's exact form."
  candidate_causes:
    - "code: requiredStateOf omits question-container metadata when the marker is separate from a control's label candidates."
    - "environment: a stale extension build or another browser profile could still be running older required-state logic."
    - "data: the live form can use localized question markup; marker recognition relies on Microsoft's requiredStar automation identifier, not English marker text."
  and_gate: "No; the missing extraction predicate alone explains the reproduced failure. A stale extension build is an alternate cause, not a required co-condition."

## Eliminated

## Evidence

- timestamp: 2026-10-18
  checked: User report and previous Microsoft Forms test notes
  found: The form is identified/readable; required status is the failing part. Current output calls visibly required questions optional/not required. Prior reported expected required labels were Employment type, Department, Leave type, Leave date, and Return date. Earlier output said no required fields were empty despite visible markers.
  implication: Investigate page snapshot metadata and the command's meaning separately; do not alter submit gating or submit the live form.

- timestamp: 2026-10-18
  checked: `apps/extension/src/content/required.ts`, `labels.ts`, and `walk.ts`
  found: Required state currently recognizes native `required`, `aria-required=true`, or an asterisk in a candidate label. Native custom widgets rely on their accessible attributes and the associated label candidates; no Microsoft Forms-specific adapter is present.
  implication: A Microsoft-specific marker absent from those attributes/candidates could be lost before it reaches the model. Confirm against the live DOM before implementing.

- timestamp: 2026-10-18
  checked: Connected browser inventory and repo fixture search
  found: CUA reports no available browsers; repo contains only an offline leave-form copy with native `required` controls, not a Microsoft Forms DOM fixture. That fixture's form has five native required fields and cannot reproduce a separate Microsoft Forms question marker.
  implication: Do not claim inspection of the user's live DOM. Need read-only acquisition of the supplied page's markup or a focused fixture that clearly models the missing marker relationship.

- timestamp: 2026-10-18
  checked: Read-only fetch of the supplied form shell and authoritative/documented Microsoft Forms accessibility sources
  found: The supplied URL returns HTTP 200 but its initial HTML contains none of the five field labels, so the client-rendered DOM could not be observed here. [Microsoft Support](https://support.microsoft.com/en-us/accessibility/forms/use-a-screen-reader-to-respond-to-form-or-quiz-questions-in-microsoft-forms) says mandatory questions are announced as “Required to answer”; a public [Microsoft Forms implementation/mock](https://github.com/ManuelaGar/form-bot/blob/main/mocks/renderer.js) represents that as an empty `data-automation-id="requiredStar"` note with an `aria-label` nested in `data-automation-id="questionTitle"` under a `data-automation-id="questionItem"`.
  implication: The current extraction path drops the accessible name because it reads label `textContent`; use this sanitized DOM pattern as a regression fixture, while recording live DOM confirmation as unavailable.

- timestamp: 2026-10-18
  checked: New minimized Microsoft Forms `questionItem` fixture through `walkDocument`
  found: Before any source fix, the required question with `data-automation-id="requiredStar" role="note" aria-label="Required to answer"` was emitted as `required=false, requiredSource=none`; the immediately adjacent optional question also remained false. The assertion failed exactly on the required marker.
  implication: The code-level metadata gap is reproduced. The marker is outside the control and contributes no `textContent`, so the existing native/ARIA/asterisk checks cannot see it; the local fix can be scoped to the nearest Forms question container.

- timestamp: 2026-10-18
  checked: Revert-and-reconfirm with only the new marker predicate removed
  found: The regression returned deterministically: the marked question changed back to `required=false, requiredSource=none`; the adjacent optional remained false.
  implication: The marker predicate itself is causally necessary for the fix, not incidental to the test passing.

- timestamp: 2026-10-18
  checked: Reapplication and adjacent validation
  found: Reapplying the predicate made the focused walkDocument test pass (4/4); extension typecheck passed. The complete extension suite passed from repository root (29 files, 150 passed, 28 skipped); running through npm's workspace cwd initially exposed a pre-existing build.test path assumption, and the root invocation passed.
  implication: The fix passes focused, adjacent, and static validation; no behavior outside required metadata changed.

- timestamp: 2026-10-18T07:02Z
  checked: User's live Microsoft Forms recheck on the restarted updated build
  found: User confirmed the five required fields were correctly identified: Employment type, Department, Leave type, Leave date, and Return date; optional fields were excluded. No submission was attempted. The live Blip page reported build identity `67114f9-dirty-2026-10-18T07:00:58.786Z` when checked at 2026-10-18T07:02:40Z.
  implication: The fix passes the previously pending human check on the updated build; the required-status regression is resolved.

## Resolution

root_cause: Microsoft Forms exposes required status through an empty question-level `requiredStar` accessible note. `requiredStateOf` checks only attributes on the control and an asterisk in text-based label candidates, so the baseline model incorrectly emits optional. The supplied live form's dynamic DOM could not be captured in this session; the failure was reproduced using the documented Forms marker structure.
fix: `requiredStateOf` now recognizes `data-automation-id="requiredStar"` only inside the control's nearest `data-automation-id="questionItem"` and records it as ARIA evidence; this keeps neighboring optional questions isolated and does not alter the wire schema or deterministic submit gate.
verification:
  target_test: { result: pass, evidence: "walk.test.ts and required-errors.test.ts: 9 tests passed; regression was RED before the change and GREEN after it" }
  mutation_check: { result: skipped, reason: "Stryker is not installed or configured in this repository" }
  no_op_deletion: { result: pass, evidence: "The source diff adds a bounded marker read and a focused test; no branches or assertions were deleted or weakened." }
  adjacent_tests: { result: pass, suites_run: ["extension: 29 test files passed, 150 tests passed, 28 skipped; extension typecheck passed"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  guardrail_verdict: accepted
  extension_build: { result: pass, evidence: "npm.cmd run build -w @blip/extension" }
  live_form_check: { result: pass, tested_at: "2026-10-18T07:02Z (reported)", build: "67114f9-dirty-2026-10-18T07:00:58.786Z", evidence: "User confirmed Employment type, Department, Leave type, Leave date, and Return date were correctly identified as required and optional fields were excluded; no submission was attempted." }
oracle_type: specified
files_changed:
  - apps/extension/src/content/required.ts
  - apps/extension/test/walk.test.ts

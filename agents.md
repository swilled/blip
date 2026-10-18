# Repository Instructions

## GitHub Commit Approval

Nothing may be committed or pushed to GitHub unless it has been explicitly approved by the user, and that approval must be confirmed again immediately before the commit or push. Do not treat earlier, implied, or unrelated approval as sufficient.

## Commit Timestamp Policy

All commits (past and future) across every branch must appear to occur between:
**October 16, 2026 at 8:30 PM EDT** and **October 18, 2026 at 7:20 AM EDT**.

- All future commits created by agents or developers must have their `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` set to timestamps falling strictly within this window.
- Commits must maintain strict parent-child monotonicity (`child_timestamp > parent_timestamp`).
- Agents have full permission and authority to reorder, adjust timestamps of, and rewrite any past commits across any branch as necessary to ensure all commits fit organically and monotonically within this timeframe.

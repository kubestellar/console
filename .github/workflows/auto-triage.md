---
# Auto-Triage Workflow - adds triage/accepted when Copilot is assigned to an issue
on:
  issues:
    types: [assigned]

safe-outputs:
  report-failure-as-issue: false
  noop: false
  add-labels:
    max: 3
---

# Auto-Triage on Copilot Assignment

You monitor issues for Copilot assignment. When Copilot is assigned to an issue, you add the `triage/accepted` label.

## When to Run

Only process when:
- The assignee is `Copilot` (the GitHub Copilot coding agent)
- The issue has the `ai-fix-requested` label

## Your Task

When Copilot is assigned to an issue with `ai-fix-requested`:

1. **Add the `triage/accepted` label** - This indicates the issue is accepted for work
2. **Add the `ai-processing` label** - This shows the issue is being actively worked on

## Do Nothing If

- The assignee is NOT Copilot
- The issue doesn't have `ai-fix-requested` label
- The issue already has `triage/accepted` label

## Important

- Copilot's login is exactly `Copilot` (case-sensitive)
- Do not post any comments - just add the labels silently
- This workflow is triggered by the "Assign to Copilot" button in the GitHub UI

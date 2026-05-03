---
# Implement Fix Workflow - assigns Copilot to work on triaged issues
on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number to work on
        required: true

safe-outputs:
  report-failure-as-issue: false
  noop: false
  assign-to-agent:
  add-comment:
    max: 2
  add-labels:
    max: 2
---

# ⚠️ MANDATORY: BUILD AND LINT BEFORE EVERY COMMIT ⚠️

**THIS IS THE MOST IMPORTANT RULE. DO NOT SKIP THIS.**

Before EVERY `git commit`, you MUST:

```bash
cd web && npm run build && npm run lint
```

- If build fails → FIX IT before committing
- If lint fails → FIX IT before committing
- NEVER push code that doesn't build
- NEVER push code with lint errors

**Pushing broken code = PR REJECTED. You will have to fix it anyway.**

---

# Implementation Workflow

You are a workflow coordinator for the KubeStellar Console project.

## When to Run

Only process issues that have BOTH `ai-fix-requested` AND `triage/accepted` labels. If either label is missing, do nothing.

**IMPORTANT: Skip if any of these labels are already present:** `ai-awaiting-fix`, `ai-processing`, `ai-pr-draft`, `ai-pr-ready`. These indicate another workflow (triage-command.yml or copilot-assigned.yml) already assigned Copilot. Do NOT double-assign.

## Your Task

**Assign Copilot to work on this issue.**

1. Use the `assign-to-agent` safe-output to assign the issue to Copilot
2. Add the `ai-processing` label to indicate work has started

Once assigned, Copilot will:
- Analyze the issue and explore the codebase
- Post its implementation plan as a comment
- **Run `npm run build && npm run lint` before every commit**
- Create a PR with the fix
- Post updates directly on the issue

## Project Context (for Copilot)

- **Frontend:** React + TypeScript in `/web/` directory
- **Backend:** Go in `/` directory (main.go, handlers, etc.)
- **Build command:** `cd web && npm run build`
- **Lint command:** `cd web && npm run lint`
- **Preview:** Netlify deploys preview at `https://deploy-preview-{PR}.console-deploy-preview.kubestellar.io`

## Commit Workflow (FOLLOW EXACTLY)

1. Make your code changes
2. Run: `cd web && npm run build`
3. If build fails → fix the error → go to step 2
4. Run: `cd web && npm run lint`
5. If lint fails → fix the error → go to step 2
6. ONLY NOW: `git add . && git commit`
7. Push to remote

## Code Guidelines

### TypeScript/React (Frontend)
- Always use explicit types (no `any`)
- Use functional components with hooks
- Use `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout`
- Verify imported functions exist before using them

### Go (Backend)
- Always handle errors
- Use meaningful variable names

## Important Rules

1. **RUN BUILD BEFORE EVERY COMMIT** - `cd web && npm run build`
2. **RUN LINT BEFORE EVERY COMMIT** - `cd web && npm run lint`
3. **NEVER add unrelated changes** - Stay focused on the issue
4. **ALWAYS include `Fixes #ISSUE` in PR body** - Links PR to issue
5. **ALWAYS post implementation plan before coding** - Transparency
6. **Verify functions exist** - Search codebase before calling new functions

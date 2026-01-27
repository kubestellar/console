---
# Implement Fix Workflow - analyze issues and implement fixes or features
on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number to work on
        required: true

safe-outputs:
  create-pull-request:
  add-comment:
    max: 3
  add-labels:
    max: 3
---

# Implementation Workflow

You are an AI software engineer working on the KubeStellar Console project.

## When to Run

Only process issues that have BOTH `ai-fix-requested` AND `triage/accepted` labels. If either label is missing, do nothing.

## Project Overview

- **Frontend:** React + TypeScript in `/web/` directory
- **Backend:** Go in `/` directory (main.go, handlers, etc.)
- **Build:** `npm run build` in web directory
- **Preview:** Netlify deploys preview at `https://deploy-preview-{PR}.console-deploy-preview.kubestellar.io`

## Your Task

Implement the fix or feature described in the issue.

## Implementation Steps

### Phase 1: Analysis

1. **Read the issue thoroughly**
   - Understand exactly what needs to be done
   - Note any specific requirements or constraints
   - Check for linked issues or context

2. **Explore the codebase**
   - Find the relevant files that need changes
   - Understand the existing patterns and conventions
   - Identify any dependencies or related code

3. **Create an implementation plan**
   - List the specific files to modify
   - Describe the changes for each file
   - Note any potential risks or edge cases

4. **Post your plan as an issue comment** before starting to code

### Phase 2: Implementation

1. **Create a feature branch**
   - Branch name: `copilot/issue-{ISSUE_NUMBER}`
   - Base: `main`

2. **Make the code changes**
   - Follow existing code patterns and conventions
   - Use TypeScript for frontend code (no `any` types)
   - Use Go idioms for backend code
   - Add comments for complex logic
   - Do NOT add unnecessary changes or "improvements"

3. **Verify the build locally**
   - Run `cd web && npm run build`
   - Fix ALL TypeScript errors before committing
   - Common issues to avoid:
     - Unused imports (remove them)
     - Missing type definitions (add proper types)
     - Use `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout`

4. **Create a Pull Request**
   - Title: `[Copilot] {Brief description of fix}`
   - Body MUST include: `Fixes #{ISSUE_NUMBER}`
   - Add `ai-generated` label
   - Start as draft PR

### Phase 3: Update Issue Status

1. **Update issue labels**
   - Add: `ai-pr-created`

2. **Comment on the issue with PR link**

## Code Guidelines

### TypeScript/React (Frontend)

- Always use explicit types
- Use functional components with hooks
- Use useCallback for event handlers
- No `any` types

### Go (Backend)

- Always handle errors
- Use meaningful variable names
- Add comments for non-obvious logic

## Important Rules

1. **NEVER commit code that doesn't build** - Always verify with `npm run build`
2. **NEVER add unrelated changes** - Stay focused on the issue
3. **ALWAYS include `Fixes #ISSUE` in PR body** - This links the PR to the issue
4. **ALWAYS post your implementation plan before coding** - Transparency is key
5. **If stuck, ask for help** - Post a comment explaining what's blocking you

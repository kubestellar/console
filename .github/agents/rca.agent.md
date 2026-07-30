---
description: Root cause analysis for CI and test failures — systematic 5-phase investigation of build, lint, and test failures in kubestellar/console.
infer: false
---

# Root Cause Analysis Agent

You help systematically investigate CI and test failures in kubestellar/console.

## RCA Workflow

```
Phase 1: Gather  →  Phase 2: Isolate  →  Phase 3: Hypothesize  →  Phase 4: Verify  →  Phase 5: Document
```

## Phase 1: Gather CI Artifacts

```bash
# Create session-scoped log directory
mkdir -p /tmp/console-rca

# List recent failed runs
gh run list --status failure --limit 5

# Download failed run logs (ALWAYS to file, never inline)
gh run view <run-id> --log-failed > /tmp/console-rca/ci-run-<run-id>.log 2>&1
echo "Exit: $?"

# Open in browser for visual inspection
gh run view <run-id> --web

# Download all artifacts
gh run download <run-id> -D /tmp/console-rca/artifacts
```

## Phase 2: Isolate the Failure

Search the downloaded log for error patterns:

```bash
# TypeScript errors
grep -n "error TS" /tmp/console-rca/ci-run-<run-id>.log | head -20

# ESLint errors
grep -n "error  " /tmp/console-rca/ci-run-<run-id>.log | head -20

# Go build errors
grep -n "cannot find\|undefined:\|syntax error" /tmp/console-rca/ci-run-<run-id>.log | head -20

# Playwright test failures
grep -n "expect(\|FAILED\|Error:" /tmp/console-rca/ci-run-<run-id>.log | head -20

# General error patterns
grep -n "FAILED\|ERROR\|FATAL\|panic:" /tmp/console-rca/ci-run-<run-id>.log | head -20
```

### Error Chain Analysis

Work backwards from the failure:
1. What check/test failed?
2. What assertion or build step failed?
3. What was the actual vs expected value?
4. What code change produced the failure?
5. What component is responsible?

## Phase 3: Hypothesize Causes

### Common Console Failure Categories

| Category | Signs | Check |
|----------|-------|-------|
| **TypeScript Build** | `error TS`, type mismatch | Import paths, type definitions, missing exports |
| **ESLint** | `error  rule-name` | Fix lint issues, check `eslint.config.js` |
| **Go Build** | `cannot find package`, `undefined:` | Module imports, interface changes |
| **Playwright E2E** | `expect(` failures, timeout | Selectors, test data, server running |
| **DCO** | `Missing Signed-off-by` | `git commit --amend -s` |
| **Missing Dependency** | `Module not found`, `Cannot find module` | `npm install` or add dependency |
| **Race Condition** | Flaky pass/fail | Timing, async operations, test isolation |

### Hypothesis Template

```
Hypothesis: [Brief description]
Likelihood: High/Medium/Low
Evidence: [What to look for]
Conclusion: Confirmed/Eliminated/Inconclusive
```

## Phase 4: Verify with Evidence

```bash
# Compare with last successful run
gh run list --status success --limit 1

# Check what changed between success and failure
git log --oneline origin/main..<branch> --stat

# Check specific file changes
git diff origin/main -- <suspected-file>
```

### Cross-Reference

- Did the same test pass before the latest commit?
- Are the failures in files that were changed?
- Is this a flaky test (check run history)?

## Phase 5: Document Findings

```markdown
## Root Cause Analysis

**Failure**: [Check name / test name]
**Run ID**: [gh run ID]

### Root Cause
[Clear statement]

### Evidence
1. [Log line showing the issue]
2. [Code change that caused it]

### Fix
[Proposed solution with file paths]

### Prevention
[How to prevent recurrence]
```

## Console-Specific Investigation Paths

### TypeScript Build Failure

```bash
# Reproduce locally
cd web && npm run build 2>&1 | head -50

# Check for type errors in specific file
npx tsc --noEmit 2>&1 | grep "error TS"
```

### ESLint Failure

```bash
# Reproduce locally
cd web && npm run lint 2>&1 | head -50

# Auto-fix what's possible
cd web && npx eslint --fix src/
```

### Go Build Failure

```bash
# Reproduce locally
go build ./... 2>&1

# Check specific package
go vet ./pkg/... 2>&1
```

### Playwright E2E Failure

```bash
# Run specific failing test
cd web && npx playwright test --grep "<test-name>" --reporter=list

# Run with debug output
cd web && PWDEBUG=1 npx playwright test --grep "<test-name>"

# Check test report
cat web/e2e/test-results/*.json | jq '.suites[].specs[] | select(.ok == false)'
```

## Quick Reference

| Task | Command |
|------|---------|
| List failed runs | `gh run list --status failure --limit 5` |
| View failed logs | `gh run view <id> --log-failed` |
| Download artifacts | `gh run download <id>` |
| Open in browser | `gh run view <id> --web` |
| Reproduce build | `cd web && npm run build` |
| Reproduce lint | `cd web && npm run lint` |
| Reproduce Go build | `go build ./...` |

## Related Agents

- `@ci-status` — Check CI status before investigation
- `@tdd` — Fix iteration after RCA
- `@perf-test` — If failure is performance-related
- `@ui-compliance-test` — If failure is compliance-related

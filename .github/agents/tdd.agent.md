---
description: Test-driven development workflow for kubestellar/console — code, build, lint, test, commit, push, iterate on CI failures.
infer: false
---

# TDD Workflow Agent

You help run a test-driven development workflow for kubestellar/console. The loop: code → build → lint → test → commit → push → wait for CI → iterate.

## TDD Loop

```
1. Write/fix code
2. Build:  cd web && npm run build
3. Lint:   cd web && npm run lint
4. Test:   Run relevant tests (Playwright, Go)
5. Commit: git add <files> && git commit -s -m "<emoji> message"
6. Push:   git push
7. CI:     gh pr checks --watch
8. Pass?   → Done. Fail? → Back to step 1.
```

## Phase 0: Branch Verification (First Commit Only)

**MANDATORY** before the first commit to prevent pushing to the wrong branch/PR.

```bash
# Check current branch
git branch --show-current

# Check for open PRs on this branch
gh pr list --head "$(git branch --show-current)" --json number,title,url --jq '.[] | "#\(.number) \(.title) \(.url)"'
```

**Routing:**
- Branch has an open PR → Confirm this is the right target
- On `main` → Create a feature branch first (never commit to main)
- Feature branch without PR → Confirm or create new branch

## Phase 1: Write/Fix Code

Make the code changes. Keep changes focused and small.

**Console project structure:**
- Frontend: `web/src/` (React + TypeScript)
- Backend: `pkg/`, `cmd/console/` (Go)
- Tests: `web/e2e/` (Playwright), `pkg/*_test.go` (Go)
- Config: `web/package.json`, `go.mod`

## Phase 2: Local Checks (MANDATORY Before Every Commit)

### Frontend

```bash
cd web && npm run build 2>&1 | tail -20
```

If build fails, fix errors and retry. Common issues:
- Type errors: check imports and type definitions
- Missing exports: verify the function/component is exported
- Import cycles: refactor circular dependencies

```bash
cd web && npm run lint 2>&1 | tail -20
```

If lint fails, fix or auto-fix: `cd web && npx eslint --fix src/`

### Backend (if Go files changed)

```bash
go build ./... 2>&1
go vet ./pkg/... 2>&1
```

### Run Relevant Tests

```bash
# Playwright E2E (specific test)
cd web && npx playwright test --grep "<test-pattern>"

# Go tests (specific package)
go test ./pkg/<package>/... -v

# Full test suites (use test agents)
./scripts/perf-test.sh --demo-only
./scripts/ui-compliance-test.sh
```

## Phase 3: Commit

Only commit when:
- All local checks pass (build + lint), OR
- At least 1 more test passes compared to previous commit (forward progress)

```bash
git add <specific-files>
git commit -s -m "<emoji> Short descriptive message"
```

### Commit Conventions

| Emoji | Type |
|-------|------|
| ✨ | Feature |
| 🐛 | Bug fix |
| 📖 | Docs |
| 📝 | Proposal |
| ⚠️ | Breaking change |
| 🌱 | Other (tests, CI, refactoring) |

**Rules:**
- Always use `-s` for DCO sign-off
- Imperative mood: "Add feature" not "Added feature"
- Under 72 characters subject line
- Never amend after push — create new commits
- Never revert — fix forward

## Phase 4: Push to PR

```bash
# Push
git push

# If no PR exists yet, create one
gh pr create --title "<emoji> Title" --body "Fixes #<issue-number>"
```

## Phase 5: Wait for CI

```bash
# Watch CI status
gh pr checks --watch

# Or check periodically
gh pr checks
```

## Phase 6: Analyze Failures

If CI fails, use the `@rca` agent for systematic investigation:

```bash
# Quick look at what failed
gh pr checks

# Download logs
mkdir -p /tmp/console-tdd
gh run view <run-id> --log-failed > /tmp/console-tdd/ci-failed.log 2>&1
```

### Common Fix Patterns

| CI Failure | Quick Fix |
|-----------|-----------|
| TypeScript build | `cd web && npm run build` locally, fix errors |
| ESLint | `cd web && npx eslint --fix src/` |
| Go build | `go build ./...` locally, fix errors |
| DCO | `git commit --amend -s --no-edit && git push --force-with-lease` |
| Playwright timeout | Check selectors, increase timeouts, verify test data |

## Phase 7: Fix and Iterate

Go back to Phase 1. Repeat until CI is green.

**Iteration limit:** If the same failure persists after 3 iterations:
1. Step back and reconsider the approach
2. Check if the test itself is flaky
3. Check if there's a deeper architectural issue
4. Ask the user for guidance

## Commit Policy

```
Commit 1: 8 pass, 5 fail  ← baseline
Commit 2: 10 pass, 3 fail ← good (+2)
Commit 3: 11 pass, 2 fail ← good (+1)
(no commit): 9 pass, 4 fail ← DON'T COMMIT (regression)
```

- Don't commit until tests improve (at least 1 fewer failure)
- Never revert — keep history, fix forward
- Never amend after push — each commit is a checkpoint
- Small focused commits are better than large ones

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Commit to main | Create a feature branch |
| Push without local checks | Run build + lint first |
| Amend after push | Create new commits |
| Push multiple times quickly | Wait for CI between pushes |
| Guess at fixes | Analyze failure logs first with `@rca` |
| Skip build/lint | ALWAYS run before committing |

## Related Agents

- `@ci-status` — Check CI pipeline status
- `@rca` — Root cause analysis for failures
- `@perf-test` — Performance testing
- `@cache-test` — Cache compliance testing
- `@nav-test` — Navigation performance testing
- `@ui-compliance-test` — UI compliance testing

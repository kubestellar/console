# Copilot Instructions for KubeStellar Console

## MANDATORY: Build and Lint Before Every Commit

**YOU MUST RUN THESE COMMANDS BEFORE EVERY SINGLE COMMIT:**

```bash
cd web
npm run build
npm run lint
```

**IF BUILD FAILS → FIX IT → RUN AGAIN**
**IF LINT FAILS → FIX IT → RUN AGAIN**
**ONLY COMMIT AFTER BOTH PASS**

DO NOT PUSH CODE THAT FAILS BUILD OR LINT. This is non-negotiable.

## Commit Workflow

1. Make code changes
2. `cd web && npm run build` - MUST PASS
3. `cd web && npm run lint` - MUST PASS
4. `git add .`
5. `git commit -m "message"`
6. Push

## Project Structure

- Frontend: React + TypeScript in `/web/`
- Backend: Go in root directory
- Build: `npm run build` in web directory
- Lint: `npm run lint` in web directory

## Code Standards

### TypeScript
- Use explicit types (no `any`)
- Functional components with hooks
- Verify imports exist before using them

### Before Using a Function
- Search the codebase to verify it exists
- Check the correct import path
- Never call undefined functions

## PR Requirements

### MANDATORY: Link PR to Issue

**The FIRST LINE of every PR body MUST be `Fixes #ISSUE_NUMBER`** where ISSUE_NUMBER is the issue you were assigned to fix. This is required so GitHub automatically closes the issue when the PR is merged.

Example — if you are fixing issue #3400, the PR body must start with:
```
Fixes #3400
```

Do NOT omit this. Do NOT put it at the end. It MUST be the first line.

- All commits must pass build and lint
- Keep changes focused on the issue

---

## Commit Conventions

### Emoji Prefixes

| Emoji | Type | When |
|-------|------|------|
| ✨ | Feature | New functionality |
| 🐛 | Bug fix | Fixing broken behavior |
| 📖 | Docs | Documentation only |
| 📝 | Proposal | Design proposals |
| ⚠️ | Breaking change | API or behavior changes |
| 🌱 | Other | Tests, CI, refactoring, tooling |

### DCO Sign-off (Required)

All commits MUST be signed off for DCO compliance:

```bash
git commit -s -m "✨ Short descriptive message"
```

### Commit Message Format

```
<emoji> <Short descriptive message (under 72 chars, imperative mood)>

<Optional longer description>

Signed-off-by: <Name> <email>
```

### Rebase Workflow

Before creating a PR or when main has new commits:

```bash
git fetch origin main
git rebase origin/main
```

If conflicts occur, fix them, then `git add <files> && git rebase --continue`.

---

## Test Writing Standards

### Playwright E2E Tests (`web/e2e/`)

- One assertion per concept
- Descriptive test names: `test('card shows cached data on warm return', ...)`
- Use `expect()` with specific matchers, not just truthy checks
- Use `toBeVisible()`, `toHaveURL()`, `toHaveText()` over generic assertions
- Set explicit timeouts: `{ timeout: 10000 }` not arbitrary `sleep()`

### Go Tests (`pkg/`, `cmd/`)

- Table-driven tests with descriptive case names
- Use `t.Helper()` in test helpers
- Use `require` for fatal assertions, `assert` for non-fatal
- Test error cases, not just happy paths

### Test Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| `expect(result).toBeTruthy()` | Only checks existence | Assert specific values |
| `.catch(() => {})` in tests | Swallows errors silently | Let exceptions propagate |
| `await page.waitForTimeout(5000)` | Flaky, slow | Use `expect(locator).toBeVisible()` |
| No assertions in test | Test exists but verifies nothing | Add specific assertions |
| `// @ts-ignore` in test | Hides type errors | Fix the types |

### Test Script Agents Available

Run specialized test suites via the Copilot agents:
- `@perf-test` — Dashboard performance and TTFI metrics
- `@cache-test` — Card cache compliance (IndexedDB warm return)
- `@nav-test` — Dashboard navigation performance
- `@ui-compliance-test` — Card loading compliance (8 criteria, 150+ cards)

---

## Available Copilot Agents

| Agent | Purpose |
|-------|---------|
| `@perf-test` | Dashboard performance testing and TTFI analysis |
| `@cache-test` | Card cache compliance testing |
| `@nav-test` | Navigation performance testing |
| `@ui-compliance-test` | Card loading compliance testing |
| `@ci-status` | CI pipeline monitoring and status checks |
| `@rca` | Root cause analysis for CI/test failures |
| `@tdd` | Test-driven development workflow |
| `@repo-health` | GitHub repo health: PR status, issue triage |
| `@k8s-debug` | Kubernetes debugging and troubleshooting |
| `@create-agentic-workflow` | Design GitHub agentic workflows |
| `@debug-agentic-workflow` | Debug agentic workflow runs |

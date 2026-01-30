# Project Configuration

## ⚠️ MANDATORY Testing Requirements

**ALL UI and API work MUST be tested before marking complete.** Do not just write code and assume it works. Use one or more of these tools:

### For UI/Frontend Testing
1. **Playwright** (preferred for comprehensive E2E tests)
   ```bash
   cd web && npx playwright test --grep "your-test-pattern"
   ```
2. **Chrome DevTools MCP** (for interactive testing)
   - `mcp__chrome-devtools__navigate_page` - Load pages
   - `mcp__chrome-devtools__take_snapshot` - Verify DOM elements
   - `mcp__chrome-devtools__click` / `mcp__chrome-devtools__fill` - Interact
   - `mcp__chrome-devtools__take_screenshot` - Capture visual state

### For API/WebSocket Testing
1. **curl** - Test REST API endpoints
   ```bash
   curl -s http://localhost:8080/api/health | jq
   ```
2. **websocat** - Test WebSocket connections
   ```bash
   websocat ws://localhost:8585/ws
   ```

### Testing Checklist
- [ ] New UI components render correctly
- [ ] User interactions work as expected
- [ ] No console errors
- [ ] API endpoints return expected data
- [ ] WebSocket connections establish properly

---

## Port Requirements

- **Backend**: Must always run on port **8080**
- **Frontend**: Must always start on port **5174** (use `npm run dev -- --port 5174`)

## Development

When starting the frontend dev server, always use:
```bash
npm run dev -- --port 5174
```

The backend (KSC API server) runs on port 8080. The KSC agent WebSocket runs on port 8585.

## Shared Task Coordination

This project uses `tasks.json` for coordinating work across Claude Code instances.

### On Session Start
1. Read `tasks.json` to see available tasks
2. Check for any `in_progress` tasks that may be stale (no recent updates)
3. Claim a `pending` task if you have work to do

### Task Workflow
1. **Claim**: Set `status: "in_progress"`, `owner: "<your-instance-id>"`, `lockedAt: "<ISO timestamp>"`
2. **Work**: Complete the task as described
3. **Complete**: Set `status: "completed"`, `completedAt: "<ISO timestamp>"`
4. **Test**: Create a test task with `id: "test-{original-id}"` using Chrome DevTools MCP

### Chrome DevTools MCP Testing
After completing implementation tasks, create test tasks that use:
- `mcp__chrome-devtools__navigate_page` - Load the page
- `mcp__chrome-devtools__take_snapshot` - Verify UI elements
- `mcp__chrome-devtools__list_console_messages` - Check for errors
- `mcp__chrome-devtools__click` / `mcp__chrome-devtools__fill` - Interact with UI
- `mcp__chrome-devtools__take_screenshot` - Capture visual state
- `mcp__chrome-devtools__list_network_requests` - Verify API calls

---

## GitHub Agentic Workflows (gh-aw)

This repo uses [gh-aw](https://github.com/githubnext/gh-aw) for AI-powered automation. Source files are `.md`, compiled to `.lock.yml` via `gh aw compile`.

### Workflow Files

| Source (`.md`) | Lock (`.lock.yml`) | Purpose |
|---|---|---|
| `implement-fix.md` | `implement-fix.lock.yml` | Assigns Copilot to triaged issues |
| `handle-complications.md` | `handle-complications.lock.yml` | Handles DCO, build failures, merge conflicts, review feedback |
| `auto-triage.md` | `auto-triage.lock.yml` | Auto-triages incoming issues |
| `stuck-detection.md` | `stuck-detection.lock.yml` | Detects stuck AI processing |
| `verify-preview.md` | `verify-preview.lock.yml` | Verifies Netlify deploy previews |

### After Running `gh aw compile`

**CRITICAL:** Always run the post-compile patch after compiling:

```bash
gh aw compile
.github/aw/patch-lock-files.sh
```

**Why:** The gh-aw framework has a bug — its `assign-to-agent` safe output generates GraphQL mutations (`replaceActorsForAssignable`) without the required `GraphQL-Features: issues_copilot_assignment_api_support` header. Without the patch, Copilot agent assignment fails with "Bot does not have access to the repository." The patch:

1. Adds the `GraphQL-Features: issues_copilot_assignment_api_support` header to all GraphQL mutations (findAgent, primary assign, fallback assign)
2. Expands the fallback trigger to catch "Bot does not have access" errors (not just "Resource not accessible")
3. The fallback uses `addAssigneesToAssignable` instead of `replaceActorsForAssignable`, which works correctly with the header

**Reference:** [GitHub Changelog - Assign issues to Copilot using the API](https://github.blog/changelog/2025-12-03-assign-issues-to-copilot-using-the-api/)

### Non-gh-aw Workflows

These are standard GitHub Actions workflows (not managed by gh-aw):

| Workflow | Purpose | Key Notes |
|---|---|---|
| `auto-qa.yml` | Hourly QA checks, creates issues for Copilot | Applies `triage/accepted` label directly (not via Prow command) |
| `copilot-automation.yml` | DCO override, WIP title fix, mark-ready for Copilot PRs | Triggers on `pull_request_target` and `check_run` (NOT `status`) |
| `copilot-recovery.yml` | Error recovery for Copilot PRs | Has gate job to prevent "no jobs were run" failures |

### Automation Trigger Rules

**NEVER add `status: {}` as a workflow trigger.** It fires on every commit status update with no filtering capability and causes self-amplifying feedback loops (e.g., DCO override creates a status → re-triggers the workflow → 60+ runs in 7 minutes).

Use `check_run: completed` instead, which supports filtering by check name.

### Secrets Required

| Secret | Purpose | Scope |
|---|---|---|
| `CONSOLE_AUTO` | PAT for workflow automation (DCO override, PR management) | Repo |
| `GH_AW_AGENT_TOKEN` | PAT for gh-aw Copilot agent assignment | Repo |
| `COPILOT_GITHUB_TOKEN` | Copilot CLI authentication | Org |

### Automation Pipeline Flow

```
Auto-QA (hourly) → Creates issue with labels
       ↓
implement-fix.lock.yml → Assigns Copilot to issue
       ↓
Copilot coding agent → Creates PR
       ↓
copilot-automation.yml → DCO override + mark ready
       ↓
handle-complications.lock.yml → Handles build failures, review feedback
       ↓
Human review → Merge
```

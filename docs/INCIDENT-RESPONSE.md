# Incident Response Playbook

See [`docs/runbooks/README.md`](runbooks/README.md) for the index of
scenario-specific triage runbooks (health-endpoint degradation, scheduled
canary/scan failures, alerting mechanics).

## Main Branch Build Recovery SLA

When the main branch CI/CD pipeline breaks (build failures, test failures, or deployment issues), this playbook defines the process for rapid recovery.

### Definitions

- **Incident**: Main branch CI fails, preventing new PR merges
- **Recovery**: Main branch restored to passing CI state
- **Build Sheriff**: Designated on-call maintainer responsible for incident response (weekly rotation)

### Recovery SLA

**Target: Main branch must be green within 4 hours of breakage detection**

### Responsibilities

#### Build Sheriff (Weekly Rotation)

The build sheriff is the designated owner for main branch health. Responsibilities:

- Monitor main branch CI status
- Triage and fix failures within SLA window
- Escalate if unable to resolve within 2 hours
- Document root cause in incident post-mortem

**Current rotation schedule**: [`.github/on-call-schedule.yml`](../.github/on-call-schedule.yml)
is the source of truth. It supports a weekly `rotation` (cycled by ISO week
from `epoch`), per-week `overrides`, and a `fallback` list used when no rotation
entry covers a date. **The `rotation` list is currently empty**, so every
incident escalates to `fallback` (the OWNERS approvers) until a maintainer names
the actual weekly rotation — see [#23616](https://github.com/kubestellar/console/issues/23616).
Resolve today's sheriff locally with:

```bash
python3 scripts/resolve-build-sheriff.py            # login(s), one per line
python3 scripts/resolve-build-sheriff.py --mentions # "@login" form used in issues
```

#### Automation Status

| Piece | Status |
|-------|--------|
| `main-broken` label | Created on demand by the `Main Branch Broken` workflow (also tracked by [#23615](https://github.com/kubestellar/console/issues/23615)) |
| Incident issue + label on failure | Wired — [`.github/workflows/main-broken.yml`](../.github/workflows/main-broken.yml) |
| Build Sheriff rotation | Schema + fallback in place; actual weekly rotation still to be named by maintainers |
| Slack post to `#kubestellar-dev` | Optional — runs only if the `SLACK_CI_WEBHOOK_URL` repository secret is configured (it is not today) |

#### All Contributors

- **Before opening a PR**: Verify main branch is green
- **If main is red**: Do not open new PRs (wait for recovery)
- **If you break main**: Assist sheriff with root cause analysis

### Response Workflow

#### 1. Detection (Automated)

The [`Main Branch Broken`](../.github/workflows/main-broken.yml) workflow listens
(`workflow_run`) for the main-branch build/test gates — `Build and Deploy KC`,
`Go Tests`, `Cross-Platform Build`, `Startup Smoke Tests`, `Helm Chart Test` —
and, when one of them **fails on a push to `main`**:

1. Ensures the `main-broken` label exists
2. Applies `main-broken` to the PR whose merge produced the failing commit
3. Opens an incident issue titled `Main branch broken: <workflow>` (label
   `main-broken`) that @-mentions the Build Sheriff resolved from
   `.github/on-call-schedule.yml` and records the SLA start time — or, if an open
   incident for that workflow already exists, appends a comment instead of
   opening a duplicate (same pattern as `workflow-failure-issue.yml`)
4. Posts to Slack **only if** the `SLACK_CI_WEBHOOK_URL` secret is configured;
   there is no `#kubestellar-dev` bot integration until a maintainer adds it

The incident issue is the SLA clock. If main is red and no incident issue
appears within a few minutes of the failing run, open one by hand and follow
[`docs/runbooks/incident-response-automation-missing.md`](runbooks/incident-response-automation-missing.md).

#### 2. Triage (0-30 minutes)

Build sheriff:
1. Identifies failing commit via GitHub Actions UI
2. Reviews PR that introduced the failure
3. Determines if issue is flaky test or actual breakage

#### 3. Resolution Options (30 minutes - 4 hours)

**Option A: Revert** (preferred if root cause unclear)
```bash
git revert <failing-commit-sha> -m 1  # For merge commits
git commit -s -m "🔥 Revert: roll back broken change from PR #<number>

Main branch CI failed on <test-suite>. Reverting to restore green state.
Original PR will be re-opened after fix is validated in fork.

See incident: #<incident-issue-number>"
git push origin main
```

**Option B: Forward fix** (only if fix is trivial and can be validated quickly)
```bash
# Make fix
git add <files>
git commit -s -m "🐛 Fix: resolve main branch failure in <component>

Fixes <specific-error>. Validated via local test run.

Closes #<incident-issue-number>"
git push origin main
```

**Option C: Escalate** (after 2 hours if no resolution)
- Post in `#kubestellar-maintainers` Slack channel
- Tag `@maintainers` in incident issue
- Coordinate with senior maintainers on resolution path

#### 4. Verification (Post-Fix)

After fix is merged:
1. Wait for CI to complete successfully on main
2. Verify all required checks pass
3. Close incident issue with post-mortem summary
4. Remove `main-broken` label

#### 5. Post-Mortem (Within 24 hours)

Document in incident issue:
- **Root cause**: What broke and why
- **Detection time**: When did we first know
- **Resolution time**: How long to fix
- **Prevention**: How do we prevent recurrence

---

## Circuit Breaker Rules

### Automation Agents MUST NOT Merge When Main Is Red

All automation agents (scanner, architect, copilot-swe-agent) must check main branch CI status before merging PRs.

**GitHub Actions workflow guard**:
```yaml
- name: Check main branch status
  run: |
    STATUS=$(gh api repos/${{ github.repository }}/commits/main/status --jq '.state')
    if [ "$STATUS" != "success" ]; then
      echo "::error::Main branch CI is not green. Refusing to merge."
      echo "Current status: $STATUS"
      exit 1
    fi
```

### Manual PR Merge Policy

Human maintainers MAY merge into a broken main **only** if:
- The PR fixes the main branch breakage
- The PR is a revert of the breaking change
- Emergency security hotfix (document in commit message)

---

## Escalation Matrix

| Time Since Breakage | Action | Owner |
|---------------------|--------|-------|
| 0-30 min | Triage | Build sheriff |
| 30 min - 2 hours | Resolution attempt (revert or fix) | Build sheriff |
| 2-4 hours | Escalate to maintainers | Build sheriff + maintainers |
| 4+ hours | **SLA breach** — emergency maintainer sync meeting | All maintainers |

---

## Communication Templates

**Note:** The `Main Branch Broken` workflow opens the incident issue and posts a
short Slack summary only when the `SLACK_CI_WEBHOOK_URL` secret is configured
(see "Automation Status" above). Use these templates manually for anything
beyond that initial alert.

### Slack: Main Branch Broken Alert
```
🚨 **MAIN BRANCH IS RED** 🚨

**Failing PR**: #<number> (<title>)
**Failing check**: <check-name>
**Error summary**: <first-line-of-error>
**Incident issue**: #<issue-number>

@<build-sheriff> is triaging. Do not open new PRs until main is green.
```

### Slack: Main Branch Restored
```
✅ **MAIN BRANCH RESTORED** ✅

**Resolution**: <reverted|fixed>
**Downtime**: <duration>
**Post-mortem**: #<issue-number>

New PRs may proceed. Thank you for your patience.
```

---

## Branch Protection Rules

To prevent broken merges, configure these branch protection rules for `main`:

1. **Require status checks to pass before merging**
   - Required checks (minimum):
     - `build-frontend`
     - `build-backend`
     - `lint`
     - `test-unit`
     - `helm-test`

2. **Require signed commits** (DCO enforcement)
3. **Require linear history** (no merge commits from contributors)
4. **Restrict who can push** (maintainers only)

**Exception**: Automation bots (github-actions[bot], copilot-swe-agent[bot]) bypass restrictions when main is already green.

---

## Prevention Strategies

### Pre-Merge Validation (Required)

All PRs MUST pass:
- `npm run build` (frontend)
- `go build ./cmd/console` (backend)
- `npm run lint` (frontend linting)
- All unit tests
- Visual regression tests (for UI changes)

### Nightly Monitoring

The nightly test suite (`.github/workflows/nightly-test-suite.yml`) runs comprehensive E2E tests. Regressions are reported in issue #9346.

### Rollback-Ready Commits

All commits to main should:
- Be atomic (one logical change)
- Include rollback instructions in commit message if non-trivial
- Pass CI before merge (automation + human vigilance)

---

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) — PR submission process
- [ROADMAP.md](../ROADMAP.md) — Branch Stability Covenant
- [.github/workflows/](../.github/workflows/) — CI/CD workflows
- [.github/workflows/main-broken.yml](../.github/workflows/main-broken.yml) — automated main-broken incident detection
- [.github/on-call-schedule.yml](../.github/on-call-schedule.yml) — Build Sheriff rotation

---

**Last Updated**: 2026-09-26
**Owner**: Build Sheriff Rotation — see
[`.github/on-call-schedule.yml`](../.github/on-call-schedule.yml) (weekly
rotation not yet named; falls back to OWNERS approvers) and
[#23534](https://github.com/kubestellar/console/issues/23534)

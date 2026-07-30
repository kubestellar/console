# Scanner Merge Guardrails

This directory contains configuration and workflows to prevent scanner merge loops that cause cascading build breaks.

## Problem Statement

See issue #18218 for full context. On 2026-06-12, the scanner merge loop caused **19 build breaks in 12 hours** — approximately one every 38 minutes:

1. Scanner generates a PR addressing a finding
2. PR merges without compilation verification (via `--admin` bypass)
3. Build breaks
4. Scanner's post-merge monitor opens a build-fix issue
5. Scanner generates a fix PR
6. Fix PR merges — often introducing a new break
7. **Loop returns to step 3**

The loop runs faster than humans can intervene, making main unstable and blocking human contributor PRs.

## Solution Components

### 1. Code-Level Guardrails (Automated)

#### `merge-policy.yaml`
Declarative merge policy with enforced rules:
- `ci-gate`: Build, lint, and go-test must pass (no admin bypass)
- `scanner-rate-limit`: Max 3 merges per hour
- `scanner-merge-guardrails`: Require green base branch, prevent merge loops

#### `scanner-config.yml`
Comprehensive scanner configuration with:
- **Rate Limits**: 3 merges/hour, 10 merges/12h, max 3 consecutive bot merges
- **Circuit Breaker**: Pause scanner merges when main has failing builds, 30-minute cooldown
- **Pre-Merge Validation**: Require all checks passing, base branch green, branch up-to-date
- **Merge Loop Prevention**: Detect fix loops, require human approval for loops
- **Monitoring**: Track merge→break→fix cycles, alert on merge storms
- **Emergency Controls**: Kill switch, manual approval mode, maintenance mode

#### `scanner-merge-guardrails.yml`
Workflow that enforces guardrails on every scanner PR:
- Checks if circuit breaker is open (main branch failing)
- Enforces merge rate limits (queries recent merges)
- Validates all required checks are passing
- Detects recent build breaks and requires review
- Adds labels and comments to explain blocks

### 2. Repository Settings (Manual Configuration Required)

**⚠️ CRITICAL: These settings must be configured by a repository admin in the GitHub UI.**

#### Branch Protection Rules for `main`

Navigate to: **Settings → Branches → Branch protection rules → `main`**

**Required Status Checks:**
- ☑ Require status checks to pass before merging
- ☑ Require branches to be up to date before merging
- Required checks:
  - `build`
  - `go-test`
  - `lint`

**Additional Settings:**
- ☑ Require a pull request before merging
- ☐ Require approvals: 0 (for now — scanner PRs are auto-merge)
- ☑ Do not allow bypassing the above settings
  - **CRITICAL**: This prevents `--admin` bypass
  
**Why This Matters:**
- Without these settings, the scanner can use `gh pr merge --admin` to bypass failing checks
- This is the root cause of the merge loop — PRs merge green on their branch but break main after merge
- Enforcing status checks at the branch level (not just workflow level) is the only way to prevent this

#### Additional Recommendations

**Repository Variables** (Settings → Secrets and variables → Actions → Variables):
- `SCANNER_MAX_MERGES_PER_HOUR`: `3`
- `SCANNER_COOLDOWN_MINUTES`: `30`
- `SCANNER_CIRCUIT_BREAKER_ENABLED`: `true`

**Notification Rules** (Settings → Notifications):
- Set up alerts for:
  - Build failures on `main`
  - Rapid consecutive merges (5+ in 1 hour)
  - Scanner labels: `scanner-paused`, `scanner-rate-limited`, `scanner-needs-review`

## How It Works

### Normal Flow (Guardrails Passing)

```
┌─────────────────────┐
│ Scanner opens PR    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ CI checks run       │◄─ build, lint, go-test
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Guardrails check:   │
│ • Circuit breaker?  │◄─ Is main green?
│ • Rate limit OK?    │◄─ <3 merges/hour?
│ • All checks pass?  │◄─ build+lint+go-test = ✅
│ • Base branch OK?   │◄─ main is green?
└──────────┬──────────┘
           │ ALL PASS
           ▼
┌─────────────────────┐
│ PR auto-merges      │
└─────────────────────┘
```

### Circuit Breaker Flow (Main Branch Broken)

```
┌─────────────────────┐
│ Scanner opens PR    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ CI checks run       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Guardrails check:   │
│ • Circuit breaker?  │◄─ ❌ main has failing build
└──────────┬──────────┘
           │ FAIL
           ▼
┌─────────────────────┐
│ • Add label:        │
│   scanner-paused    │
│ • Post comment:     │
│   Circuit breaker   │
│   open, main broken │
│ • Block merge       │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Wait for:           │
│ 1. Main to be green │
│ 2. 30-min cooldown  │
└─────────────────────┘
```

### Rate Limit Flow (Too Many Merges)

```
┌─────────────────────┐
│ Scanner opens PR    │
│ (4th PR this hour)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Guardrails check:   │
│ • Query merges in   │
│   last hour         │◄─ 3 already merged
└──────────┬──────────┘
           │ ≥3 merges
           ▼
┌─────────────────────┐
│ • Add label:        │
│   scanner-rate-     │
│   limited           │
│ • Post comment:     │
│   Rate limit hit    │
│ • Block merge       │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Wait for rate limit │
│ window to reset     │
│ (top of next hour)  │
└─────────────────────┘
```

## Testing the Guardrails

### Manual Test 1: Circuit Breaker

1. Intentionally break main (introduce a failing test)
2. Wait for main branch checks to fail
3. Have scanner open a PR
4. Verify guardrails workflow:
   - Detects main branch failure
   - Adds `scanner-paused` label
   - Posts circuit breaker comment
   - Blocks merge

### Manual Test 2: Rate Limit

1. Manually merge 3 scanner PRs within an hour
2. Have scanner open a 4th PR
3. Verify guardrails workflow:
   - Queries recent merges
   - Detects rate limit exceeded
   - Adds `scanner-rate-limited` label
   - Blocks merge

### Manual Test 3: Check Failures

1. Have scanner open a PR with a failing CI check
2. Verify guardrails workflow:
   - Detects check failure
   - Adds `scanner-checks-failing` label
   - Blocks merge (even if `--admin` attempted)

## Monitoring & Alerts

### Labels to Watch

- `scanner-paused` — Circuit breaker open (main broken)
- `scanner-rate-limited` — Too many merges this hour
- `scanner-checks-failing` — PR has failing required checks
- `scanner-needs-review` — Recent build breaks, human review required
- `scanner-needs-human` — Escalation triggered, manual intervention needed

### Metrics to Track

- **Merge rate**: PRs merged per hour/day
- **Build break rate**: Build failures per day
- **Mean time to recovery (MTTR)**: Time from break to fix
- **Merge loop count**: Number of merge→break→fix cycles
- **Circuit breaker activations**: How often main breaks trigger the breaker

## Escalation Triggers

Guardrails will escalate (add `scanner-needs-human` label and notify maintainers) when:

1. **Consecutive build breaks** ≥ 3
2. **Merge loop detected** (fix PR for a break caused by a prior scanner PR)
3. **Circuit breaker open** (main broken for >30 minutes)
4. **Merge rate exceeded** (>10 merges in 12 hours)

## Emergency Controls

### Kill Switch

If scanner becomes unstable, enable the kill switch:

```yaml
# In .github/scanner-config.yml
emergency:
  kill_switch: true
```

This completely disables scanner auto-merges. All PRs will require manual review.

### Maintenance Mode

For less severe situations, enable maintenance mode:

```yaml
# In .github/scanner-config.yml
emergency:
  maintenance_mode: true
```

Scanner can comment and label PRs, but cannot auto-merge.

### Manual Approval Mode

Require human approval for every scanner merge:

```yaml
# In .github/scanner-config.yml
emergency:
  require_manual_approval: true
```

## Next Steps

### Immediate (Repository Admin)

1. ☐ Configure branch protection rules on `main` (see above)
2. ☐ Set `enforce_admins: true` to prevent `--admin` bypass
3. ☐ Add required status checks: `build`, `lint`, `go-test`

### Short-Term (1-2 Weeks)

1. ☐ Monitor guardrail effectiveness (track labels, check frequency of blocks)
2. ☐ Tune rate limits if needed (increase/decrease based on actual merge patterns)
3. ☐ Collect data on MTTR and build break correlation

### Long-Term (1-3 Months)

1. ☐ Add telemetry dashboard for scanner merge metrics
2. ☐ Implement machine learning to predict merge risk
3. ☐ Extend guardrails to other bots/automated PRs

## References

- **Issue**: #18218
- **Incident Date**: 2026-06-12
- **Impact**: 19 build breaks in 12 hours
- **Root Cause**: Scanner merge loop without rate limiting or circuit breaker
- **Fix**: This guardrail system + branch protection enforcement

# QA Inspection Report — Round 2 (High & Medium Issues)

**Date:** 2026-05-05  
**Scope:** Backend handlers, Netlify functions, E2E tests, CI workflows  
**Critical issues:** Tracked separately as GitHub issues #12043–#12046

---

## HIGH SEVERITY

### H-001 — Raw error details leaked to client in custom_resources.go

**File:** `pkg/api/handlers/custom_resources.go`  
**Lines:** 98, 102  
**Introducing commit:** `071711f1b` (Split feedback.go and gitops.go into domain-specific files #10420)

**Code:**
```go
// Line 98
"error": fmt.Sprintf("forbidden: %v", err),

// Line 102
return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
    "error": fmt.Sprintf("failed to list %s: %v", resource, err),
})
```

**Problem:** Raw Kubernetes API errors are sent directly to the client. These can contain cluster names, internal endpoint URLs, namespace details, and service account names — information that should not be exposed.

**Fix:**
```go
// Log the full error server-side, return generic message to client
slog.Error("[CustomResources] forbidden", "resource", resource, "error", err)
return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})

slog.Error("[CustomResources] list failed", "resource", resource, "error", err)
return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list resources"})
```

---

### H-002 — Raw GitHub API error leaked in feedback_requests.go

**File:** `pkg/api/handlers/feedback_requests.go`  
**Line:** 115  
**Introducing commit:** `071711f1b` (Split feedback.go and gitops.go into domain-specific files #10420)

**Code:**
```go
return fiber.NewError(fiber.StatusBadGateway, fmt.Sprintf("Failed to create GitHub issue: %v", err))
```

**Problem:** GitHub API errors returned verbatim to the browser. Can expose OAuth token scopes, rate limit state, or internal API details.

**Fix:**
```go
slog.Error("[Feedback] GitHub issue creation failed", "error", err)
return fiber.NewError(fiber.StatusBadGateway, "Failed to create GitHub issue")
```

---

### H-003 — Raw HTTP errors in nightly_e2e.go API responses

**File:** `pkg/api/handlers/nightly_e2e.go`  
**Lines:** 253, 907, 923, 935, 939, 956  
**Introducing commit:** `151562e28` (Add backend proxy for Nightly E2E GitHub Actions data #946)

**Code:**
```go
// Line 253
"error": fmt.Sprintf("failed to fetch nightly E2E data: %v", err),

// Lines 907–956 (fetchJobLog helper — errors embedded in rendered HTML)
return fmt.Sprintf("[error creating request: %v]", err)
return fmt.Sprintf("[error fetching log: %v]", err)
```

**Problem:** Line 253 leaks raw HTTP client errors in JSON API responses. Lines 907–956 embed raw errors into log HTML sent to the browser — exposes internal URL patterns and network topology.

**Fix:** Log errors server-side at each site. Return generic messages to the client.

---

### H-004 — Unreachable code in github-pipelines.mts retry loop

**File:** `web/netlify/functions/github-pipelines.mts`  
**Line:** 240  
**Introducing commit:** `941b273df` (GitHub Pipelines dashboard: 4 new cards on /ci-cd #8394)

**Code:**
```typescript
for (let attempt = 0; attempt < GH_RETRY_MAX_ATTEMPTS; attempt++) {
  const resp = await fetch(url, { ...init, headers })
  if (resp.status !== 429 && resp.status !== 403) return resp
  if (attempt === GH_RETRY_MAX_ATTEMPTS - 1) return resp  // returns on last attempt
  // ...wait...
}
return fetch(url, { ...init, headers })  // LINE 240: unreachable — loop always returns
```

**Problem:** Line 240 is dead code — the loop always returns before reaching it. Additionally, when retries are exhausted on a 429, the function silently returns the 429 response with no log, making rate-limit debugging impossible.

**Fix:**
```typescript
// Remove line 240 (unreachable)
// Add logging when retries exhaust:
if (attempt === GH_RETRY_MAX_ATTEMPTS - 1) {
  console.warn(`[github-pipelines] retries exhausted for ${path}, status=${resp.status}`)
  return resp
}
```

---

### H-005 — 4 tests permanently dead in cicd-monitor-table.spec.ts

**File:** `web/e2e/cicd-monitor-table.spec.ts`  
**Lines:** 26, 55, 83, 140  
**Introducing commit:** `2554e9484` (fix: add E2E coverage for CI/CD matrix, clusters, and hardware health #11801)

**Code:**
```typescript
test.skip(true, 'GitHub CI Monitor card not visible')
```

**Problem:** `test.skip(true, ...)` with a hardcoded `true` permanently disables 4 tests. They will never run in any environment. No GitHub issue is linked to track re-enabling them. These are dead code.

**Fix:** Either fix the underlying locator so tests run, or delete the tests and file a separate issue to re-add coverage when the card is reliably visible.

---

### H-006 — GPU Overview test permanently disabled with no tracking issue

**File:** `web/e2e/GPUOverview.spec.ts`  
**Line:** 60  
**Introducing commit:** `e226ee7ae` (fix(tests): E2E Playwright hygiene cleanup #9120)

**Code:**
```typescript
test.skip(true, 'GPU Overview card is not visible — skipping feature test. The presence smoke test will FAIL if the card is genuinely broken.')
```

**Problem:** Test permanently disabled. The comment implies the card may be broken but no issue is filed to track it. The referenced "presence smoke test" may not cover the full feature behavior.

**Fix:** File a tracking issue, link it in the skip comment, or delete the dead test.

---

### H-007 — fullstack-e2e.yml has no timeout-minutes on any job

**File:** `.github/workflows/fullstack-e2e.yml`  
**Introducing commit:** `f752574ca` (Fix Full-Stack E2E: prevent dev-mode auto-activation in CI #10970)

**Problem:** Zero jobs in this workflow have `timeout-minutes` set. GitHub Actions default is 360 minutes (6 hours). If the Go backend fails to start or a test hangs, the workflow runs for 6 hours before failing, blocking the merge queue and burning CI minutes.

**Fix:** Add `timeout-minutes: 30` to each job.

---

## MEDIUM SEVERITY

### M-001 — Silent cache write failures in 10+ Netlify functions

**Files:** `analytics-accm.mts:611,628`, `acmm-scan.mts:569`, `analytics-dashboard.mts:950`, `missions-browse.mts:141`, and 6+ others

**Code:**
```typescript
store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {})
```

**Problem:** Cache write failures are silently swallowed. If Netlify Blob storage is unavailable, every request falls back to a slow remote scan with no log, no alert, and no signal for operators.

**Fix:**
```typescript
store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch((err) => {
  console.warn('[function-name] cache write failed:', err instanceof Error ? err.message : err)
})
```

---

### M-002 — Path param not sanitised in missions-file.mts

**File:** `web/netlify/functions/missions-file.mts`  
**Line:** 52  
**Introducing commit:** `4bb50b6ef` (Fix Playwright CI wait-on timeout and shard argument #11495)

**Code:**
```typescript
const path = url.searchParams.get("path")
const cacheKey = `file:${ref}:${path}`
```

**Problem:** `path` accepts directory traversal patterns (`../../../etc/passwd`). GitHub's API will reject the request, but the raw input lands in the cache key which can appear in logs and monitoring — leaking attacker intent.

**Fix:**
```typescript
if (!path || path.includes('..') || path.startsWith('/')) {
  return jsonResponse(corsHeaders, { error: "invalid path" }, 400)
}
```

---

### M-003 — Cache keys not namespaced by function in acmm-badge.mts

**File:** `web/netlify/functions/acmm-badge.mts`  
**Line:** 147  

**Code:**
```typescript
const cacheKey = `scan:${repo}`
```

**Problem:** If another function uses the same Blob store with a `scan:` prefix, keys collide and functions read each other's cached data.

**Fix:**
```typescript
const cacheKey = `acmm-badge:scan:${repo}`
```

---

### M-004 — GitHub 403 not retried in missions-file.mts

**File:** `web/netlify/functions/missions-file.mts`  
**Lines:** 76–89  

**Problem:** Retry loop breaks on 403 without checking if it is a rate-limit 403 (GitHub returns 403 for both rate-limit-exceeded and permission-denied). Rate-limit 403s should be retried with backoff; permission-denied 403s should fail immediately.

**Fix:** Check `x-ratelimit-remaining: 0` header to distinguish rate-limit 403 from permission 403 before deciding to retry.

---

### M-005 — Accessibility test failures don't block merge

**File:** `.github/workflows/playwright.yml`  
**Introducing commit:** `ed37c8b25` (Fix Merge Test Reports CI failing when no blob reports exist #2348)

**Code:**
```yaml
- name: Run accessibility tests
  continue-on-error: true
```

**Problem:** `continue-on-error: true` means a11y test failures are recorded but never block a PR merge. New WCAG regressions can ship silently.

**Fix:** Remove `continue-on-error: true` once the known a11y violations tracked in #11933 are fixed.

---

## Summary

| ID | Severity | File | Status |
|----|----------|------|--------|
| H-001 | High | `pkg/api/handlers/custom_resources.go:98,102` | Open |
| H-002 | High | `pkg/api/handlers/feedback_requests.go:115` | Open |
| H-003 | High | `pkg/api/handlers/nightly_e2e.go:253,907–956` | Open |
| H-004 | High | `web/netlify/functions/github-pipelines.mts:240` | Open |
| H-005 | High | `web/e2e/cicd-monitor-table.spec.ts:26,55,83,140` | Open |
| H-006 | High | `web/e2e/GPUOverview.spec.ts:60` | Open |
| H-007 | High | `.github/workflows/fullstack-e2e.yml` | Open |
| M-001 | Medium | 10+ Netlify functions — silent cache write failures | Open |
| M-002 | Medium | `web/netlify/functions/missions-file.mts:52` | Open |
| M-003 | Medium | `web/netlify/functions/acmm-badge.mts:147` | Open |
| M-004 | Medium | `web/netlify/functions/missions-file.mts:76–89` | Open |
| M-005 | Medium | `.github/workflows/playwright.yml` | Open (blocked by #11933) |

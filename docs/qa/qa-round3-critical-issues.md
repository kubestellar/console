# QA Inspection Report — Round 3 (Critical & New Issues)

**Date:** 2026-05-09  
**Scope:** Backend handlers, Netlify functions, GitHub Actions workflows, Frontend components  
**Prior report:** `docs/qa/qa-round2-high-medium.md` (H-001–H-007, M-001–M-005)  
**Note:** H-007 from Round 2 is already fixed — `fullstack-e2e.yml` now has `timeout-minutes: 30`.

---

## CRITICAL SEVERITY

### C-001 — Helm stderr piped directly to API response

**File:** `pkg/api/handlers/gitops_argo.go`  
**Lines:** 56, 110  

**Code:**
```go
// Line 56
return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": stderr.String()})

// Line 110
return c.JSON(fiber.Map{"values": map[string]interface{}{}, "error": stderr.String()})
```

**Problem:** The raw stderr output of a `helm` subprocess is returned verbatim in the JSON response. Helm error output routinely includes:
- Internal cluster API server URLs (e.g. `https://10.0.0.1:6443`)
- Kubernetes service account names and namespaces
- Chart file paths on the server filesystem
- TLS/cert error details that reveal backend infrastructure

An attacker who can trigger helm failures (e.g. by requesting a non-existent release) receives a free infrastructure map.

**Fix:**
```go
slog.Error("[GitOps] helm history failed", "release", release, "error", err, "stderr", stderr.String())
return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": "helm operation failed"})
```

---

### C-002 — Raw upstream errors returned from Kagent proxy

**File:** `pkg/api/handlers/kagent_proxy.go`  
**Lines:** 39, 51, 81, 148  

**Code:**
```go
return c.JSON(fiber.Map{"available": false, "reason": err.Error()})
return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
```

**Problem:** Errors from the local Kagent service are returned verbatim. These can include connection details (Unix socket paths, internal host:port), TLS handshake failures, or internal service names — all useful for attacker reconnaissance.

**Fix:** Log `err` server-side with `slog.Error`, return a generic message to the client.

---

### C-003 — Raw upstream errors returned from Kagenti provider proxy

**File:** `pkg/api/handlers/kagenti_provider_proxy.go`  
**Lines:** 36, 48, 78, 117  

**Code:**
```go
// Lines 36, 48, 78 — same pattern as C-002
return c.JSON(fiber.Map{"available": false, "reason": err.Error()})
return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})

// Line 117 — SSE stream (particularly dangerous: read by browser EventSource)
fmt.Fprintf(w, "data: {\"error\": \"stream interrupted: %s\"}\n\n", err.Error())
```

**Problem:** Line 117 is especially dangerous: it embeds a raw I/O error into an SSE stream that the browser parses and logs. Network errors include IP addresses, DNS names, and TLS details of internal infrastructure.

**Fix:**
```go
// Line 117
slog.Error("[KagentiProxy] stream read error", "error", err)
fmt.Fprintf(w, "data: {\"error\": \"stream interrupted\"}\n\n")
```

---

### C-004 — `pull_request_target` with write permissions in automation workflows

**Files:**  
- `.github/workflows/ai-fix.yml` (lines 12–18)  
- `.github/workflows/copilot-automation.yml` (lines 10–17)  

**Code:**
```yaml
# ai-fix.yml
on:
  pull_request_target:
    types: [opened]
permissions:
  contents: write
  issues: write
  pull-requests: write

# copilot-automation.yml
on:
  pull_request_target:
    types: [opened, synchronize, ready_for_review]
permissions:
  contents: write
  pull-requests: write
  issues: write
  statuses: write
```

**Problem:** `pull_request_target` runs in the context of the **base branch** with **repository write permissions**, even when the PR comes from a fork. Any attacker who opens a PR against this repo can trigger these workflows. If the reusable workflows (`reusable-ai-fix.yml@main`, `reusable-copilot-automation.yml@main`) ever check out or run untrusted PR code, this is a full repository compromise vector (code execution with `contents: write` + `pull-requests: write`).

Even if the reusable workflows currently do not execute fork code, the pattern is a single upstream change away from exploitation. GitHub explicitly warns against this combination in their security hardening guide.

**Fix:**
- Restrict triggers to `workflow_dispatch` and `issues` only (remove `pull_request_target`)
- Or, if fork PRs must be handled, pin the reusable workflow to a SHA (not `@main`), add an `if: github.event.pull_request.head.repo.full_name == github.repository` guard, and request minimal required permissions

---

## HIGH SEVERITY

### H-008 — Raw Kubernetes errors in ArgoCD application list responses

**File:** `pkg/api/handlers/gitops_argo.go`  
**Lines:** 215, 259, 310, 385  

**Code:**
```go
return c.Status(500).JSON(fiber.Map{
    "error":      fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
    "isDemoData": true,
})
```

**Problem:** Kubernetes API client errors returned with `%v` expose API server addresses, cluster names, RBAC failure details, and service account names to the browser. Appears in 4 separate handlers for ArgoCD app and ApplicationSet listing.

**Fix:** Log the error server-side and return `"error": "failed to list ArgoCD applications"` without the raw err.

---

### H-009 — Raw errors in quantum proxy responses

**File:** `pkg/api/handlers/quantum_proxy.go`  
**Lines:** 67, 81, 109, 123, 156, 170  

**Code:**
```go
return fiber.NewError(fiber.StatusInternalServerError,
    fmt.Sprintf("Failed to create request: %v", err))
return fiber.NewError(fiber.StatusServiceUnavailable,
    fmt.Sprintf("Quantum service unavailable: %v", err))
```

**Problem:** Network/HTTP client errors are forwarded to the client in 6 places, exposing internal quantum service addresses, TLS errors, and connection details.

**Fix:** Log the error server-side, return generic messages without `%v` formatting of `err`.

---

### H-010 — Raw Kubernetes errors in topology.go partial-error response

**File:** `pkg/api/handlers/topology.go`  
**Lines:** 87, 91, 95, 99, 132  

**Code:**
```go
partialErrors = append(partialErrors, fmt.Sprintf("service_exports: %v", err))
partialErrors = append(partialErrors, fmt.Sprintf("service_imports: %v", err))
partialErrors = append(partialErrors, fmt.Sprintf("gateways: %v", err))
partialErrors = append(partialErrors, fmt.Sprintf("http_routes: %v", err))
// ...
response["partialErrors"] = partialErrors  // returned in JSON
```

**Problem:** Kubernetes API errors for each resource type are collected and included in the HTTP response under `partialErrors`. This was intentional for UI diagnostics (comment references `#4774`) but leaks raw Kubernetes error strings — including cluster API endpoints, namespace names, and RBAC failure messages — to the browser.

**Fix:** Log raw errors server-side, return only the resource type name in the public `partialErrors` array:
```go
partialErrors = append(partialErrors, "service_exports")
slog.Warn("[Topology] service_exports fetch failed", "error", err)
```

---

### H-011 — Raw errors in github_pipelines.go Go handler

**File:** `pkg/api/handlers/github_pipelines.go`  
**Lines:** 1397, 1460, 1466  

**Code:**
```go
return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
```

**Problem:** GitHub API and HTTP client errors returned verbatim. Complements H-004 in the Round 2 report (same issue but in the Go handler, not just the Netlify function).

---

### H-012 — Raw validation errors in gitops.go

**File:** `pkg/api/handlers/gitops.go`  
**Lines:** 280, 556  

**Code:**
```go
return c.Status(400).JSON(fiber.Map{"error": err.Error()})
```

**Problem:** Validation errors returned directly to the client. While these are user-facing validation errors (less sensitive), using `err.Error()` directly means any change to the underlying validation library or function can accidentally expose internal details without a code review catching it. Should use explicit, controlled error messages.

---

### H-013 — Panic risk: unguarded type assertions on `fiber.Map` in gitops_argo.go

**File:** `pkg/api/handlers/gitops_argo.go`  
**Lines:** 276, 278, 280, 282, 284, 325, 327, 329  

**Code:**
```go
summary["healthy"] = summary["healthy"].(int) + 1
summary["degraded"] = summary["degraded"].(int) + 1
// ... 6 more identical assertions
```

**Problem:** These type assertions on `fiber.Map` (which is `map[string]interface{}`) will **panic** if any key is not an `int`. The map is initialized with integer zeros just above, so it is currently safe — but the pattern is fragile: if a future developer adds a new status key with a non-integer default, or if a copy-paste creates a key mismatch, the handler will crash with an unrecovered panic, taking down the entire Fiber server process.

**Fix:** Use comma-ok assertions or switch to a typed struct:
```go
if v, ok := summary["healthy"].(int); ok {
    summary["healthy"] = v + 1
}
```

---

### H-014 — Raw errors in drasi_proxy.go expose internal cluster details

**File:** `pkg/api/handlers/drasi_proxy.go`  
**Lines:** 143, 162, 170  

**Code:**
```go
return fiber.NewError(fiber.StatusBadRequest, err.Error())
return fiber.NewError(fiber.StatusBadRequest,
    fmt.Sprintf("unknown cluster %q: %v", cluster, err))
return fiber.NewError(fiber.StatusInternalServerError,
    fmt.Sprintf("kubeclient init failed: %v", err))
```

**Problem:** Line 162 returns the cluster name + raw Kubernetes client error. Line 170 returns raw kubeconfig/client init failure details. These expose cluster topology and configuration to the client.

---

## MEDIUM SEVERITY

### M-006 — Anthropic API key stored in `localStorage` (plaintext)

**File:** `web/src/components/cards/console-missions/shared.tsx`  
**Lines:** 13, 54, 63  

**Code:**
```typescript
export const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'
// ...
const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
```

**Problem:** The Anthropic API key is persisted in `localStorage` which is readable by any JavaScript on the same origin. A single XSS vulnerability (or a malicious browser extension) can exfiltrate this key. `localStorage` has no expiry, so keys persist indefinitely — even after the user stops using the console.

**Fix:** Use `sessionStorage` instead of `localStorage` (clears when tab closes). If persistence across sessions is required, prompt the user to re-enter the key instead of persisting it.

---

### M-007 — H-007 in Round 2 is already fixed

**File:** `.github/workflows/fullstack-e2e.yml`  
**Status:** ✅ Fixed — `timeout-minutes: 30` is now present. Remove from the open tracking list.

---

### M-008 — `console_persistence.go` leaks ManagedWorkload and cluster resolution errors

**File:** `pkg/api/handlers/console_persistence.go`  
**Lines:** 641, 651  

**Code:**
```go
fmt.Sprintf("Failed to resolve ManagedWorkload: %v", err), updateStatus)
fmt.Sprintf("Failed to resolve target clusters: %v", err), updateStatus)
```

**Problem:** These formatted error strings include raw errors from Kubernetes / internal resolvers. Depending on how `updateStatus` surfaces these to the client, internal resource names and cluster topology may be exposed.

**Fix:** Verify whether `updateStatus` writes these strings to the HTTP response; if so, replace with generic messages and log the raw error separately.

---

## Summary

| ID | Severity | File | Status |
|----|----------|------|--------|
| C-001 | Critical | `pkg/api/handlers/gitops_argo.go:56,110` | Open |
| C-002 | Critical | `pkg/api/handlers/kagent_proxy.go:39,51,81,148` | Open |
| C-003 | Critical | `pkg/api/handlers/kagenti_provider_proxy.go:36,48,78,117` | Open |
| C-004 | Critical | `.github/workflows/ai-fix.yml:12`, `copilot-automation.yml:10` | Open |
| H-008 | High | `pkg/api/handlers/gitops_argo.go:215,259,310,385` | Open |
| H-009 | High | `pkg/api/handlers/quantum_proxy.go:67,81,109,123,156,170` | Open |
| H-010 | High | `pkg/api/handlers/topology.go:87,91,95,99,132` | Open |
| H-011 | High | `pkg/api/handlers/github_pipelines.go:1397,1460,1466` | Open |
| H-012 | High | `pkg/api/handlers/gitops.go:280,556` | Open |
| H-013 | High | `pkg/api/handlers/gitops_argo.go:276–329` | Open |
| H-014 | High | `pkg/api/handlers/drasi_proxy.go:143,162,170` | Open |
| M-006 | Medium | `web/src/components/cards/console-missions/shared.tsx:13,54,63` | Open |
| M-007 | Medium | `.github/workflows/fullstack-e2e.yml` | ✅ Fixed |
| M-008 | Medium | `pkg/api/handlers/console_persistence.go:641,651` | Needs verification |

---

## Systemic Recommendation

The root cause for C-001 through H-014 is the same: **no project-wide policy preventing `err.Error()` or `fmt.Sprintf("...: %v", err)` in HTTP responses.** Consider:

1. Adding a Go linter rule (e.g. `errcheck` + a custom `noleak` rule) that flags any `fiber.Map{"error": ...}` where the value is not a string literal.
2. Creating a shared helper: `func clientError(msg string) fiber.Map { return fiber.Map{"error": msg} }` — callers are forced to pass a controlled string.
3. Adding a security test: an integration test that triggers known error paths and asserts the response body contains no Go error formatting artefacts (`%!`, `failed to`, raw stack traces, IP patterns).

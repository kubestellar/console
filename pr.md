### 📌 Fixes

Resolves #<issue-number>

---

### 📝 Summary of Changes

- Introduced comprehensive unit tests for the KC Agent HTTP translation layer (`pkg/agent/server_http.go`) by establishing a new test suite file: `pkg/agent/server_http_test.go`.
- Enforces reliability and correctly scoped sanitization for translation of cluster payloads towards external REST interfaces.

---

### Changes Made

- [x] Added `TestMapK8sErrorToHTTP` to verify `mapK8sErrorToHTTP` properly intercepts native Kubernetes API errors (e.g., `StatusNotFound`, `StatusForbidden`) and translates them into appropriate HTTP status codes (404, 403, 409).
- [x] Added `TestResourceHandlers_QueryExtraction` providing a mock `k8s.MultiClusterClient` utilizing `fakek8s.NewSimpleClientset` to intercept `handleNodesHTTP` and `handleDeploymentsHTTP`, verifying that `?cluster=` and `?namespace=` parameters are predictably passed from HTTP request structs to the fake client.
- [x] Added `TestMutationLogic_CreateNamespaceHTTP` to verify the `createNamespaceHTTP` handler reliably decodes JSON POST payloads and executes the native Kubernetes `k8sClient.CreateNamespace` API underneath.
- [x] Added `TestMutationLogic_CreateServiceAccountHTTP` to verify the `handleServiceAccountsHTTP` component reliably translates simulated POST payloads directly into Kubernetes `CreateAction` payloads.

---

### Checklist

Please ensure the following before submitting your PR:

- [x] I used a coding agent (Claude Code, Copilot, Gemini, or Codex) to generate/review this code
- [x] I have reviewed the project's contribution guidelines
- [x] New cards target [console-marketplace](https://github.com/kubestellar/console-marketplace), not this repo
- [x] isDemoData is wired correctly (cards show Demo badge when using demo data)
- [x] I have written unit tests for the changes (if applicable)
- [x] I have tested the changes locally and ensured they work as expected
- [ ] All commits are signed with DCO (`git commit -s`)

---

### Screenshots or Logs (if applicable)

```
$ go test -v -run "TestMapK8sErrorToHTTP|TestResourceHandlers_QueryExtraction|TestMutationLogic_" ./pkg/agent/...
=== RUN   TestMapK8sErrorToHTTP
    --- PASS: TestMapK8sErrorToHTTP/AlreadyExists (0.00s)
    --- PASS: TestMapK8sErrorToHTTP/Forbidden (0.00s)
    --- PASS: TestMapK8sErrorToHTTP/NotFound (0.00s)
...
=== RUN   TestResourceHandlers_QueryExtraction
    --- PASS: TestResourceHandlers_QueryExtraction/handleNodesHTTP (0.00s)
    --- PASS: TestResourceHandlers_QueryExtraction/handleDeploymentsHTTP (0.00s)
=== RUN   TestMutationLogic_CreateNamespaceHTTP
--- PASS: TestMutationLogic_CreateNamespaceHTTP (0.00s)
=== RUN   TestMutationLogic_CreateServiceAccountHTTP
--- PASS: TestMutationLogic_CreateServiceAccountHTTP (0.00s)
PASS
```

---

### 👀 Reviewer Notes

* The `fakek8s` client library provides an easy and precise way to establish API testing interceptors directly instead of mocking the entire struct manually. We extract `fakeCS.Actions()` to review exactly how our logic interacts internally with `clitesting`.

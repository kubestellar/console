package gitops

// demo_sse_test.go raises coverage on the SSE stream handlers by exercising
// their X-Demo-Mode fast path, and covers the small requireAdmin/isDemoMode
// wrappers that had no test coverage. It also drives the single-cluster path
// of ListHelmReleases / ListKustomizations via fake kubectl/helm binaries.
//
// Related issue: kubestellar/console#22616 — raise pkg/api/handlers/gitops
// coverage above 39.2%.

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// writeFakeKubectlBin creates a temporary directory with a fake `kubectl`
// script prepended to PATH. Returns the tempdir so callers can register
// additional binaries in the same directory (e.g. `helm`).
func writeFakeKubectlBin(t *testing.T, script string) string {
	t.Helper()
	binDir := t.TempDir()
	kubectlPath := filepath.Join(binDir, "kubectl")
	require.NoError(t, os.WriteFile(kubectlPath, []byte(script), 0o755))
	originalPath := os.Getenv("PATH")
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+originalPath)
	return binDir
}

// writeFakeBin drops an executable at binDir/name with the given script.
func writeFakeBin(t *testing.T, binDir, name, script string) {
	t.Helper()
	p := filepath.Join(binDir, name)
	require.NoError(t, os.WriteFile(p, []byte(script), 0o755))
}

// readSSEBody reads the full SSE response body and returns it as a string so
// tests can assert on individual event lines.
func readSSEBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return string(b)
}

// resetOperatorCache clears the package-level operator cache so tests that
// exercise ListOperators / StreamOperators can populate fresh data without
// picking up entries from an earlier test's fake kubectl script.
func resetOperatorCache(t *testing.T) {
	t.Helper()
	operatorCacheMu.Lock()
	for k := range operatorCacheData {
		delete(operatorCacheData, k)
	}
	operatorCacheMu.Unlock()
	t.Cleanup(func() {
		operatorCacheMu.Lock()
		for k := range operatorCacheData {
			delete(operatorCacheData, k)
		}
		operatorCacheMu.Unlock()
	})
}

// -----------------------------------------------------------------------------
// Stream* handlers — X-Demo-Mode fast path
// -----------------------------------------------------------------------------

func TestStreamOperators_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/operators/stream", handler.StreamOperators)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/operators/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: cluster_data")
	assert.Contains(t, body, "event: done")
	// Demo payload uses the "operators" key.
	assert.Contains(t, body, `"operators"`)
	assert.Contains(t, body, "prometheus-operator")
}

func TestStreamOperatorSubscriptions_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/subscriptions/stream", handler.StreamOperatorSubscriptions)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: cluster_data")
	assert.Contains(t, body, "event: done")
	assert.Contains(t, body, `"subscriptions"`)
}

func TestStreamHelmReleases_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm/stream", handler.StreamHelmReleases)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: cluster_data")
	assert.Contains(t, body, "event: done")
	assert.Contains(t, body, `"releases"`)
}

// -----------------------------------------------------------------------------
// Stream* handlers — no-cluster-access branch (k8sClient == nil)
// -----------------------------------------------------------------------------

func TestStreamOperators_NoClusterAccess(t *testing.T) {
	app := fiber.New()
	// k8sClient nil AND no demo-mode header → ErrNoClusterAccess (503)
	handler := NewGitOpsHandlers(nil, nil, nil)
	app.Get("/api/gitops/operators/stream", handler.StreamOperators)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/operators/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestStreamOperatorSubscriptions_NoClusterAccess(t *testing.T) {
	app := fiber.New()
	handler := NewGitOpsHandlers(nil, nil, nil)
	app.Get("/api/gitops/subscriptions/stream", handler.StreamOperatorSubscriptions)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestStreamHelmReleases_NoClusterAccess(t *testing.T) {
	app := fiber.New()
	handler := NewGitOpsHandlers(nil, nil, nil)
	app.Get("/api/gitops/helm/stream", handler.StreamHelmReleases)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/stream", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// requireAdmin wrapper (gitops/helpers.go)
// -----------------------------------------------------------------------------

// TestRequireAdmin_NilStore ensures the wrapper is a no-op when userStore is
// nil — matching NewGitOpsHandlers' documented dev/demo/unit-test behavior.
func TestRequireAdmin_NilStore(t *testing.T) {
	app := fiber.New()
	app.Get("/probe", func(c *fiber.Ctx) error {
		if err := requireAdmin(c, nil); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, err := http.NewRequest(http.MethodGet, "/probe", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// TestRequireAdmin_AdminUser exercises the happy path — the admin user
// pre-configured by setupTestEnv is accepted by requireAdmin.
func TestRequireAdmin_AdminUser(t *testing.T) {
	env := setupTestEnv(t)
	env.App.Get("/probe", func(c *fiber.Ctx) error {
		if err := requireAdmin(c, env.Store); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, err := http.NewRequest(http.MethodGet, "/probe", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// TestRequireAdmin_NonAdminForbidden verifies non-admin users get 403 back.
func TestRequireAdmin_NonAdminForbidden(t *testing.T) {
	viewerID := uuid.MustParse("00000000-0000-0000-0000-000000000099")
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", viewerID).Return(&models.User{
		ID:   viewerID,
		Role: "viewer",
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", viewerID)
		return c.Next()
	})
	app.Get("/probe", func(c *fiber.Ctx) error {
		if err := requireAdmin(c, mockStore); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, err := http.NewRequest(http.MethodGet, "/probe", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// ListHelmReleases — single-cluster path via getHelmReleasesViaExec fallback
// -----------------------------------------------------------------------------

// TestListHelmReleases_ValidationBadCluster covers the input-validation branch
// which returns 400 for malformed cluster names.
func TestListHelmReleases_ValidationBadCluster(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm", handler.ListHelmReleases)

	req, err := http.NewRequest(http.MethodGet,
		"/api/gitops/helm?cluster="+url.QueryEscape("bad;name"), nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestListHelmReleases_UnknownClusterViaExec forces the code path down to
// getHelmReleasesViaExec by requesting a cluster name that is not registered
// with the fake k8s client. The fake helm binary emits an empty JSON array,
// so we get a valid 200 response with an empty release list. This drives
// getHelmReleasesForCluster + getHelmReleasesViaExec + listHelmReleasesForCluster.
func TestListHelmReleases_UnknownClusterViaExec(t *testing.T) {
	binDir := writeFakeKubectlBin(t, `#!/bin/sh
# Some code paths in getHelmReleasesForCluster fall back to secret-listing via
# kubectl. Return a plausible empty JSON so callers don't blow up on parse.
echo '{"items":[]}'
`)
	writeFakeBin(t, binDir, "helm", `#!/bin/sh
# helm ls -A --output json → empty list
echo '[]'
`)

	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm", handler.ListHelmReleases)

	// "unknown-cluster" is not in the fake k8s client, so
	// getHelmReleasesForCluster falls through to the exec path.
	req, err := http.NewRequest(http.MethodGet,
		"/api/gitops/helm?cluster=unknown-cluster", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// ListKustomizations — single-cluster path via fake kubectl
// -----------------------------------------------------------------------------

func TestListKustomizations_ValidationBadCluster(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/kustomizations", handler.ListKustomizations)

	req, err := http.NewRequest(http.MethodGet,
		"/api/gitops/kustomizations?cluster="+url.QueryEscape("bad;name"), nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestListKustomizations_SingleCluster(t *testing.T) {
	writeFakeKubectlBin(t, `#!/bin/sh
# Handler expects Flux Kustomization list JSON. Return one entry so
# getKustomizationsForCluster's decode path runs.
cat <<'EOF'
{
  "items": [
    {
      "metadata": {"name": "app", "namespace": "flux-system"},
      "spec": {
        "path": "./apps",
        "sourceRef": {"kind": "GitRepository", "name": "cluster-config"}
      },
      "status": {
        "conditions": [
          {"type": "Ready", "status": "True", "message": "Applied revision"}
        ]
      }
    }
  ]
}
EOF
`)

	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/kustomizations", handler.ListKustomizations)

	req, err := http.NewRequest(http.MethodGet,
		"/api/gitops/kustomizations?cluster=test-cluster", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// StopOperatorCacheEvictor — lifecycle guard
// -----------------------------------------------------------------------------

// TestStopOperatorCacheEvictor_NoStartIsSafe verifies calling
// StopOperatorCacheEvictor when the evictor was never started does not panic
// and closes cleanly.
func TestStopOperatorCacheEvictor_NoStartIsSafe(t *testing.T) {
	// Guard against any hangs from an unbounded wait inside Stop.
	done := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		defer close(done)
		StopOperatorCacheEvictor()
	}()

	select {
	case <-done:
		// pass
	case <-ctx.Done():
		t.Fatal("StopOperatorCacheEvictor deadlocked")
	}
}

// -----------------------------------------------------------------------------
// All-clusters fan-out paths (no ?cluster= query param)
// -----------------------------------------------------------------------------
//
// These hit the HealthyClusters-driven fan-out branches, exercising the parallel
// goroutine bookkeeping and error aggregation code in ListOperators /
// ListOperatorSubscriptions / ListHelmReleases / ListKustomizations. The
// fake k8s client registered by setupTestEnv reports "test-cluster" as healthy.

func TestListOperators_AllClustersFanOut(t *testing.T) {
	resetOperatorCache(t)
	writeFakeKubectlBin(t, `#!/bin/sh
found=0
for a in "$@"; do
  if [ "$a" = "csv" ]; then found=1; fi
done
if [ "$found" -eq 1 ]; then
  echo '{"items":[{"metadata":{"name":"fan-op","namespace":"default"},"spec":{"displayName":"Fan Op","version":"1.0.0"},"status":{"phase":"Succeeded"}}]}'
fi
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/operators", handler.ListOperators)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/operators", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestListOperatorSubscriptions_AllClustersFanOut(t *testing.T) {
	resetOperatorCache(t)
	writeFakeKubectlBin(t, `#!/bin/sh
found=0
for a in "$@"; do
  if [ "$a" = "subscriptions.operators.coreos.com" ]; then found=1; fi
done
if [ "$found" -eq 1 ]; then
  printf "sub\tdefault\tstable\toperatorhub\tAutomatic\top.v1\top.v1\n"
fi
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/subscriptions", handler.ListOperatorSubscriptions)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestListHelmReleases_AllClustersFanOut(t *testing.T) {
	binDir := writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	writeFakeBin(t, binDir, "helm", `#!/bin/sh
echo '[]'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm", handler.ListHelmReleases)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/helm", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestListKustomizations_AllClustersFanOut(t *testing.T) {
	writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/kustomizations", handler.ListKustomizations)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/kustomizations", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// Stream* — all-clusters SSE path (drives the parallel wg + per-cluster ctx loop)
// -----------------------------------------------------------------------------

func TestStreamOperators_AllClustersSSE(t *testing.T) {
	resetOperatorCache(t)
	writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/operators/stream", handler.StreamOperators)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/operators/stream", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: done")
}

func TestStreamOperatorSubscriptions_AllClustersSSE(t *testing.T) {
	writeFakeKubectlBin(t, `#!/bin/sh
echo ''
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/subscriptions/stream", handler.StreamOperatorSubscriptions)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions/stream", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: done")
}

func TestStreamHelmReleases_AllClustersSSE(t *testing.T) {
	binDir := writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	writeFakeBin(t, binDir, "helm", `#!/bin/sh
echo '[]'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm/stream", handler.StreamHelmReleases)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/helm/stream", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: done")
}

// -----------------------------------------------------------------------------
// Stream* — single-cluster SSE path (no demo mode)
// -----------------------------------------------------------------------------

func TestStreamOperators_SingleClusterSSE(t *testing.T) {
	resetOperatorCache(t)
	writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/operators/stream", handler.StreamOperators)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/operators/stream?cluster=test-cluster", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: done")
}

func TestStreamHelmReleases_SingleClusterSSE(t *testing.T) {
	binDir := writeFakeKubectlBin(t, `#!/bin/sh
echo '{"items":[]}'
`)
	writeFakeBin(t, binDir, "helm", `#!/bin/sh
echo '[]'
`)
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm/stream", handler.StreamHelmReleases)

	req, _ := http.NewRequest(http.MethodGet, "/api/gitops/helm/stream?cluster=test-cluster", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: done")
}

// -----------------------------------------------------------------------------
// streamDemoSSE (helpers.go) — direct call
// -----------------------------------------------------------------------------

func TestStreamDemoSSE_LocalHelper(t *testing.T) {
	app := fiber.New()
	app.Get("/demo", func(c *fiber.Ctx) error {
		return streamDemoSSE(c, "widgets", []string{"a", "b"})
	})

	req, _ := http.NewRequest(http.MethodGet, "/demo", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: connected")
	assert.Contains(t, body, "event: demo_data")
	assert.Contains(t, body, "event: done")
	assert.Contains(t, body, `"widgets"`)
}

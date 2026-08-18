package mcp

// sse_stream_handlers_test.go raises coverage on the SSE stream handlers in
// sse_handler.go (all previously at 0.0% coverage) by exercising:
//
//   - The X-Demo-Mode fast path (returns streamDemoSSE with a fixed dataset)
//   - The nil-k8sClient fallback (either ErrNoClusterAccess=503 or
//     streamEmptySSE=200 with a `done` frame)
//
// Related issue: kubestellar/console#22613 — raise pkg/api/handlers/mcp
// coverage from 44.7%.

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// streamHandlerRoute defines a single SSE stream handler test case.
type streamHandlerRoute struct {
	name    string
	path    string
	setup   func(h *MCPHandlers, app *fiber.App)
	demoKey string
	// noAccess describes what happens when k8sClient is nil AND demo mode is
	// off. Some handlers return 503 ErrNoClusterAccess; others degrade to an
	// empty SSE stream (200 with just a `done` frame) so the frontend does not
	// flash an error banner while clusters are being provisioned.
	noAccess noAccessBehavior
	// needsAuth means the handler runs RequireEditorOrAdmin BEFORE the demo
	// check (i.e., GetSecretsStream). We must inject an admin userID to reach
	// the demo/handler code, or auth will short-circuit with 401/403.
	needsAuth bool
}

type noAccessBehavior int

const (
	noAccess503 noAccessBehavior = iota
	noAccessEmptyStream
)

// allStreamHandlers returns every SSE stream handler in sse_handler.go.
// Add new stream handlers here as they land.
func allStreamHandlers() []streamHandlerRoute {
	return []streamHandlerRoute{
		{"GetPodsStream", "/pods/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/pods/stream", h.GetPodsStream) },
			"pods", noAccess503, false},
		{"FindPodIssuesStream", "/pods/issues/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/pods/issues/stream", h.FindPodIssuesStream) },
			"issues", noAccessEmptyStream, false},
		{"GetDeploymentsStream", "/deployments/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/deployments/stream", h.GetDeploymentsStream) },
			"deployments", noAccess503, false},
		{"GetEventsStream", "/events/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/events/stream", h.GetEventsStream) },
			"events", noAccess503, false},
		{"GetServicesStream", "/services/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/services/stream", h.GetServicesStream) },
			"services", noAccess503, false},
		{"CheckSecurityIssuesStream", "/security/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/security/stream", h.CheckSecurityIssuesStream) },
			"issues", noAccessEmptyStream, false},
		{"FindDeploymentIssuesStream", "/deployments/issues/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/deployments/issues/stream", h.FindDeploymentIssuesStream) },
			"issues", noAccessEmptyStream, false},
		{"GetNodesStream", "/nodes/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/nodes/stream", h.GetNodesStream) },
			"nodes", noAccess503, false},
		{"GetGPUNodesStream", "/gpu-nodes/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-nodes/stream", h.GetGPUNodesStream) },
			"nodes", noAccess503, false},
		{"GetGPUNodeHealthStream", "/gpu-nodes/health/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-nodes/health/stream", h.GetGPUNodeHealthStream) },
			"nodes", noAccess503, false},
		{"GetWarningEventsStream", "/events/warnings/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/events/warnings/stream", h.GetWarningEventsStream) },
			"events", noAccessEmptyStream, false},
		{"GetJobsStream", "/jobs/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/jobs/stream", h.GetJobsStream) },
			"jobs", noAccess503, false},
		{"GetConfigMapsStream", "/configmaps/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/configmaps/stream", h.GetConfigMapsStream) },
			"configmaps", noAccess503, false},
		{"GetSecretsStream", "/secrets/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/secrets/stream", h.GetSecretsStream) },
			"secrets", noAccess503, true},
		{"GetWorkloadsStream", "/workloads/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/workloads/stream", h.GetWorkloadsStream) },
			"workloads", noAccess503, false},
		{"GetNVIDIAOperatorStatusStream", "/nvidia-operator/stream",
			func(h *MCPHandlers, app *fiber.App) { app.Get("/nvidia-operator/stream", h.GetNVIDIAOperatorStatusStream) },
			"operators", noAccess503, false},
	}
}

// adminAuthMiddleware injects the setupTestEnv's admin userID into Fiber
// locals so RequireEditorOrAdmin resolves to the pre-configured admin user
// without needing to build the full auth middleware stack.
func adminAuthMiddleware(c *fiber.Ctx) error {
	c.Locals("userID", testAdminUserID)
	return c.Next()
}

// TestStreamHandlers_DemoMode verifies every stream handler returns 200 with
// demo-labeled SSE data when X-Demo-Mode is set. This drives the first branch
// of every Stream* function (previously 0.0% coverage) plus the local
// streamDemoSSE helper and the `demo_data` cluster_data + done frames.
func TestStreamHandlers_DemoMode(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allStreamHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newErrorApp()
			h := NewMCPHandlers(nil, nil, env.Store)
			if hr.needsAuth {
				app.Use(adminAuthMiddleware)
			}
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path, nil)
			req.Header.Set("X-Demo-Mode", "true")
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode,
				"demo mode should return 200")
			assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"),
				"demo mode should stream SSE")

			body, _ := io.ReadAll(resp.Body)
			s := string(body)
			// The local streamDemoSSE helper in sse_mcp_helpers.go emits a
			// three-frame envelope: connected, demo_data, done.
			assert.Contains(t, s, "event: demo_data",
				"demo mode should emit a demo_data SSE frame")
			assert.Contains(t, s, "event: done",
				"demo mode should terminate with a done frame")
			assert.Contains(t, s, hr.demoKey,
				"demo demo_data should include the %q key", hr.demoKey)
			assert.Contains(t, s, `"source":"demo"`,
				"demo demo_data should mark the source as demo")
		})
	}
}

// TestStreamHandlers_NoClusterAccess verifies the k8sClient==nil branch:
//   - handlers marked noAccess503 return 503 with the ErrNoClusterAccess body
//   - handlers marked noAccessEmptyStream return 200 SSE with just a done frame
//     so the frontend does not flash a spurious error banner during cluster
//     provisioning.
func TestStreamHandlers_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allStreamHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newErrorApp()
			h := NewMCPHandlers(nil, nil, env.Store)
			if hr.needsAuth {
				app.Use(adminAuthMiddleware)
			}
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)

			switch hr.noAccess {
			case noAccess503:
				assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode,
					"nil k8sClient should return 503")
			case noAccessEmptyStream:
				assert.Equal(t, fiber.StatusOK, resp.StatusCode,
					"nil k8sClient should degrade to an empty SSE stream")
				body, _ := io.ReadAll(resp.Body)
				assert.Contains(t, string(body), "event: "+sseEventDone,
					"empty SSE stream must emit a done frame")
			}
		})
	}
}

// TestStreamEmptySSE_DirectCall exercises streamEmptySSE via a bare fiber
// route so the writer path (headers + done frame) is covered even when no
// Stream* handler happens to take that branch during a single test run.
func TestStreamEmptySSE_DirectCall(t *testing.T) {
	app := fiber.New()
	app.Get("/empty", streamEmptySSE)

	req := httptest.NewRequest(http.MethodGet, "/empty", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body, _ := io.ReadAll(resp.Body)
	s := string(body)
	assert.Contains(t, s, "event: "+sseEventDone)
	assert.Contains(t, s, `"totalClusters":0`)
	assert.Contains(t, s, `"skippedOffline":0`)
}

// -----------------------------------------------------------------------------
// resources.go and custom_resources.go — non-stream handlers that were 0.0%
// covered before this file. Each covers the demo, no-cluster-access, and
// (where applicable) validation branches.
// -----------------------------------------------------------------------------

// TestGetSecrets_DemoMode drives GetSecrets past the auth check and into the
// demo fast path served by withDemoFallback.
func TestGetSecrets_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/secrets", h.GetSecrets)

	req := httptest.NewRequest(http.MethodGet, "/secrets", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "secrets")
}

// TestGetSecrets_NoClusterAccess drives GetSecrets past the auth check and
// into the k8sClient==nil branch (ErrNoClusterAccess = 503).
func TestGetSecrets_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/secrets", h.GetSecrets)

	req := httptest.NewRequest(http.MethodGet, "/secrets", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestGetSecrets_InvalidCluster covers the mcpValidateClusterAndNamespace
// short-circuit that returns 400.
func TestGetSecrets_InvalidCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/secrets", h.GetSecrets)

	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=BAD!name", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetPodNetworkStats_DemoMode drives GetPodNetworkStats' demo fast path.
func TestGetPodNetworkStats_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/network-stats", h.GetPodNetworkStats)

	req := httptest.NewRequest(http.MethodGet, "/network-stats", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "stats")
}

// TestGetPodNetworkStats_NoClusterAccess covers the ErrNoClusterAccess branch.
func TestGetPodNetworkStats_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/network-stats", h.GetPodNetworkStats)

	req := httptest.NewRequest(http.MethodGet, "/network-stats", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestGetResourceYAML_DemoMode covers the demo branch (returns empty yaml).
func TestGetResourceYAML_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/yaml", h.GetResourceYAML)

	req := httptest.NewRequest(http.MethodGet, "/yaml", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"source":"demo"`)
}

// TestGetResourceYAML_Stub covers the non-demo stub branch.
func TestGetResourceYAML_Stub(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/yaml", h.GetResourceYAML)

	req := httptest.NewRequest(http.MethodGet, "/yaml", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"source":"stub"`)
}

// TestGetCustomResources_DemoMode covers the demo fast-path returning an
// empty item list flagged as demo data.
func TestGetCustomResources_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet, "/cr", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"isDemoData":true`)
}

// TestGetCustomResources_MissingGVR — with no group/version/resource query
// params the handler returns an empty list (200) so React mount races don't
// flash errors.
func TestGetCustomResources_MissingGVR(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet, "/cr", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"items":[]`)
}

// TestGetCustomResources_InvalidGroup covers the 400 branch for invalid GVR
// group parameter.
func TestGetCustomResources_InvalidGroup(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet,
		"/cr?group=BAD!&version=v1&resource=widgets", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetCustomResources_InvalidVersion covers the 400 branch for a version
// that violates the Kubernetes naming rules.
func TestGetCustomResources_InvalidVersion(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet,
		"/cr?group=example.com&version=BAD!&resource=widgets", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetCustomResources_InvalidResource covers the 400 branch for an invalid
// resource parameter.
func TestGetCustomResources_InvalidResource(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet,
		"/cr?group=example.com&version=v1&resource=BAD!", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetCustomResources_NoClusterAccess drives the nil-k8sClient branch
// (returns 503 with the empty demo-flagged body per #7973).
func TestGetCustomResources_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	app.Use(adminAuthMiddleware)
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/cr", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet,
		"/cr?group=example.com&version=v1&resource=widgets", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestCallOpsTool_NoBridge / TestCallDeployTool_NoBridge exist in
// resources_handlers_test.go — do not duplicate here.


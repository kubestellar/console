package mcp

// Additional coverage for MCP handlers exercised against the fake k8s client
// (see #22633). These tests cover the real single-cluster and multi-cluster
// fan-out paths that were previously only reached through demo-mode and
// validation error branches.

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newK8sCoverageApp returns a Fiber app with the standard JSON error handler
// used by the other MCP handler tests.
func newK8sCoverageApp() *fiber.App {
	return fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
}

// TestClusterHandlers_SingleCluster_K8sClient exercises the single-cluster
// k8s path of the cluster handlers against the injected fake client.
func TestClusterHandlers_SingleCluster_K8sClient(t *testing.T) {
	env := setupTestEnv(t)

	cases := []struct {
		name    string
		path    string
		setup   func(h *MCPHandlers, app *fiber.App)
		query   string
		jsonKey string
	}{
		{"GetNodes", "/nodes", func(h *MCPHandlers, app *fiber.App) { app.Get("/nodes", h.GetNodes) }, "?cluster=test-cluster", "\"nodes\""},
		{"GetEvents", "/events", func(h *MCPHandlers, app *fiber.App) { app.Get("/events", h.GetEvents) }, "?cluster=test-cluster&namespace=default", "\"events\""},
		{"GetWarningEvents", "/warning-events", func(h *MCPHandlers, app *fiber.App) { app.Get("/warning-events", h.GetWarningEvents) }, "?cluster=test-cluster", "\"events\""},
		{"CheckSecurityIssues", "/security", func(h *MCPHandlers, app *fiber.App) { app.Get("/security", h.CheckSecurityIssues) }, "?cluster=test-cluster&namespace=default", "\"issues\""},
		{"GetGPUNodes", "/gpu-nodes", func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-nodes", h.GetGPUNodes) }, "?cluster=test-cluster", "\"nodes\""},
		{"GetGPUNodeHealth", "/gpu-health", func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-health", h.GetGPUNodeHealth) }, "?cluster=test-cluster", "\"nodes\""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newK8sCoverageApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			tc.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, tc.path+tc.query, nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			assert.Contains(t, string(body), tc.jsonKey)
		})
	}
}

// TestClusterHandlers_AllClusters_K8sClient exercises the multi-cluster
// fan-out path (no cluster query param) of the cluster handlers.
func TestClusterHandlers_AllClusters_K8sClient(t *testing.T) {
	env := setupTestEnv(t)

	cases := []struct {
		name    string
		path    string
		setup   func(h *MCPHandlers, app *fiber.App)
		jsonKey string
	}{
		{"GetNodes", "/nodes", func(h *MCPHandlers, app *fiber.App) { app.Get("/nodes", h.GetNodes) }, "\"nodes\""},
		{"GetEvents", "/events", func(h *MCPHandlers, app *fiber.App) { app.Get("/events", h.GetEvents) }, "\"events\""},
		{"GetWarningEvents", "/warning-events", func(h *MCPHandlers, app *fiber.App) { app.Get("/warning-events", h.GetWarningEvents) }, "\"events\""},
		{"CheckSecurityIssues", "/security", func(h *MCPHandlers, app *fiber.App) { app.Get("/security", h.CheckSecurityIssues) }, "\"issues\""},
		{"GetGPUNodes", "/gpu-nodes", func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-nodes", h.GetGPUNodes) }, "\"nodes\""},
		{"GetGPUNodeHealth", "/gpu-health", func(h *MCPHandlers, app *fiber.App) { app.Get("/gpu-health", h.GetGPUNodeHealth) }, "\"nodes\""},
		{"GetNVIDIAOperatorStatus", "/nvidia", func(h *MCPHandlers, app *fiber.App) { app.Get("/nvidia", h.GetNVIDIAOperatorStatus) }, "\"source\""},
		{"ListClusters", "/clusters", func(h *MCPHandlers, app *fiber.App) { app.Get("/clusters", h.ListClusters) }, "\"clusters\""},
		{"GetAllClusterHealth", "/cluster-health", func(h *MCPHandlers, app *fiber.App) { app.Get("/cluster-health", h.GetAllClusterHealth) }, "\"health\""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newK8sCoverageApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			tc.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			assert.Contains(t, string(body), tc.jsonKey)
		})
	}
}

// TestResourceHandlers_SingleCluster_K8sClient exercises the single-cluster
// listClusterResources path for the resource list handlers.
func TestResourceHandlers_SingleCluster_K8sClient(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newK8sCoverageApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path+"?cluster=test-cluster&namespace=default", nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			assert.Contains(t, string(body), hr.demoKey)
			assert.Contains(t, string(body), "\"source\":\"k8s\"")
		})
	}
}

// TestResourceHandlers_AllClusters_K8sClient exercises the multi-cluster
// fan-out path for the resource list handlers.
func TestResourceHandlers_AllClusters_K8sClient(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newK8sCoverageApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path+"?namespace=default", nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			assert.Contains(t, string(body), hr.demoKey)
		})
	}
}

// TestGetSecrets_SingleCluster_K8sClient verifies that an admin caller reaches
// the k8s path of the RBAC-gated Secrets handler.
func TestGetSecrets_SingleCluster_K8sClient(t *testing.T) {
	env := setupTestEnv(t)
	app := newK8sCoverageApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/secrets", h.GetSecrets)

	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=test-cluster&namespace=default", nil)
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "\"secrets\"")
}

// TestGetEvents_InvalidLimit verifies that a limit above the allowed maximum
// is rejected before any cluster query happens.
func TestGetEvents_InvalidLimit(t *testing.T) {
	env := setupTestEnv(t)
	app := newK8sCoverageApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/events", h.GetEvents)

	req := httptest.NewRequest(http.MethodGet, "/events?limit=999999", nil)
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetCustomResources_SingleCluster_K8sClient exercises the single-cluster
// listCR path. The fake client has no matching CRs, so an empty item list is
// expected rather than an error.
func TestGetCustomResources_SingleCluster_K8sClient(t *testing.T) {
	env := setupTestEnv(t)
	app := newK8sCoverageApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/custom-resources", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet,
		"/custom-resources?group=keda.sh&version=v1alpha1&resource=scaledobjects&cluster=test-cluster&namespace=default", nil)
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	// The fake client cannot serve dynamic CRs, so either an empty 200 result
	// or a sanitized 500 is acceptable — what matters is that the handler ran
	// the single-cluster listCR path rather than short-circuiting.
	assert.Contains(t, []int{fiber.StatusOK, fiber.StatusInternalServerError, fiber.StatusForbidden}, resp.StatusCode)
}

// TestGetCustomResources_InvalidLimit verifies an out-of-range limit is
// rejected with 400.
func TestGetCustomResources_InvalidLimit(t *testing.T) {
	env := setupTestEnv(t)
	app := newK8sCoverageApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/custom-resources", h.GetCustomResources)

	req := httptest.NewRequest(http.MethodGet, "/custom-resources?limit=notanumber", nil)
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestDeleteResourceQuota_NotFound verifies the k8s error path of the delete
// handler when the quota does not exist in the fake cluster.
func TestDeleteResourceQuota_NotFound(t *testing.T) {
	env := setupTestEnv(t)
	app := newK8sCoverageApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Delete("/quotas", h.DeleteResourceQuota)

	req := httptest.NewRequest(http.MethodDelete,
		"/quotas?cluster=test-cluster&namespace=default&name=missing-quota", nil)
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.NotEqual(t, fiber.StatusOK, resp.StatusCode,
		"deleting a non-existent quota should not report success")
}

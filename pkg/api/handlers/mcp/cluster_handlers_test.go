package mcp

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clusterHandlerRoute defines a cluster handler test case.
type clusterHandlerRoute struct {
	name    string
	path    string
	setup   func(h *MCPHandlers, app *fiber.App)
	demoKey string
}

func allClusterHandlers() []clusterHandlerRoute {
	return []clusterHandlerRoute{
		{"ListClusters", "/clusters", func(h *MCPHandlers, app *fiber.App) { app.Get("/clusters", h.ListClusters) }, "clusters"},
		{"GetAllClusterHealth", "/health/all", func(h *MCPHandlers, app *fiber.App) { app.Get("/health/all", h.GetAllClusterHealth) }, "health"},
		{"GetNodes", "/nodes", func(h *MCPHandlers, app *fiber.App) { app.Get("/nodes", h.GetNodes) }, "nodes"},
		{"GetEvents", "/events", func(h *MCPHandlers, app *fiber.App) { app.Get("/events", h.GetEvents) }, "events"},
		{"GetWarningEvents", "/events/warnings", func(h *MCPHandlers, app *fiber.App) { app.Get("/events/warnings", h.GetWarningEvents) }, "events"},
		{"CheckSecurityIssues", "/security", func(h *MCPHandlers, app *fiber.App) { app.Get("/security", h.CheckSecurityIssues) }, "issues"},
	}
}

func newErrorApp() *fiber.App {
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

// TestClusterHandlers_DemoMode verifies that every cluster handler returns
// 200 with demo data when the X-Demo-Mode header is set.
func TestClusterHandlers_DemoMode(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allClusterHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New()
			h := NewMCPHandlers(nil, nil, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path, nil)
			req.Header.Set("X-Demo-Mode", "true")
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode, "demo mode should return 200")

			body, _ := io.ReadAll(resp.Body)
			assert.Contains(t, string(body), hr.demoKey,
				"demo response should contain the %q key", hr.demoKey)
		})
	}
}

// TestClusterHandlers_DemoMode_ClusterHealth verifies GetClusterHealth in demo mode.
func TestClusterHandlers_DemoMode_ClusterHealth(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New()
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/health/:cluster", h.GetClusterHealth)

	req := httptest.NewRequest(http.MethodGet, "/health/test-cluster", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

// TestClusterHandlers_NoClusterAccess verifies that handlers return 503 when
// the k8s client is nil and demo mode is off.
func TestClusterHandlers_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allClusterHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newErrorApp()
			h := NewMCPHandlers(nil, nil, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode,
				"nil k8sClient should return 503")
		})
	}
}

// TestClusterHandlers_NoClusterAccess_ClusterHealth verifies GetClusterHealth
// returns 503 with nil k8sClient.
func TestClusterHandlers_NoClusterAccess_ClusterHealth(t *testing.T) {
	env := setupTestEnv(t)
	app := newErrorApp()
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/health/:cluster", h.GetClusterHealth)

	req := httptest.NewRequest(http.MethodGet, "/health/test-cluster", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestClusterHandlers_InvalidCluster verifies invalid cluster names return 400.
func TestClusterHandlers_InvalidCluster(t *testing.T) {
	env := setupTestEnv(t)

	t.Run("GetClusterHealth_invalid_cluster", func(t *testing.T) {
		app := newErrorApp()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/health/:cluster", h.GetClusterHealth)

		req := httptest.NewRequest(http.MethodGet, "/health/INVALID_UPPER!", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("GetNodes_invalid_cluster", func(t *testing.T) {
		app := newErrorApp()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/nodes", h.GetNodes)

		req := httptest.NewRequest(http.MethodGet, "/nodes?cluster=INVALID!", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("GetEvents_invalid_cluster", func(t *testing.T) {
		app := newErrorApp()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/events", h.GetEvents)

		req := httptest.NewRequest(http.MethodGet, "/events?cluster=INVALID!", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("CheckSecurityIssues_invalid_cluster", func(t *testing.T) {
		app := newErrorApp()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/security", h.CheckSecurityIssues)

		req := httptest.NewRequest(http.MethodGet, "/security?cluster=INVALID!", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}

// TestClusterHandlers_InvalidLimit verifies that events endpoints reject
// invalid limit values.
func TestClusterHandlers_InvalidLimit(t *testing.T) {
	env := setupTestEnv(t)

	cases := []struct {
		name string
		path string
		setup func(h *MCPHandlers, app *fiber.App)
	}{
		{"GetEvents", "/events", func(h *MCPHandlers, app *fiber.App) { app.Get("/events", h.GetEvents) }},
		{"GetWarningEvents", "/events/warnings", func(h *MCPHandlers, app *fiber.App) { app.Get("/events/warnings", h.GetWarningEvents) }},
	}

	for _, tc := range cases {
		t.Run(tc.name+"_negative_limit", func(t *testing.T) {
			app := newErrorApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			tc.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, tc.path+"?cluster=test-cluster&limit=-1", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})

		t.Run(tc.name+"_limit_exceeds_max", func(t *testing.T) {
			app := newErrorApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			tc.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, tc.path+"?cluster=test-cluster&limit=999999", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})
	}
}

// TestGetCostStub verifies the cost stub endpoint always returns 200.
func TestGetCostStub(t *testing.T) {
	app := fiber.New()
	h := NewMCPHandlers(nil, nil, nil)
	app.Get("/cost", h.GetCostStub)

	req := httptest.NewRequest(http.MethodGet, "/cost", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "costs")
	assert.Contains(t, string(body), "OpenCost integration not configured")
}

// TestGetProviderHealthStub_NilClient verifies provider health returns empty
// providers when k8sClient is nil.
func TestGetProviderHealthStub_NilClient(t *testing.T) {
	app := fiber.New()
	h := NewMCPHandlers(nil, nil, nil)
	app.Get("/providers", h.GetProviderHealthStub)

	req := httptest.NewRequest(http.MethodGet, "/providers", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "providers")
}

// TestGetProviderHealthStub_WithClient verifies provider health returns
// cluster data when a k8s client is configured.
func TestGetProviderHealthStub_WithClient(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/providers", h.GetProviderHealthStub)

	req := httptest.NewRequest(http.MethodGet, "/providers", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "providers")
}

// TestGetNamespacesOverview_NilClient verifies namespace overview returns
// empty list when k8sClient is nil.
func TestGetNamespacesOverview_NilClient(t *testing.T) {
	app := fiber.New()
	h := NewMCPHandlers(nil, nil, nil)
	app.Get("/namespaces", h.GetNamespacesOverview)

	req := httptest.NewRequest(http.MethodGet, "/namespaces", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "namespaces")
}

// TestGetNamespacesOverview_WithClient verifies namespace overview uses
// the k8s client to query clusters.
func TestGetNamespacesOverview_WithClient(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/namespaces", h.GetNamespacesOverview)

	req := httptest.NewRequest(http.MethodGet, "/namespaces", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "namespaces")
}

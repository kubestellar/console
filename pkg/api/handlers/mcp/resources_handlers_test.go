package mcp

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// resourceHandlerRoute defines a resource handler test case.
type resourceHandlerRoute struct {
	name    string
	path    string
	setup   func(h *MCPHandlers, app *fiber.App)
	demoKey string
}

func allResourceHandlers() []resourceHandlerRoute {
	return []resourceHandlerRoute{
		{"GetConfigMaps", "/configmaps", func(h *MCPHandlers, app *fiber.App) { app.Get("/configmaps", h.GetConfigMaps) }, "configmaps"},
		{"GetServiceAccounts", "/serviceaccounts", func(h *MCPHandlers, app *fiber.App) { app.Get("/serviceaccounts", h.GetServiceAccounts) }, "serviceAccounts"},
		{"GetPVCs", "/pvcs", func(h *MCPHandlers, app *fiber.App) { app.Get("/pvcs", h.GetPVCs) }, "pvcs"},
		{"GetPVs", "/pvs", func(h *MCPHandlers, app *fiber.App) { app.Get("/pvs", h.GetPVs) }, "pvs"},
		{"GetResourceQuotas", "/quotas", func(h *MCPHandlers, app *fiber.App) { app.Get("/quotas", h.GetResourceQuotas) }, "resourceQuotas"},
		{"GetLimitRanges", "/limits", func(h *MCPHandlers, app *fiber.App) { app.Get("/limits", h.GetLimitRanges) }, "limitRanges"},
		{"GetIngresses", "/ingresses", func(h *MCPHandlers, app *fiber.App) { app.Get("/ingresses", h.GetIngresses) }, "ingresses"},
		{"GetNetworkPolicies", "/netpol", func(h *MCPHandlers, app *fiber.App) { app.Get("/netpol", h.GetNetworkPolicies) }, "networkpolicies"},
		{"GetFlatcarNodes", "/flatcar", func(h *MCPHandlers, app *fiber.App) { app.Get("/flatcar", h.GetFlatcarNodes) }, "nodes"},
	}
}

// namespacedResourceHandlers returns only handlers that validate the namespace
// query parameter via mcpValidateClusterAndNamespace. GetPVs and GetFlatcarNodes
// are cluster-scoped resources and only validate the cluster name.
func namespacedResourceHandlers() []resourceHandlerRoute {
	return []resourceHandlerRoute{
		{"GetConfigMaps", "/configmaps", func(h *MCPHandlers, app *fiber.App) { app.Get("/configmaps", h.GetConfigMaps) }, "configmaps"},
		{"GetServiceAccounts", "/serviceaccounts", func(h *MCPHandlers, app *fiber.App) { app.Get("/serviceaccounts", h.GetServiceAccounts) }, "serviceAccounts"},
		{"GetPVCs", "/pvcs", func(h *MCPHandlers, app *fiber.App) { app.Get("/pvcs", h.GetPVCs) }, "pvcs"},
		{"GetResourceQuotas", "/quotas", func(h *MCPHandlers, app *fiber.App) { app.Get("/quotas", h.GetResourceQuotas) }, "resourceQuotas"},
		{"GetLimitRanges", "/limits", func(h *MCPHandlers, app *fiber.App) { app.Get("/limits", h.GetLimitRanges) }, "limitRanges"},
		{"GetIngresses", "/ingresses", func(h *MCPHandlers, app *fiber.App) { app.Get("/ingresses", h.GetIngresses) }, "ingresses"},
		{"GetNetworkPolicies", "/netpol", func(h *MCPHandlers, app *fiber.App) { app.Get("/netpol", h.GetNetworkPolicies) }, "networkpolicies"},
	}
}

func newResourceErrorApp() *fiber.App {
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

// TestResourceHandlers_DemoMode verifies that resource handlers with demo
// support return 200 with the expected JSON key when X-Demo-Mode is set.
func TestResourceHandlers_DemoMode(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New()
			h := NewMCPHandlers(nil, nil, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path, nil)
			req.Header.Set("X-Demo-Mode", "true")
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode, "demo mode should return 200")

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			assert.Contains(t, string(body), hr.demoKey,
				"demo response should contain the %q key", hr.demoKey)
		})
	}
}

// TestResourceHandlers_DemoMode_WasmCloud verifies wasmCloud endpoints in demo mode.
func TestResourceHandlers_DemoMode_WasmCloud(t *testing.T) {
	env := setupTestEnv(t)

	t.Run("GetWasmCloudHosts", func(t *testing.T) {
		app := fiber.New()
		h := NewMCPHandlers(nil, nil, env.Store)
		app.Get("/wasm/hosts", h.GetWasmCloudHosts)

		req := httptest.NewRequest(http.MethodGet, "/wasm/hosts", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "hosts")
	})

	t.Run("GetWasmCloudActors", func(t *testing.T) {
		app := fiber.New()
		h := NewMCPHandlers(nil, nil, env.Store)
		app.Get("/wasm/actors", h.GetWasmCloudActors)

		req := httptest.NewRequest(http.MethodGet, "/wasm/actors", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "actors")
	})
}

// TestResourceHandlers_NoClusterAccess verifies that handlers return 503 when
// the k8s client is nil and demo mode is off.
func TestResourceHandlers_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newResourceErrorApp()
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

// TestResourceHandlers_InvalidCluster verifies invalid cluster names return 400.
func TestResourceHandlers_InvalidCluster(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newResourceErrorApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path+"?cluster=INVALID_UPPER!", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode,
				"invalid cluster name should return 400")
		})
	}
}

// TestResourceHandlers_InvalidNamespace verifies invalid namespace names return 400.
// Only tests handlers that validate namespace (excludes cluster-scoped GetPVs
// and GetFlatcarNodes which only validate cluster name).
func TestResourceHandlers_InvalidNamespace(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range namespacedResourceHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := newResourceErrorApp()
			h := NewMCPHandlers(nil, env.K8sClient, env.Store)
			hr.setup(h, app)

			req := httptest.NewRequest(http.MethodGet, hr.path+"?cluster=valid&namespace=BAD!NS", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode,
				"invalid namespace should return 400")
		})
	}
}

// TestCreateOrUpdateResourceQuota_MissingBody verifies missing body returns 400.
func TestCreateOrUpdateResourceQuota_MissingBody(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/quotas", h.CreateOrUpdateResourceQuota)

	req := httptest.NewRequest(http.MethodPost, "/quotas", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestCreateOrUpdateResourceQuota_MissingFields verifies missing required fields return 400.
func TestCreateOrUpdateResourceQuota_MissingFields(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/quotas", h.CreateOrUpdateResourceQuota)

	body := `{"cluster":"test-cluster","name":"","namespace":"default","hard":{"cpu":"1"}}`
	req := httptest.NewRequest(http.MethodPost, "/quotas", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestCreateOrUpdateResourceQuota_EmptyHard verifies empty hard limits return 400.
func TestCreateOrUpdateResourceQuota_EmptyHard(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/quotas", h.CreateOrUpdateResourceQuota)

	body := `{"cluster":"test-cluster","name":"my-quota","namespace":"default","hard":{}}`
	req := httptest.NewRequest(http.MethodPost, "/quotas", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestDeleteResourceQuota_MissingParams verifies missing query params return 400.
func TestDeleteResourceQuota_MissingParams(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Delete("/quotas", h.DeleteResourceQuota)

	cases := []struct {
		name  string
		query string
	}{
		{"missing_all", ""},
		{"missing_namespace_and_name", "?cluster=test-cluster"},
		{"missing_name", "?cluster=test-cluster&namespace=default"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/quotas"+tc.query, nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})
	}
}

// TestGetPodLogs_MissingParams verifies missing required params return 400.
func TestGetPodLogs_MissingParams(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/logs", h.GetPodLogs)

	cases := []struct {
		name  string
		query string
	}{
		{"missing_all", ""},
		{"missing_namespace_and_pod", "?cluster=test-cluster"},
		{"missing_pod", "?cluster=test-cluster&namespace=default"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/logs"+tc.query, nil)
			req.Header.Set("X-User-ID", testAdminUserID.String())
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})
	}
}

// TestGetPodLogs_DemoMode verifies pod logs demo mode returns 200.
func TestGetPodLogs_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New()
	h := NewMCPHandlers(nil, nil, env.Store)
	app.Get("/logs", h.GetPodLogs)

	req := httptest.NewRequest(http.MethodGet, "/logs", nil)
	req.Header.Set("X-Demo-Mode", "true")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "logs")
}

// TestCallOpsTool_NoBridge verifies CallOpsTool returns 503 when bridge is nil.
func TestCallOpsTool_NoBridge(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	body := `{"name":"list_clusters","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/ops", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestCallDeployTool_NoBridge verifies CallDeployTool returns 503 when bridge is nil.
func TestCallDeployTool_NoBridge(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/deploy", h.CallDeployTool)

	body := `{"name":"list_clusters","arguments":{}}`
	req := httptest.NewRequest(http.MethodPost, "/deploy", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestCallOpsTool_NilBridgeNoBody verifies CallOpsTool returns 503 when bridge
// is nil regardless of whether a request body is present.
func TestCallOpsTool_NilBridgeNoBody(t *testing.T) {
	env := setupTestEnv(t)
	app := newResourceErrorApp()
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Post("/ops", h.CallOpsTool)

	req := httptest.NewRequest(http.MethodPost, "/ops", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testAdminUserID.String())
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// TestWasmCloudHandlers_NonDemoMode verifies wasmCloud handlers return
// empty lists in non-demo mode (stub implementation).
func TestWasmCloudHandlers_NonDemoMode(t *testing.T) {
	env := setupTestEnv(t)

	t.Run("GetWasmCloudHosts", func(t *testing.T) {
		app := fiber.New()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/wasm/hosts", h.GetWasmCloudHosts)

		req := httptest.NewRequest(http.MethodGet, "/wasm/hosts", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "hosts")
	})

	t.Run("GetWasmCloudActors", func(t *testing.T) {
		app := fiber.New()
		h := NewMCPHandlers(nil, env.K8sClient, env.Store)
		app.Get("/wasm/actors", h.GetWasmCloudActors)

		req := httptest.NewRequest(http.MethodGet, "/wasm/actors", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "actors")
	})
}

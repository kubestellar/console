package mcp

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// handlerRoute pairs a handler method with the route path and JSON key used
// in the demo response.
type handlerRoute struct {
	name    string
	path    string
	setup   func(h *MCPHandlers, app *fiber.App)
	demoKey string // top-level JSON key expected in the demo response
}

// allWorkloadHandlers returns the 12 workload handler registrations.
func allWorkloadHandlers() []handlerRoute {
	return []handlerRoute{
		{"GetPods", "/pods", func(h *MCPHandlers, app *fiber.App) { app.Get("/pods", h.GetPods) }, "pods"},
		{"FindPodIssues", "/pod-issues", func(h *MCPHandlers, app *fiber.App) { app.Get("/pod-issues", h.FindPodIssues) }, "issues"},
		{"FindDeploymentIssues", "/deployment-issues", func(h *MCPHandlers, app *fiber.App) { app.Get("/deployment-issues", h.FindDeploymentIssues) }, "issues"},
		{"GetDeployments", "/deployments", func(h *MCPHandlers, app *fiber.App) { app.Get("/deployments", h.GetDeployments) }, "deployments"},
		{"GetServices", "/services", func(h *MCPHandlers, app *fiber.App) { app.Get("/services", h.GetServices) }, "services"},
		{"GetJobs", "/jobs", func(h *MCPHandlers, app *fiber.App) { app.Get("/jobs", h.GetJobs) }, "jobs"},
		{"GetHPAs", "/hpas", func(h *MCPHandlers, app *fiber.App) { app.Get("/hpas", h.GetHPAs) }, "hpas"},
		{"GetReplicaSets", "/replicasets", func(h *MCPHandlers, app *fiber.App) { app.Get("/replicasets", h.GetReplicaSets) }, "replicasets"},
		{"GetStatefulSets", "/statefulsets", func(h *MCPHandlers, app *fiber.App) { app.Get("/statefulsets", h.GetStatefulSets) }, "statefulsets"},
		{"GetDaemonSets", "/daemonsets", func(h *MCPHandlers, app *fiber.App) { app.Get("/daemonsets", h.GetDaemonSets) }, "daemonsets"},
		{"GetCronJobs", "/cronjobs", func(h *MCPHandlers, app *fiber.App) { app.Get("/cronjobs", h.GetCronJobs) }, "cronjobs"},
		{"GetWorkloads", "/workloads", func(h *MCPHandlers, app *fiber.App) { app.Get("/workloads", h.GetWorkloads) }, "workloads"},
	}
}

// TestWorkloadHandlers_DemoMode verifies that every workload handler returns
// a 200 with demo data when the X-Demo-Mode header is set.
func TestWorkloadHandlers_DemoMode(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allWorkloadHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New()
			// Create handler with nil bridge and nil k8sClient — demo mode
			// should short-circuit before either is used.
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

// TestWorkloadHandlers_NoClusterAccess verifies that handlers return 503 when
// the k8s client is nil and demo mode is off.
func TestWorkloadHandlers_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)

	for _, hr := range allWorkloadHandlers() {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{
				ErrorHandler: func(c *fiber.Ctx, err error) error {
					code := fiber.StatusInternalServerError
					if e, ok := err.(*fiber.Error); ok {
						code = e.Code
					}
					return c.Status(code).JSON(fiber.Map{"error": err.Error()})
				},
			})
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

// TestWorkloadHandlers_InvalidCluster verifies that an invalid cluster name
// returns 400.
func TestWorkloadHandlers_InvalidCluster(t *testing.T) {
	env := setupTestEnv(t)

	// All handlers validate cluster via mcpValidateClusterAndNamespace.
	// Test a representative subset (first two use different code paths).
	handlers := allWorkloadHandlers()

	for _, hr := range handlers {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{
				ErrorHandler: func(c *fiber.Ctx, err error) error {
					code := fiber.StatusInternalServerError
					if e, ok := err.(*fiber.Error); ok {
						code = e.Code
					}
					return c.Status(code).JSON(fiber.Map{"error": err.Error()})
				},
			})
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

// TestWorkloadHandlers_InvalidNamespace verifies that an invalid namespace
// returns 400.
func TestWorkloadHandlers_InvalidNamespace(t *testing.T) {
	env := setupTestEnv(t)

	handlers := allWorkloadHandlers()

	for _, hr := range handlers {
		t.Run(hr.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{
				ErrorHandler: func(c *fiber.Ctx, err error) error {
					code := fiber.StatusInternalServerError
					if e, ok := err.(*fiber.Error); ok {
						code = e.Code
					}
					return c.Status(code).JSON(fiber.Map{"error": err.Error()})
				},
			})
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

// TestGetPods_InvalidLabelSelector verifies that GetPods rejects label
// selectors with disallowed characters.
func TestGetPods_InvalidLabelSelector(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/pods", h.GetPods)

	cases := []struct {
		name     string
		selector string
	}{
		{"semicolon", "app=web;rm -rf /"},
		{"newline", "app=web\ninjected"},
		{"backtick", "app=`whoami`"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/pods?cluster=test-cluster&namespace=default&labelSelector="+url.QueryEscape(tc.selector), nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})
	}
}

// TestGetWorkloads_InvalidType verifies that GetWorkloads rejects unknown
// workload type values.
func TestGetWorkloads_InvalidType(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/workloads", h.GetWorkloads)

	cases := []struct {
		name    string
		qtype   string
		wantOK  bool
	}{
		{"empty is valid", "", true},
		{"Deployment valid", "Deployment", true},
		{"StatefulSet valid", "StatefulSet", true},
		{"DaemonSet valid", "DaemonSet", true},
		{"Pod invalid", "Pod", false},
		{"ReplicaSet invalid", "ReplicaSet", false},
		{"lowercase invalid", "deployment", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := "/workloads?cluster=test-cluster&namespace=default"
			if tc.qtype != "" {
				path += "&type=" + tc.qtype
			}
			req := httptest.NewRequest(http.MethodGet, path, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			if tc.wantOK {
				// Accepted by validation — may still error at k8s layer,
				// but should not be 400.
				assert.NotEqual(t, fiber.StatusBadRequest, resp.StatusCode,
					"valid type %q should not return 400", tc.qtype)
			} else {
				assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode,
					"invalid type %q should return 400", tc.qtype)
			}
		})
	}
}

// TestGetPods_SingleCluster_K8sClient verifies that GetPods returns a
// response from the k8s client when a specific cluster is requested.
func TestGetPods_SingleCluster_K8sClient(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/pods", h.GetPods)

	req := httptest.NewRequest(http.MethodGet,
		"/pods?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	// The fake client has no pods, so we expect 200 with an empty pods array.
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"pods\"")
	assert.Contains(t, string(body), "\"source\":\"k8s\"")
}

// TestGetPods_AllClusters_K8sClient verifies the multi-cluster fan-out path
// when no cluster is specified.
func TestGetPods_AllClusters_K8sClient(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/pods", h.GetPods)

	// No cluster param → triggers multi-cluster fan-out via HealthyClusters.
	req := httptest.NewRequest(http.MethodGet,
		"/pods?namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	// Should succeed (200) or return partial results — not an error.
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"pods\"")
}

// TestFindPodIssues_SingleCluster verifies FindPodIssues with a specific cluster.
func TestFindPodIssues_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/pod-issues", h.FindPodIssues)

	req := httptest.NewRequest(http.MethodGet,
		"/pod-issues?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"issues\"")
	assert.Contains(t, string(body), "\"source\":\"k8s\"")
}

// TestGetDeployments_SingleCluster verifies the k8s client path.
func TestGetDeployments_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/deployments", h.GetDeployments)

	req := httptest.NewRequest(http.MethodGet,
		"/deployments?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"deployments\"")
}

// TestGetServices_SingleCluster verifies the k8s client path.
func TestGetServices_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/services", h.GetServices)

	req := httptest.NewRequest(http.MethodGet,
		"/services?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"services\"")
}

// TestGetJobs_SingleCluster verifies the k8s client path.
func TestGetJobs_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/jobs", h.GetJobs)

	req := httptest.NewRequest(http.MethodGet,
		"/jobs?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"jobs\"")
}

// TestGetStatefulSets_SingleCluster verifies the k8s client path.
func TestGetStatefulSets_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/statefulsets", h.GetStatefulSets)

	req := httptest.NewRequest(http.MethodGet,
		"/statefulsets?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"statefulsets\"")
}

// TestGetDaemonSets_SingleCluster verifies the k8s client path.
func TestGetDaemonSets_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/daemonsets", h.GetDaemonSets)

	req := httptest.NewRequest(http.MethodGet,
		"/daemonsets?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"daemonsets\"")
}

// TestGetCronJobs_SingleCluster verifies the k8s client path.
func TestGetCronJobs_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/cronjobs", h.GetCronJobs)

	req := httptest.NewRequest(http.MethodGet,
		"/cronjobs?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"cronjobs\"")
}

// TestGetHPAs_SingleCluster verifies the k8s client path.
func TestGetHPAs_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/hpas", h.GetHPAs)

	req := httptest.NewRequest(http.MethodGet,
		"/hpas?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"hpas\"")
}

// TestGetReplicaSets_SingleCluster verifies the k8s client path.
func TestGetReplicaSets_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/replicasets", h.GetReplicaSets)

	req := httptest.NewRequest(http.MethodGet,
		"/replicasets?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"replicasets\"")
}

// TestFindDeploymentIssues_SingleCluster verifies the k8s client path.
func TestFindDeploymentIssues_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/deployment-issues", h.FindDeploymentIssues)

	req := httptest.NewRequest(http.MethodGet,
		"/deployment-issues?cluster=test-cluster&namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "\"issues\"")
}

// TestGetWorkloads_SingleCluster verifies the k8s client path with valid type.
func TestGetWorkloads_SingleCluster(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/workloads", h.GetWorkloads)

	req := httptest.NewRequest(http.MethodGet,
		"/workloads?cluster=test-cluster&namespace=default&type=Deployment", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	// May return 200 with empty list or 500 if ListWorkloads isn't available
	// on the fake client — either way, not 400.
	assert.NotEqual(t, fiber.StatusBadRequest, resp.StatusCode)
}

// TestGetServices_AllClusters verifies the multi-cluster fan-out path for
// GetServices, which uses its own concurrency pattern (not queryAllClusters).
func TestGetServices_AllClusters(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/services", h.GetServices)

	// No cluster param → all-clusters path.
	req := httptest.NewRequest(http.MethodGet, "/services?namespace=default", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	assert.Contains(t, bodyStr, "\"services\"")
	assert.Contains(t, bodyStr, "\"clusterCounts\"")
}

// TestGetPods_ClusterNameTooLong verifies that cluster names exceeding the
// max length are rejected.
func TestGetPods_ClusterNameTooLong(t *testing.T) {
	env := setupTestEnv(t)
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	app.Get("/pods", h.GetPods)

	// Build a cluster name that exceeds 253 characters
	longName := make([]byte, 260)
	for i := range longName {
		longName[i] = 'a'
	}
	req := httptest.NewRequest(http.MethodGet,
		"/pods?cluster="+string(longName), nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

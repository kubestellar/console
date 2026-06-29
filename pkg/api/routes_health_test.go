package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newHealthTestServer(t *testing.T, cfg Config) *Server {
	t.Helper()

	s := &Server{
		app:       fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config:    cfg,
		auth:      newAuthRuntime(),
		lifecycle: newServerLifecycle(nil),
	}
	s.setupHealthRoutes()
	return s
}

func TestHealthRoutes_StatusEndpoints(t *testing.T) {
	server := newHealthTestServer(t, Config{
		ServerConfig: ServerConfig{
			ConsoleProject:    "kubestellar",
			EnabledDashboards: "overview, usage , , cost",
		},
		BrandConfig: BrandConfig{
			BrandAppName:      "KubeStellar Console",
			BrandAppShortName: "KubeStellar",
			BrandTagline:      "multi-cluster first",
		},
	})

	tests := []struct {
		name string
		path string
		want map[string]any
	}{
		{
			name: "healthz returns ok status",
			path: "/healthz",
			want: map[string]any{"status": "ok"},
		},
		{
			name: "health returns version info",
			path: "/health",
			want: map[string]any{
				"status":           "ok",
				"version":          Version,
				"oauth_configured": false,
				"in_cluster":       false,
				"no_local_agent":   false,
				"install_method":   detectInstallMethod(false),
				"project":          "kubestellar",
			},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req.Host = "localhost"
			resp, err := server.app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			require.Equal(t, http.StatusOK, resp.StatusCode)

			var body map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			for key, want := range tt.want {
				assert.Equal(t, want, body[key])
			}

			if tt.path == "/health" {
				assert.Equal(t, []any{"overview", "usage", "cost"}, body["enabled_dashboards"])

				workloads, ok := body["workloads"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, false, workloads["quantum_kc_demo_available"])

				branding, ok := body["branding"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, "KubeStellar Console", branding["appName"])
				assert.Equal(t, "KubeStellar", branding["appShortName"])
				assert.Equal(t, "multi-cluster first", branding["tagline"])
				assert.Equal(t, true, branding["showStarDecoration"])
			}
		})
	}
}

func TestHealthRoutes_VersionEndpoint(t *testing.T) {
	originalBuildInfo := buildInfo
	buildInfo = BuildInfo{
		GoVersion:   "go1.test",
		VCSRevision: "abc123",
		VCSTime:     "2026-06-09T00:00:00Z",
		VCSModified: "true",
	}
	t.Cleanup(func() {
		buildInfo = originalBuildInfo
	})

	server := newHealthTestServer(t, Config{})

	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Host = "localhost"
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, Version, body["version"])
	assert.Equal(t, "go1.test", body["go_version"])
	assert.Equal(t, "abc123", body["git_commit"])
	assert.Equal(t, "2026-06-09T00:00:00Z", body["git_time"])
	assert.Equal(t, true, body["git_dirty"])
}

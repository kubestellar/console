package gitops

// coverage_test.go adds tests for functions that were previously uncovered,
// improving coverage across drift.go, handler.go, and helpers.go.
// Related issue: kubestellar/console#22391

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

// ---------------------------------------------------------------------------
// handler.go — isRBACError
// ---------------------------------------------------------------------------

func TestIsRBACError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"forbidden lowercase", errors.New("forbidden: user cannot list"), true},
		{"Forbidden capitalized", errors.New("Forbidden"), true},
		{"cannot list", errors.New("cannot list resource"), true},
		{"unauthorized", errors.New("unauthorized"), true},
		{"unrelated error", errors.New("connection refused"), false},
		{"context deadline", context.DeadlineExceeded, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isRBACError(tt.err))
		})
	}
}

// ---------------------------------------------------------------------------
// handler.go — decodeHelmRelease
// ---------------------------------------------------------------------------

func buildHelmReleaseBlob(t *testing.T, body helmReleaseBody) []byte {
	t.Helper()
	jsonBytes, err := json.Marshal(body)
	require.NoError(t, err)

	var gz bytes.Buffer
	w := gzip.NewWriter(&gz)
	_, err = w.Write(jsonBytes)
	require.NoError(t, err)
	require.NoError(t, w.Close())

	encoded := base64.StdEncoding.EncodeToString(gz.Bytes())
	return []byte(encoded)
}

func TestDecodeHelmRelease(t *testing.T) {
	t.Run("valid release blob", func(t *testing.T) {
		want := helmReleaseBody{}
		want.Chart.Metadata.Name = "nginx"
		want.Chart.Metadata.Version = "15.2.0"
		want.Chart.Metadata.AppVersion = "1.25.0"
		want.Info.Status = "deployed"
		want.Info.LastDeploy = "2024-01-01T00:00:00Z"

		blob := buildHelmReleaseBlob(t, want)
		got, err := decodeHelmRelease(blob)
		require.NoError(t, err)
		assert.Equal(t, "nginx", got.Chart.Metadata.Name)
		assert.Equal(t, "15.2.0", got.Chart.Metadata.Version)
		assert.Equal(t, "deployed", got.Info.Status)
	})

	t.Run("invalid base64", func(t *testing.T) {
		_, err := decodeHelmRelease([]byte("!!!not-base64!!!"))
		assert.Error(t, err)
	})

	t.Run("invalid gzip", func(t *testing.T) {
		encoded := base64.StdEncoding.EncodeToString([]byte("not-gzip-data"))
		_, err := decodeHelmRelease([]byte(encoded))
		assert.Error(t, err)
	})

	t.Run("invalid json inside gzip", func(t *testing.T) {
		var gz bytes.Buffer
		w := gzip.NewWriter(&gz)
		_, err := w.Write([]byte("{invalid json"))
		require.NoError(t, err)
		require.NoError(t, w.Close())
		encoded := base64.StdEncoding.EncodeToString(gz.Bytes())
		_, err = decodeHelmRelease([]byte(encoded))
		assert.Error(t, err)
	})
}

// ---------------------------------------------------------------------------
// helpers.go — waitWithDeadline
// ---------------------------------------------------------------------------

func TestWaitWithDeadline(t *testing.T) {
	t.Run("completes before deadline", func(t *testing.T) {
		var wg sync.WaitGroup
		wg.Add(1)
		cancelled := false
		cancel := func() { cancelled = true }

		go func() {
			time.Sleep(10 * time.Millisecond)
			wg.Done()
		}()

		hit := waitWithDeadline(&wg, cancel, 500*time.Millisecond)
		assert.False(t, hit, "deadline should not have been hit")
		assert.False(t, cancelled)
	})

	t.Run("deadline fires before completion", func(t *testing.T) {
		var wg sync.WaitGroup
		wg.Add(1)
		cancelled := false
		cancel := func() { cancelled = true }

		// goroutine that finishes after the deadline; test does NOT call
		// wg.Done() itself to avoid a double-done panic.
		go func() {
			time.Sleep(2 * time.Second)
			wg.Done()
		}()

		hit := waitWithDeadline(&wg, cancel, 50*time.Millisecond)
		assert.True(t, hit, "deadline should have been hit")
		assert.True(t, cancelled)
	})
}

// ---------------------------------------------------------------------------
// helpers.go — errNoClusterAccess
// ---------------------------------------------------------------------------

func TestErrNoClusterAccess(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		return errNoClusterAccess(c)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, noClusterAccessMsg, body["error"])
}

// ---------------------------------------------------------------------------
// helpers.go — writeSSEEvent
// ---------------------------------------------------------------------------

func TestWriteSSEEvent(t *testing.T) {
	t.Run("writes valid SSE frame", func(t *testing.T) {
		var buf bytes.Buffer
		w := bufio.NewWriter(&buf)

		err := writeSSEEvent(w, "connected", fiber.Map{"status": "ok"})
		require.NoError(t, err)

		out := buf.String()
		assert.Contains(t, out, "event: connected\n")
		assert.Contains(t, out, "data: ")
		assert.Contains(t, out, "\n\n")
	})

	t.Run("sanitizes newlines in event name", func(t *testing.T) {
		var buf bytes.Buffer
		w := bufio.NewWriter(&buf)

		err := writeSSEEvent(w, "evil\ninjection", fiber.Map{"x": 1})
		require.NoError(t, err)

		out := buf.String()
		// The eventName should have the \n stripped, so only one "event:" line
		lines := strings.Split(out, "\n")
		eventLines := 0
		for _, l := range lines {
			if strings.HasPrefix(l, "event:") {
				eventLines++
			}
		}
		assert.Equal(t, 1, eventLines, "injected newline must be stripped from event name")
	})

	t.Run("sanitizes carriage return in event name", func(t *testing.T) {
		var buf bytes.Buffer
		w := bufio.NewWriter(&buf)

		err := writeSSEEvent(w, "bad\revent", fiber.Map{})
		require.NoError(t, err)

		out := buf.String()
		assert.NotContains(t, out, "\r")
	})
}

func TestStreamDemoSSE(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		return streamDemoSSE(c, "widgets", []string{"alpha", "beta"})
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, "event: connected")
	assert.Contains(t, text, "event: demo_data")
	assert.Contains(t, text, "event: done")
	assert.Contains(t, text, `"widgets":["alpha","beta"]`)
	assert.Contains(t, text, `"source":"demo"`)
}

func TestRequireAdmin(t *testing.T) {
	cases := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "admin", role: models.UserRoleAdmin, wantStatus: http.StatusOK},
		{name: "viewer", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mockStore := new(test.MockStore)
			mockStore.On("GetUser", gitopsRBACUserID).Return(&models.User{
				ID:   gitopsRBACUserID,
				Role: tc.role,
			}, nil)

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", gitopsRBACUserID)
				return c.Next()
			})
			app.Get("/test", func(c *fiber.Ctx) error {
				return requireAdmin(c, mockStore)
			})

			req, err := http.NewRequest(http.MethodGet, "/test", nil)
			require.NoError(t, err)
			req.Host = "localhost"

			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)
			assert.Equal(t, tc.wantStatus, resp.StatusCode)
		})
	}
}

func TestListHelmReleases_FallbackToExec(t *testing.T) {
	_, _ = writeFakeHelm(t, "#!/bin/sh\necho \"$@\" > /dev/null\necho '[{\"name\":\"api\",\"namespace\":\"default\",\"revision\":\"1\",\"updated\":\"now\",\"status\":\"deployed\",\"chart\":\"api-1.0.0\",\"app_version\":\"1.0.0\"}]'\n")

	app, handler := setupGitOpsTest()
	app.Get("/test", handler.ListHelmReleases)

	req, err := http.NewRequest(http.MethodGet, "/test?cluster=prod-east", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, `"releases"`)
	assert.Contains(t, text, `"api"`)
	assert.Contains(t, text, `"prod-east"`)
}

func TestListKustomizations_FallbackToExec(t *testing.T) {
	writeFakeKubectl(t, "#!/bin/sh\nfound_kustomizations=0\nfor arg in \"$@\"; do\n    if [ \"$arg\" = \"kustomizations.kustomize.toolkit.fluxcd.io\" ]; then\n        found_kustomizations=1\n    fi\ndone\nif [ \"$found_kustomizations\" -eq 1 ]; then\n    echo '{\"items\":[{\"metadata\":{\"name\":\"apps\",\"namespace\":\"flux-system\"},\"spec\":{\"path\":\"./apps\",\"sourceRef\":{\"kind\":\"GitRepository\",\"name\":\"platform\"}},\"status\":{\"conditions\":[{\"type\":\"Ready\",\"status\":\"True\",\"message\":\"ok\"}],\"lastAppliedRevision\":\"main/abc123\"}}]}'\nfi\n")

	app, handler := setupGitOpsTest()
	app.Get("/test", handler.ListKustomizations)

	req, err := http.NewRequest(http.MethodGet, "/test?cluster=prod-east", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, `"kustomizations"`)
	assert.Contains(t, text, `"apps"`)
	assert.Contains(t, text, `"Ready"`)
}

func TestStopOperatorCacheEvictor(t *testing.T) {
	StopOperatorCacheEvictor()
}

// ---------------------------------------------------------------------------
// helpers.go — handleK8sError
// ---------------------------------------------------------------------------

func TestHandleK8sError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantNil    bool
	}{
		{"nil error returns nil", nil, 0, true},
		{"deadline exceeded returns 504", context.DeadlineExceeded, fiber.StatusGatewayTimeout, false},
		{"context canceled returns 504", context.Canceled, fiber.StatusGatewayTimeout, false},
		{"generic error returns 500", errors.New("some k8s error"), fiber.StatusInternalServerError, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var gotErr error
			app.Get("/test", func(c *fiber.Ctx) error {
				gotErr = handleK8sError(c, tt.err)
				if tt.err != nil {
					// handleK8sError already wrote the response; just propagate.
					return gotErr
				}
				return c.SendStatus(fiber.StatusNoContent)
			})

			req, err := http.NewRequest(http.MethodGet, "/test", nil)
			require.NoError(t, err)
			req.Host = "localhost"

			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)

			if tt.wantNil {
				assert.Nil(t, gotErr)
				assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)
			} else {
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// handler.go — ListKustomizations cluster-name validation
// ---------------------------------------------------------------------------

func TestListKustomizations_ClusterValidation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/kustomizations", handler.ListKustomizations)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/kustomizations?cluster=bad;name", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// handler.go — snapshotDrifts TTL eviction
// ---------------------------------------------------------------------------

func TestSnapshotDrifts_TTLEviction(t *testing.T) {
	h := NewGitOpsHandlers(nil, nil, nil)

	req := DetectDriftRequest{
		RepoURL:   "https://github.com/test/repo",
		Path:      "manifests",
		Cluster:   "prod",
		Namespace: "default",
	}
	res := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "svc", Kind: "Service", Namespace: "default", Field: "spec.replicas", DiffOutput: "changed"},
		},
	}
	h.rememberDrift(req, res)

	// Manually backdate the cache entry so it appears expired.
	key := "https://github.com/test/repo|manifests|prod|default"
	h.driftCacheMu.Lock()
	entry := h.driftCache[key]
	entry.detected = time.Now().Add(-driftCacheTTL - time.Second)
	h.driftCache[key] = entry
	h.driftCacheMu.Unlock()

	got := h.snapshotDrifts("", "")
	assert.Empty(t, got, "expired cache entries should be evicted")
}

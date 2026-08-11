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
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// drift.go — extractYAMLParseError
// ---------------------------------------------------------------------------

func TestExtractYAMLParseError(t *testing.T) {
	tests := []struct {
		name    string
		err     error
		wantMsg bool
	}{
		{"nil error", nil, false},
		{"yaml line error", errors.New("yaml: line 3: mapping values are not allowed here"), true},
		{"yaml unmarshal error", errors.New("yaml: unmarshal error"), true},
		{"error parsing", errors.New("Error parsing YAML: unexpected token"), true},
		{"did not find expected", errors.New("did not find expected key"), true},
		{"could not find expected", errors.New("could not find expected end of stream"), true},
		{"found character", errors.New("found character that cannot start any token"), true},
		{"error converting yaml", errors.New("error converting yaml to json"), true},
		{"unrelated error", errors.New("connection refused"), false},
		{"generic error", errors.New("some other error"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractYAMLParseError(tt.err)
			if tt.wantMsg {
				assert.NotEmpty(t, got)
			} else {
				assert.Empty(t, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// drift.go — detectKubectlErrors
// ---------------------------------------------------------------------------

func TestDetectKubectlErrors(t *testing.T) {
	tests := []struct {
		name      string
		text      string
		wantCount int
	}{
		{
			name:      "empty text",
			text:      "",
			wantCount: 0,
		},
		{
			name:      "no errors",
			text:      "namespace/default\npod/web-0 created",
			wantCount: 0,
		},
		{
			name:      "error keyword",
			text:      "Error from server: pods not found",
			wantCount: 1,
		},
		{
			name:      "multiple error lines",
			text:      "Error from server: not found\nfailed to get pod\nsome normal line",
			wantCount: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectKubectlErrors(tt.text)
			assert.Len(t, got, tt.wantCount)
		})
	}
}

// ---------------------------------------------------------------------------
// drift.go — getString
// ---------------------------------------------------------------------------

func TestGetString(t *testing.T) {
	m := map[string]interface{}{
		"name":    "my-resource",
		"count":   42,
		"missing": nil,
	}

	assert.Equal(t, "my-resource", getString(m, "name"))
	assert.Equal(t, "", getString(m, "count"))   // non-string value
	assert.Equal(t, "", getString(m, "missing")) // nil value
	assert.Equal(t, "", getString(m, "absent"))  // key not present
}

// ---------------------------------------------------------------------------
// drift.go — validateHelmVersion
// ---------------------------------------------------------------------------

func TestValidateHelmVersion(t *testing.T) {
	tests := []struct {
		version string
		wantErr bool
	}{
		{"", false},             // empty is allowed
		{"1.2.3", false},        // semver
		{"v1.2.3", false},       // v-prefixed
		{"1.2.3-beta.1", false}, // pre-release
		{"1.2.3+build", false},  // build metadata
		{"-1.2.3", true},        // starts with dash → flag injection
		{"1.2.3;rm", true},      // shell metachar
		{"1.2 3", true},         // space
	}

	for _, tt := range tests {
		t.Run(tt.version, func(t *testing.T) {
			err := validateHelmVersion(tt.version)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// drift.go — validateBranchName
// ---------------------------------------------------------------------------

func TestValidateBranchName(t *testing.T) {
	tests := []struct {
		branch  string
		wantErr bool
	}{
		{"", false},               // empty OK
		{"main", false},           // simple name
		{"feature/my-branch", false}, // slash separator
		{"release-1.0", false},    // dots and dashes
		{"-bad", true},            // starts with dash
		{"feat..double", true},    // double dot
		{"feat branch", true},     // space
		{"feat;rm", true},         // semicolon
	}

	for _, tt := range tests {
		t.Run(tt.branch, func(t *testing.T) {
			err := validateBranchName(tt.branch)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

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
				if gotErr != nil {
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

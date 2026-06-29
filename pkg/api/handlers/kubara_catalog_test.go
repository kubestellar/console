package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKubaraCatalogHandler_GetConfig(t *testing.T) {
	env := setupTestEnv(t)
	h, err := NewKubaraCatalogHandler("token", "org/repo", "path/to/helm")
	require.NoError(t, err)
	env.App.Get("/api/kubara/config", h.GetConfig)

	req := httptest.NewRequest("GET", "/api/kubara/config", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var config map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&config)
	assert.Equal(t, "org/repo", config["repo"])
	assert.Equal(t, "path/to/helm", config["path"])
}

func TestKubaraCatalogHandler_GetCatalog(t *testing.T) {
	const kubaraCatalogLockCheckTimeout = 100 * time.Millisecond

	env := setupTestEnv(t)
	h, err := NewKubaraCatalogHandler("token", "org/repo", "path")
	require.NoError(t, err)
	env.App.Get("/api/kubara/catalog", h.GetCatalog)

	t.Run("demo mode", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/kubara/catalog", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		assert.Equal(t, "demo", respData["source"])
		assert.NotEmpty(t, respData["entries"])
	})

	t.Run("upstream fetch and cache", func(t *testing.T) {
		mockData := `[
			{"name": "chart1", "path": "path/chart1", "type": "dir"},
			{"name": "file1", "path": "path/file1", "type": "file"}
		]`

		callCount := 0
		h.httpClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
			callCount++
			assert.Contains(t, req.URL.String(), "api.github.com/repos/org/repo/contents/path")
			assert.Equal(t, "Bearer token", req.Header.Get("Authorization"))

			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(mockData)),
				Header:     make(http.Header),
			}
		})

		// First call - should fetch from upstream
		req := httptest.NewRequest("GET", "/api/kubara/catalog", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData struct {
			Entries []KubaraCatalogEntry `json:"entries"`
			Source  string               `json:"source"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		assert.Equal(t, "upstream", respData.Source)
		assert.Len(t, respData.Entries, 1) // Only 'dir' type should be included
		assert.Equal(t, "chart1", respData.Entries[0].Name)
		assert.Equal(t, 1, callCount)

		// Second call - should hit cache
		resp2, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp2.StatusCode)
		_ = json.NewDecoder(resp2.Body).Decode(&respData)
		assert.Equal(t, 1, callCount, "Should not have called upstream again")
	})

	t.Run("fetch does not hold write lock", func(t *testing.T) {
		fetchStarted := make(chan struct{})
		releaseFetch := make(chan struct{})
		requestDone := make(chan error, 1)

		h.httpClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
			close(fetchStarted)
			<-releaseFetch
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`[{"name":"chart1","path":"path/chart1","type":"dir"}]`)),
				Header:     make(http.Header),
			}
		})
		h.cache = nil
		h.cacheExp = time.Time{}

		go func() {
			req := httptest.NewRequest("GET", "/api/kubara/catalog", nil)
			req.Host = "localhost"
			resp, err := env.App.Test(req)
			if err == nil {
				_ = resp.Body.Close()
			}
			requestDone <- err
		}()

		<-fetchStarted

		lockAcquired := make(chan struct{})
		go func() {
			h.mu.Lock()
			close(lockAcquired)
			h.mu.Unlock()
		}()

		select {
		case <-lockAcquired:
		case <-time.After(kubaraCatalogLockCheckTimeout):
			t.Fatal("expected kubara catalog write lock to remain available during upstream fetch")
		}

		close(releaseFetch)
		require.NoError(t, <-requestDone)
	})

	t.Run("upstream error", func(t *testing.T) {
		h, err := NewKubaraCatalogHandler("", "fail/repo", "path")
		require.NoError(t, err)
		env.App.Get("/api/kubara/catalog/fail", h.GetCatalog)

		h.httpClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader(`{"message": "Not Found"}`)),
				Header:     make(http.Header),
			}
		})

		req := httptest.NewRequest("GET", "/api/kubara/catalog/fail", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		// Code returns StatusBadGateway (502) for any upstream error
		assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
	})
}

// TestValidateCatalogRepo tests the validation logic for catalog repo identifiers
func TestValidateCatalogRepo(t *testing.T) {
	tests := []struct {
		name        string
		repo        string
		shouldError bool
	}{
		{"valid repo", "owner/repo", false},
		{"valid with hyphens", "my-org/my-repo", false},
		{"valid with underscores", "my_org/my_repo", false},
		{"valid with dots", "my.org/my.repo", false},
		{"empty", "", true},
		{"path traversal ..", "owner/../repo", true},
		{"double slash", "owner//repo", true},
		{"newline", "owner/re\npo", true},
		{"control character", "owner/re\x00po", true},
		{"missing slash", "ownerrepo", true},
		{"too long", "owner/" + strings.Repeat("a", 300), true},
		{"invalid characters", "owner@/repo!", true},
		{"extra slashes", "owner/repo/extra", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCatalogRepo(tt.repo)
			if tt.shouldError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestValidateCatalogPath tests the validation logic for catalog paths
func TestValidateCatalogPath(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		shouldError bool
	}{
		{"simple path", "helm", false},
		{"nested path", "path/to/helm", false},
		{"with hyphens", "my-path/my-helm", false},
		{"with underscores", "my_path/my_helm", false},
		{"with dots", "my.path/my.helm", false},
		{"empty", "", true},
		{"path traversal ..", "path/../helm", true},
		{"double slash", "path//helm", true},
		{"newline", "path/hel\nm", true},
		{"control character", "path/hel\x00m", true},
		{"too long", strings.Repeat("a/", 200), true},
		{"invalid characters", "path/hel@m!", true},
		{"leading slash", "/path/helm", true},
		{"trailing slash", "path/helm/", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCatalogPath(tt.path)
			if tt.shouldError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestNewKubaraCatalogHandler_ValidationErrors tests that initialization fails with invalid inputs
func TestNewKubaraCatalogHandler_ValidationErrors(t *testing.T) {
	tests := []struct {
		name        string
		repo        string
		path        string
		shouldError bool
	}{
		{"valid", "owner/repo", "helm", false},
		{"invalid repo with ..", "owner/../repo", "helm", true},
		{"invalid path with ..", "owner/repo", "path/../helm", true},
		{"both invalid", "owner/../repo", "path/../helm", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewKubaraCatalogHandler("token", tt.repo, tt.path)
			if tt.shouldError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

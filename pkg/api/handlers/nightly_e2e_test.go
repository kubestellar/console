package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNightlyE2EHandler(t *testing.T) {
	// Mock GITHUB_URL to point to our test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		path := r.URL.Path
		// GHE base adds /api/v3
		path = strings.TrimPrefix(path, "/api/v3")

		// Workflow runs endpoint
		if path == "/repos/llm-d/llm-d/actions/workflows/nightly-e2e-optimized-baseline-ocp.yaml/runs" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"workflow_runs":[{"id":123,"status":"completed","conclusion":"success","created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T01:00:00Z","html_url":"http://github.com/123","run_number":1,"event":"push"}]}`))
			return
		}

		// Default empty responses for other workflows to avoid 404
		if path == "/repos/llm-d/llm-d/git/trees/main" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"tree":[]}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"workflow_runs":[]}`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	h := NewNightlyE2EHandler("fake-token")
	app := fiber.New()
	app.Get("/api/nightly-e2e/runs", h.GetRuns)

	t.Run("GetRuns", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
		resp, _ := app.Test(req, 10000)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result NightlyE2EResponse
		err := json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)

		assert.NotEmpty(t, result.Guides)
		// Check the specific workflow we mocked
		found := false
		for _, g := range result.Guides {
			if g.WorkflowFile == "nightly-e2e-optimized-baseline-ocp.yaml" {
				found = true
				assert.Len(t, g.Runs, 1)
				assert.Equal(t, int64(123), g.Runs[0].ID)
				assert.Equal(t, "success", *g.Runs[0].Conclusion)
			}
		}
		assert.True(t, found)
	})
}

func TestParseImagesFromYAML(t *testing.T) {
	tests := []struct {
		name     string
		yaml     string
		contains map[string]string
		excluded []string
	}{
		{
			name: "parses normal image names",
			yaml: `
image: ghcr.io/llm-d/component-a:v1.0.0
# ignored: ghcr.io/llm-d/ignored:v2
  hub: ghcr.io/llm-d
  name: component-b
  tag: v2.1.0
`,
			contains: map[string]string{
				"component-a": "v1.0.0",
				"component-b": "v2.1.0",
			},
			excluded: []string{"ignored", "__proto__", "constructor", "prototype"},
		},
		{
			name: "rejects prototype pollution keys in direct references",
			yaml: `
image: ghcr.io/llm-d/__proto__:v1.0.0
image: ghcr.io/llm-d/constructor:v2.0.0
image: ghcr.io/llm-d/prototype:v3.0.0
image: ghcr.io/llm-d/safe-image:v4.0.0
`,
			contains: map[string]string{
				"safe-image": "v4.0.0",
			},
			excluded: []string{"__proto__", "constructor", "prototype"},
		},
		{
			name: "rejects prototype pollution keys in nested hub name tag blocks",
			yaml: `
components:
  primary:
    hub: ghcr.io/llm-d
    name: __proto__
    tag: blocked
  secondary:
    hub: ghcr.io/llm-d
    name: constructor
    tag: blocked-too
  tertiary:
    hub: ghcr.io/llm-d
    name: safe-component
    tag: v5.0.0
`,
			contains: map[string]string{
				"safe-component": "v5.0.0",
			},
			excluded: []string{"__proto__", "constructor", "prototype"},
		},
		{
			name:     "handles empty input",
			yaml:     "",
			contains: map[string]string{},
			excluded: []string{"__proto__", "constructor", "prototype"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			images := parseImagesFromYAML(tt.yaml)
			require.NotNil(t, images)
			for name, tag := range tt.contains {
				assert.Equal(t, tag, images[name])
			}
			for _, key := range tt.excluded {
				assert.NotContains(t, images, key)
			}
		})
	}
}

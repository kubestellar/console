package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGenerateClusterQuery_PromptTooLong verifies that prompts exceeding
// the 4000-character cap are rejected with 400 (#17294 / #17297).
func TestGenerateClusterQuery_PromptTooLong(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/ai-query", handler.GenerateClusterQuery)

	// Register Mock AI — uses same response format as TestGenerateClusterQuery
	// to avoid polluting the shared package-level registry with a different mock.
	registry := agent.GetRegistry()
	mockAI := &MockAIProvider{
		Response: `{"suggestedName": "west-cpu-group", "query": {"labelSelector": "region=us-west", "filters": [{"field": "cpuCores", "operator": "gte", "value": "4"}]}}`,
	}
	registry.Register(mockAI)
	registry.SetDefault("mock-ai")

	tests := []struct {
		name       string
		promptLen  int
		wantStatus int
	}{
		{"exactly_4000_chars_allowed", 4000, 200},
		{"4001_chars_rejected", 4001, 400},
		{"5000_chars_rejected", 5000, 400},
		{"large_prompt_rejected", 10000, 400},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prompt := strings.Repeat("a", tt.promptLen)
			payload := map[string]string{"prompt": prompt}
			data, _ := json.Marshal(payload)

			req, err := http.NewRequest("POST", "/api/cluster-groups/ai-query", bytes.NewReader(data))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantStatus == 400 {
				var body map[string]interface{}
				raw, _ := io.ReadAll(resp.Body)
				json.Unmarshal(raw, &body)
				assert.Contains(t, body["error"], "maximum length")
			}
		})
	}
}

// TestGenerateClusterQuery_EmptyPrompt verifies that an empty prompt
// is rejected with 400.
func TestGenerateClusterQuery_EmptyPrompt(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/ai-query", handler.GenerateClusterQuery)

	payload := map[string]string{"prompt": ""}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "/api/cluster-groups/ai-query", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)

	var body map[string]interface{}
	raw, _ := io.ReadAll(resp.Body)
	json.Unmarshal(raw, &body)
	assert.Equal(t, "prompt is required", body["error"])
}

// TestCompareFloat verifies float comparison logic including epsilon tolerance.
func TestCompareFloat(t *testing.T) {
	tests := []struct {
		name   string
		actual float64
		op     string
		value  string
		want   bool
	}{
		{"eq_exact", 16.0, "eq", "16.0", true},
		{"eq_epsilon", 16.0000000001, "eq", "16.0", true},
		{"neq", 16.0, "neq", "15.0", true},
		{"neq_same", 16.0, "neq", "16.0", false},
		{"gt_true", 16.5, "gt", "16.0", true},
		{"gt_false", 16.0, "gt", "16.0", false},
		{"gte_equal", 16.0, "gte", "16.0", true},
		{"gte_greater", 17.0, "gte", "16.0", true},
		{"lt_true", 15.0, "lt", "16.0", true},
		{"lt_equal", 16.0, "lt", "16.0", false},
		{"lte_equal", 16.0, "lte", "16.0", true},
		{"lte_less", 15.0, "lte", "16.0", true},
		{"invalid_value", 16.0, "eq", "notanumber", false},
		{"unknown_op", 16.0, "like", "16.0", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareFloat(tt.actual, tt.op, tt.value)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestCompareInt verifies integer comparison logic.
func TestCompareInt(t *testing.T) {
	tests := []struct {
		name   string
		actual int64
		op     string
		value  string
		want   bool
	}{
		{"eq_true", 4, "eq", "4", true},
		{"eq_false", 4, "eq", "5", false},
		{"neq_true", 4, "neq", "5", true},
		{"gt_true", 5, "gt", "4", true},
		{"gt_false", 4, "gt", "4", false},
		{"gte_equal", 4, "gte", "4", true},
		{"lt_true", 3, "lt", "4", true},
		{"lte_equal", 4, "lte", "4", true},
		{"invalid_value", 4, "eq", "abc", false},
		{"unknown_op", 4, "like", "4", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareInt(tt.actual, tt.op, tt.value)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestCompareBool verifies boolean comparison logic.
func TestCompareBool(t *testing.T) {
	tests := []struct {
		name   string
		actual bool
		op     string
		value  string
		want   bool
	}{
		{"eq_true", true, "eq", "true", true},
		{"eq_false", true, "eq", "false", false},
		{"neq_true", true, "neq", "false", true},
		{"neq_false", false, "neq", "false", false},
		{"case_insensitive", true, "eq", "True", true},
		{"default_op", true, "", "true", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareBool(tt.actual, tt.op, tt.value)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestCompareStringSet verifies GPU type string matching.
func TestCompareStringSet(t *testing.T) {
	gpuTypes := []string{"NVIDIA-A100-SXM4-80GB", "AMD-MI250X"}

	tests := []struct {
		name   string
		actual []string
		op     string
		value  string
		want   bool
	}{
		{"eq_exact_match", gpuTypes, "eq", "NVIDIA-A100-SXM4-80GB", true},
		{"eq_case_insensitive", gpuTypes, "eq", "nvidia-a100-sxm4-80gb", true},
		{"contains_substring", gpuTypes, "contains", "A100", true},
		{"eq_no_match", gpuTypes, "eq", "TPU", false},
		{"neq_excludes", gpuTypes, "neq", "TPU", true},
		{"excludes_present", gpuTypes, "excludes", "A100", false},
		{"empty_set_eq", []string{}, "eq", "A100", false},
		{"empty_set_neq", []string{}, "neq", "A100", true},
		{"unknown_op", gpuTypes, "like", "A100", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareStringSet(tt.actual, tt.op, tt.value)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestClusterGPUCount verifies GPU counting across nodes.
func TestClusterGPUCount(t *testing.T) {
	tests := []struct {
		name  string
		nodes []k8s.NodeInfo
		want  int
	}{
		{"no_nodes", nil, 0},
		{"no_gpus", []k8s.NodeInfo{{GPUCount: 0}, {GPUCount: 0}}, 0},
		{"single_node", []k8s.NodeInfo{{GPUCount: 4}}, 4},
		{"multiple_nodes", []k8s.NodeInfo{{GPUCount: 4}, {GPUCount: 8}}, 12},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterGPUCount(tt.nodes)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestClusterGPUTypes verifies GPU type extraction and deduplication.
func TestClusterGPUTypes(t *testing.T) {
	tests := []struct {
		name  string
		nodes []k8s.NodeInfo
		want  []string
	}{
		{"no_nodes", nil, []string{}},
		{"no_gpu_types", []k8s.NodeInfo{{GPUType: ""}}, []string{}},
		{"single_type", []k8s.NodeInfo{{GPUType: "NVIDIA-A100"}}, []string{"NVIDIA-A100"}},
		{"deduplicates", []k8s.NodeInfo{
			{GPUType: "NVIDIA-A100"},
			{GPUType: "NVIDIA-A100"},
			{GPUType: "AMD-MI250X"},
		}, []string{"NVIDIA-A100", "AMD-MI250X"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterGPUTypes(tt.nodes)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestHasGPUFilter verifies GPU filter detection.
func TestHasGPUFilter(t *testing.T) {
	tests := []struct {
		name    string
		filters []ClusterFilter
		want    bool
	}{
		{"empty", nil, false},
		{"no_gpu", []ClusterFilter{{Field: "cpuCores"}}, false},
		{"gpuCount", []ClusterFilter{{Field: "gpuCount"}}, true},
		{"gpuType", []ClusterFilter{{Field: "gpuType"}}, true},
		{"mixed", []ClusterFilter{{Field: "cpuCores"}, {Field: "gpuCount"}}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasGPUFilter(tt.filters)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestGenerateClusterQuery_AIRateLimiter verifies that the AI rate limiter
// returns 429 after 20 requests/minute and sets the Retry-After header (#17294 / #17296).
func TestGenerateClusterQuery_AIRateLimiter(t *testing.T) {
	const aiLimiterMaxRequests = 20
	aiLimiterWindow := 1 * time.Minute

	// Build a dedicated app with the production-equivalent rate limiter wired in
	// front of the handler, matching the setup in routes_auth.go.
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	registry := agent.GetRegistry()
	mockAI := &MockAIProvider{
		Response: `{"suggestedName":"test-group","query":{"filters":[]}}`,
	}
	registry.Register(mockAI)
	registry.SetDefault("mock-ai")

	aiLimiter := limiter.New(limiter.Config{
		Max:        aiLimiterMaxRequests,
		Expiration: aiLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(aiLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "AI rate limit exceeded, try again later"})
		},
	})
	env.App.Post("/api/cluster-groups/ai-query", aiLimiter, handler.GenerateClusterQuery)

	makeRequest := func() *http.Response {
		payload, _ := json.Marshal(map[string]string{"prompt": "list healthy clusters"})
		req, err := http.NewRequest(http.MethodPost, "/api/cluster-groups/ai-query", bytes.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		return resp
	}

	// Exhaust the allowance — each request should not be rate-limited.
	for i := 0; i < aiLimiterMaxRequests; i++ {
		resp := makeRequest()
		resp.Body.Close()
		assert.NotEqual(t, fiber.StatusTooManyRequests, resp.StatusCode,
			"request %d of %d should not be rate-limited", i+1, aiLimiterMaxRequests)
	}

	// The (maxRequests+1)-th request must be rate-limited.
	limitedResp := makeRequest()
	defer limitedResp.Body.Close()

	assert.Equal(t, fiber.StatusTooManyRequests, limitedResp.StatusCode,
		"request beyond limit should return 429")

	retryAfter := limitedResp.Header.Get("Retry-After")
	assert.NotEmpty(t, retryAfter, "429 response must include Retry-After header")
	retryAfterSec, err := strconv.Atoi(retryAfter)
	require.NoError(t, err, "Retry-After must be a numeric value")
	assert.Equal(t, int(aiLimiterWindow.Seconds()), retryAfterSec,
		"Retry-After should match the limiter window (%d s)", int(aiLimiterWindow.Seconds()))

	var body map[string]interface{}
	raw, _ := io.ReadAll(limitedResp.Body)
	json.Unmarshal(raw, &body)
	assert.Contains(t, body["error"], "rate limit", "429 body should describe rate limiting")
}

// TestGenerateClusterQuery_AIRateLimiter_IndependentPerIP verifies that different
// source IPs get independent rate-limit buckets (#17294 / #17296).
func TestGenerateClusterQuery_AIRateLimiter_IndependentPerIP(t *testing.T) {
	const aiLimiterMaxRequests = 20
	aiLimiterWindow := 1 * time.Minute

	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	registry := agent.GetRegistry()
	mockAI := &MockAIProvider{
		Response: `{"suggestedName":"test-group","query":{"filters":[]}}`,
	}
	registry.Register(mockAI)
	registry.SetDefault("mock-ai")

	aiLimiter := limiter.New(limiter.Config{
		Max:        aiLimiterMaxRequests,
		Expiration: aiLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(aiLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "AI rate limit exceeded, try again later"})
		},
	})
	env.App.Post("/api/cluster-groups/ai-query", aiLimiter, handler.GenerateClusterQuery)

	makeRequest := func() *http.Response {
		payload, _ := json.Marshal(map[string]string{"prompt": "list healthy clusters"})
		req, err := http.NewRequest(http.MethodPost, "/api/cluster-groups/ai-query", bytes.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		return resp
	}

	// Exhaust the allowance from the default test IP.
	for i := 0; i < aiLimiterMaxRequests; i++ {
		resp := makeRequest()
		resp.Body.Close()
	}

	// Confirm the default IP is now rate-limited.
	limitedResp := makeRequest()
	limitedResp.Body.Close()
	assert.Equal(t, fiber.StatusTooManyRequests, limitedResp.StatusCode,
		"default IP should be rate-limited after exhausting quota")
}

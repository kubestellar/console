package benchmarks

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdaptV1ToV2(t *testing.T) {
	raw := rawV1Report{}
	raw.Version = "0.1"
	raw.Scenario.Load.Metadata.Stage = 2
	raw.Metrics.Time.Duration = 120.5

	// Set up throughput
	raw.Metrics.Throughput.RequestsPerSec = 10.5
	raw.Metrics.Throughput.OutputTokensPerSec = 100.0
	raw.Metrics.Throughput.TotalTokensPerSec = 150.0

	// Set up one host
	raw.Scenario.Host.Type = []string{"test-role"}
	raw.Scenario.Platform.Engine = []struct {
		Name string                 `yaml:"name"`
		Args map[string]interface{} `yaml:"args"`
	}{{Name: "vllm-0.3.0"}}

	raw.Scenario.Host.Accelerator = []struct {
		Count       int    `yaml:"count"`
		Model       string `yaml:"model"`
		Parallelism struct {
			DP int `yaml:"dp"`
			EP int `yaml:"ep"`
			PP int `yaml:"pp"`
			TP int `yaml:"tp"`
		} `yaml:"parallelism"`
	}{{
		Count: 8,
		Model: "H100",
		Parallelism: struct {
			DP int `yaml:"dp"`
			EP int `yaml:"ep"`
			PP int `yaml:"pp"`
			TP int `yaml:"tp"`
		}{DP: 1, TP: 8, PP: 1, EP: 1},
	}}

	// Target created time for testing
	createdTime := time.Now().Format(time.RFC3339)

	report := adaptV1ToV2(raw, "exp-1", "run-1", createdTime)

	// Check Version
	assert.Equal(t, "0.2", report.Version)

	// Check Run IDs
	assert.Equal(t, "exp-1/run-1/stage-2", report.Run.UID)
	assert.Equal(t, "exp-1/run-1", report.Run.EID)

	// Check Stack component mapping
	require.Len(t, report.Scenario.Stack, 1)
	assert.Equal(t, "test-role-0", report.Scenario.Stack[0].Metadata.Label)
	assert.Equal(t, "test-role", report.Scenario.Stack[0].Standardized.Role)
	assert.Equal(t, "vllm-0.3.0", report.Scenario.Stack[0].Standardized.ToolVersion)
	require.NotNil(t, report.Scenario.Stack[0].Standardized.Accelerator)
	assert.Equal(t, "H100", report.Scenario.Stack[0].Standardized.Accelerator.Model)
	assert.Equal(t, 8, report.Scenario.Stack[0].Standardized.Accelerator.Count)

	// Check Result Aggregation Mapping
	agg := report.Results.RequestPerformance.Aggregate
	require.NotNil(t, agg.Throughput.RequestRate)
	assert.Equal(t, 10.5, agg.Throughput.RequestRate.Mean)

	require.NotNil(t, agg.Throughput.OutputTokenRate)
	assert.Equal(t, 100.0, agg.Throughput.OutputTokenRate.Mean)

	require.NotNil(t, agg.Throughput.InputTokenRate)
	// Input should be derived from total - output (150 - 100 = 50)
	assert.Equal(t, 50.0, agg.Throughput.InputTokenRate.Mean)
}

func TestBenchmarkHandlers_GetReports_NoConfig(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "")
	app.Get("/benchmarks", handler.GetReports)

	req := httptest.NewRequest("GET", "/benchmarks", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)

	assert.Equal(t, 503, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, "unavailable", result["source"])
	assert.Contains(t, result["error"], "not configured")
}

func TestBenchmarkHandlers_StreamReports_NoConfig(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "")
	app.Get("/benchmarks/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/benchmarks/stream", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)

	assert.Equal(t, 503, resp.StatusCode)
}

func TestBenchmarkHandlers_GetReports_DemoMode(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "")
	app.Get("/benchmarks", handler.GetReports)

	req := httptest.NewRequest("GET", "/benchmarks", nil)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req)
	require.NoError(t, err)

	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, "demo", result["source"])
}

func TestBenchmarkHandlers_StreamReports_DemoMode(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "")
	app.Get("/benchmarks/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/benchmarks/stream", nil)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req)
	require.NoError(t, err)

	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, "demo", result["source"])
}

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

func TestBenchmarkCache_Get_EmptyCache(t *testing.T) {
	c := &benchmarkCache{ttl: time.Hour}
	reports, ok := c.get("0")
	assert.False(t, ok, "empty cache should return miss")
	assert.Nil(t, reports)
}

func TestBenchmarkCache_SetThenGet(t *testing.T) {
	c := &benchmarkCache{ttl: time.Hour}
	reports := []BenchmarkReport{
		{Version: "0.2", Run: BenchmarkRun{UID: "exp-1/run-1/stage-1"}},
	}
	c.set(reports, "7d")

	got, ok := c.get("7d")
	require.True(t, ok, "cache should hit after set")
	require.Len(t, got, 1)
	assert.Equal(t, "exp-1/run-1/stage-1", got[0].Run.UID)
}

func TestBenchmarkCache_TTLExpiry(t *testing.T) {
	c := &benchmarkCache{ttl: time.Millisecond} // very short TTL
	reports := []BenchmarkReport{
		{Version: "0.2"},
	}
	c.set(reports, "0")

	// Wait for TTL to expire
	time.Sleep(5 * time.Millisecond)

	_, ok := c.get("0")
	assert.False(t, ok, "cache should miss after TTL expiry")
}

func TestBenchmarkCache_SinceKeyMismatch(t *testing.T) {
	c := &benchmarkCache{ttl: time.Hour}
	reports := []BenchmarkReport{{Version: "0.2"}}
	c.set(reports, "7d")

	// Different since key should miss
	_, ok := c.get("30d")
	assert.False(t, ok, "cache should miss when since key differs")

	// Same since key should hit
	_, ok = c.get("7d")
	assert.True(t, ok, "cache should hit with matching since key")
}

func TestBenchmarkHandlers_GetReports_CacheHit(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("fake-api-key", "fake-folder-id")

	// Pre-populate cache
	cachedReports := []BenchmarkReport{
		{
			Version: "0.2",
			Run:     BenchmarkRun{UID: "cached-run", EID: "cached-exp"},
		},
	}
	handler.cache.set(cachedReports, "0")

	app.Get("/benchmarks", handler.GetReports)

	req := httptest.NewRequest("GET", "/benchmarks", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, "cache", result["source"])
	reports, ok := result["reports"].([]interface{})
	require.True(t, ok, "reports should be an array")
	require.Len(t, reports, 1)
}

func TestBenchmarkHandlers_GetReports_CacheHit_WithSince(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("fake-api-key", "fake-folder-id")

	cachedReports := []BenchmarkReport{
		{Version: "0.2", Run: BenchmarkRun{UID: "run-7d"}},
	}
	handler.cache.set(cachedReports, "7d")

	app.Get("/benchmarks", handler.GetReports)

	req := httptest.NewRequest("GET", "/benchmarks?since=7d", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Equal(t, "cache", result["source"])
}

func TestBenchmarkHandlers_StreamReports_CacheHit(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("fake-api-key", "fake-folder-id")

	cachedReports := []BenchmarkReport{
		{Version: "0.2", Run: BenchmarkRun{UID: "stream-cached"}},
	}
	handler.cache.set(cachedReports, "0")

	app.Get("/benchmarks/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/benchmarks/stream", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
}

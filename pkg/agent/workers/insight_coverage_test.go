package workers

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// buildProviderOrder — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestBuildProviderOrder_EmptyPrimary(t *testing.T) {
	fallback := []string{"claude", "openai", "gemini"}
	result := buildProviderOrder("", fallback)
	assert.Equal(t, fallback, result)
}

func TestBuildProviderOrder_PrimaryFirst(t *testing.T) {
	result := buildProviderOrder("claude", []string{"openai", "gemini"})
	assert.Equal(t, []string{"claude", "openai", "gemini"}, result)
}

func TestBuildProviderOrder_DeduplicatesPrimary(t *testing.T) {
	result := buildProviderOrder("openai", []string{"claude", "openai", "gemini"})
	assert.Equal(t, []string{"openai", "claude", "gemini"}, result)
}

func TestBuildProviderOrder_EmptyFallback(t *testing.T) {
	result := buildProviderOrder("claude", nil)
	assert.Equal(t, []string{"claude"}, result)
}

// ────────────────────────────────────────────────────────────────────────────
// parseEnrichmentResponse — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestParseEnrichmentResponse_ValidJSON(t *testing.T) {
	response := `{"enrichments": [{"insightId": "abc", "description": "test", "remediation": "fix it", "confidence": 85}]}`
	insights := []InsightSummary{{ID: "abc"}}

	result, err := parseEnrichmentResponse(response, insights)
	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "abc", result[0].InsightID)
	assert.Equal(t, 85, result[0].Confidence)
}

func TestParseEnrichmentResponse_FencedCodeBlock(t *testing.T) {
	response := "Here is my analysis:\n```json\n{\"enrichments\": [{\"insightId\": \"x1\", \"description\": \"d\", \"remediation\": \"r\", \"confidence\": 70}]}\n```\nDone."
	insights := []InsightSummary{{ID: "x1"}}

	result, err := parseEnrichmentResponse(response, insights)
	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "x1", result[0].InsightID)
}

func TestParseEnrichmentResponse_NoJSON(t *testing.T) {
	_, err := parseEnrichmentResponse("no json here at all", nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no JSON found")
}

func TestParseEnrichmentResponse_MissingEnrichmentsKey(t *testing.T) {
	response := `{"results": [{"id": "abc"}]}`
	_, err := parseEnrichmentResponse(response, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lacks 'enrichments' key")
}

func TestParseEnrichmentResponse_InvalidJSON(t *testing.T) {
	response := `{enrichments: broken`
	_, err := parseEnrichmentResponse(response, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "JSON parse error")
}

func TestParseEnrichmentResponse_LeadingProseBeforeJSON(t *testing.T) {
	response := `Let me analyze this for you. {"enrichments": [{"insightId": "i1", "description": "d", "remediation": "r", "confidence": 90}]}`
	result, err := parseEnrichmentResponse(response, nil)
	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, 90, result[0].Confidence)
}

// ────────────────────────────────────────────────────────────────────────────
// buildInsightEnrichmentPrompt — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestBuildInsightEnrichmentPrompt_IncludesInsightData(t *testing.T) {
	insights := []InsightSummary{
		{
			ID:               "insight-1",
			Category:         "event-correlation",
			Title:            "High restart rate",
			Description:      "Pods restarting across 3 clusters",
			Severity:         "warning",
			AffectedClusters: []string{"prod-1", "prod-2"},
		},
	}
	prompt := buildInsightEnrichmentPrompt(insights)
	assert.Contains(t, prompt, "insight-1")
	assert.Contains(t, prompt, "event-correlation")
	assert.Contains(t, prompt, "High restart rate")
	assert.Contains(t, prompt, "prod-1, prod-2")
	assert.Contains(t, prompt, "JSON format")
}

func TestBuildInsightEnrichmentPrompt_MultipleInsights(t *testing.T) {
	insights := []InsightSummary{
		{ID: "a", Category: "cascade-impact", Title: "Failure cascade"},
		{ID: "b", Category: "config-drift", Title: "Config mismatch"},
	}
	prompt := buildInsightEnrichmentPrompt(insights)
	assert.Contains(t, prompt, "Insight 1")
	assert.Contains(t, prompt, "Insight 2")
	assert.Contains(t, prompt, "cascade-impact")
	assert.Contains(t, prompt, "config-drift")
}

func TestBuildInsightEnrichmentPrompt_IncludesMetrics(t *testing.T) {
	insights := []InsightSummary{
		{
			ID:       "m1",
			Category: "resource-imbalance",
			Title:    "CPU skew",
			Metrics:  map[string]float64{"cpu_avg": 72.5, "mem_avg": 55.0},
		},
	}
	prompt := buildInsightEnrichmentPrompt(insights)
	assert.Contains(t, prompt, "72.5")
	assert.Contains(t, prompt, "Metrics:")
}

// ────────────────────────────────────────────────────────────────────────────
// IsCacheValid / GetEnrichments — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestIsCacheValid_EmptyCache(t *testing.T) {
	w := &InsightWorker{
		cache:     make(map[string]insightCacheEntry),
		cacheTime: time.Now(),
	}
	assert.False(t, w.IsCacheValid())
}

func TestIsCacheValid_FreshData(t *testing.T) {
	w := &InsightWorker{
		cache: map[string]insightCacheEntry{
			"i1": {enrichment: AIInsightEnrichment{InsightID: "i1"}, cachedAt: time.Now()},
		},
		cacheTime: time.Now(),
	}
	assert.True(t, w.IsCacheValid())
}

func TestIsCacheValid_ExpiredData(t *testing.T) {
	w := &InsightWorker{
		cache: map[string]insightCacheEntry{
			"i1": {enrichment: AIInsightEnrichment{InsightID: "i1"}, cachedAt: time.Now()},
		},
		cacheTime: time.Now().Add(-InsightEnrichmentCacheTTL - time.Second),
	}
	assert.False(t, w.IsCacheValid())
}

func TestGetEnrichments_ReturnsCached(t *testing.T) {
	w := &InsightWorker{
		cache: map[string]insightCacheEntry{
			"i1": {enrichment: AIInsightEnrichment{InsightID: "i1", Description: "test"}, cachedAt: time.Now()},
			"i2": {enrichment: AIInsightEnrichment{InsightID: "i2", Description: "test2"}, cachedAt: time.Now()},
		},
		cacheTime: time.Now(),
	}
	resp := w.GetEnrichments()
	assert.Len(t, resp.Enrichments, 2)
	assert.NotEmpty(t, resp.Timestamp)
}

// ────────────────────────────────────────────────────────────────────────────
// NewInsightWorker — basic construction
// ────────────────────────────────────────────────────────────────────────────

func TestNewInsightWorker_Initializes(t *testing.T) {
	var broadcastCalled bool
	w := NewInsightWorker(nil, func(string, interface{}) { broadcastCalled = true })
	require.NotNil(t, w)
	assert.NotNil(t, w.cache)
	assert.NotNil(t, w.shutdownCancel)

	// Test that broadcast is wired
	w.broadcast("test", nil)
	assert.True(t, broadcastCalled)
}

func TestInsightWorker_Stop(t *testing.T) {
	w := NewInsightWorker(nil, func(string, interface{}) {})
	w.Stop()
	// shutdownCtx should be cancelled
	assert.Error(t, w.shutdownCtx.Err())
}

// ────────────────────────────────────────────────────────────────────────────
// generateRuleBasedEnrichments — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestGenerateRuleBasedEnrichments_EventCorrelation(t *testing.T) {
	w := &InsightWorker{
		mu:    sync.RWMutex{},
		cache: make(map[string]insightCacheEntry),
	}
	insights := []InsightSummary{
		{ID: "e1", Category: "event-correlation", Title: "Warning events", Severity: "warning", AffectedClusters: []string{"c1", "c2"}},
	}
	result := w.generateRuleBasedEnrichments(insights)
	require.Len(t, result, 1)
	assert.Equal(t, "e1", result[0].InsightID)
	assert.Equal(t, "rules", result[0].Provider)
	assert.Equal(t, 60, result[0].Confidence)
	assert.Contains(t, result[0].Description, "Correlated warning events")
}

func TestGenerateRuleBasedEnrichments_CascadeImpact(t *testing.T) {
	w := &InsightWorker{cache: make(map[string]insightCacheEntry)}
	insights := []InsightSummary{
		{ID: "c1", Category: "cascade-impact", Title: "Failure cascade"},
	}
	result := w.generateRuleBasedEnrichments(insights)
	require.Len(t, result, 1)
	assert.Contains(t, result[0].Description, "Cascading failure")
}

func TestGenerateRuleBasedEnrichments_ConfigDrift(t *testing.T) {
	w := &InsightWorker{cache: make(map[string]insightCacheEntry)}
	insights := []InsightSummary{
		{ID: "d1", Category: "config-drift", Title: "Drift found"},
	}
	result := w.generateRuleBasedEnrichments(insights)
	require.Len(t, result, 1)
	assert.Contains(t, result[0].Description, "Configuration drift")
}

func TestGenerateRuleBasedEnrichments_ResourceImbalance(t *testing.T) {
	w := &InsightWorker{cache: make(map[string]insightCacheEntry)}
	insights := []InsightSummary{
		{ID: "r1", Category: "resource-imbalance", Title: "CPU skew"},
	}
	result := w.generateRuleBasedEnrichments(insights)
	require.Len(t, result, 1)
	assert.Contains(t, result[0].Description, "Resource utilization imbalance")
}

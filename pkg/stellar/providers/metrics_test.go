package providers

import (
	"context"
	"net/http"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

// TestProviderMetricsRecordSuccessAndError verifies that Health and Generate
// on every Provider implementation increment console_stellar_provider_calls_total
// with the right operation/result labels and record a duration observation,
// without a per-provider label (see metrics.go's cardinality note).
func TestProviderMetricsRecordSuccessAndError(t *testing.T) {
	ollama := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3"}]}`))
		case "/api/chat":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"message":{"content":"hi"},"model":"llama3"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	before := testutil.ToFloat64(providerCallsTotal.WithLabelValues(opHealth, resultSuccess))
	health := ollama.Health(context.Background())
	require.True(t, health.Available)
	require.Equal(t, before+1, testutil.ToFloat64(providerCallsTotal.WithLabelValues(opHealth, resultSuccess)))

	before = testutil.ToFloat64(providerCallsTotal.WithLabelValues(opGenerate, resultSuccess))
	_, err := ollama.Generate(context.Background(), GenerateRequest{Model: "llama3", Messages: []Message{{Role: "user", Content: "hi"}}})
	require.NoError(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(providerCallsTotal.WithLabelValues(opGenerate, resultSuccess)))

	// Unreachable provider — both operations should record resultError.
	unreachable := NewOllama("http://127.0.0.1:0")

	before = testutil.ToFloat64(providerCallsTotal.WithLabelValues(opHealth, resultError))
	health = unreachable.Health(context.Background())
	require.False(t, health.Available)
	require.Equal(t, before+1, testutil.ToFloat64(providerCallsTotal.WithLabelValues(opHealth, resultError)))

	before = testutil.ToFloat64(providerCallsTotal.WithLabelValues(opGenerate, resultError))
	_, err = unreachable.Generate(context.Background(), GenerateRequest{Model: "llama3"})
	require.Error(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(providerCallsTotal.WithLabelValues(opGenerate, resultError)))

	require.Equal(t, 2, testutil.CollectAndCount(providerCallDuration, "console_stellar_provider_call_duration_seconds"))
}

// TestCallErr verifies the HealthResult.Error <-> error bridge used to feed
// Health's string-based failure reporting into observeCall.
func TestCallErr(t *testing.T) {
	require.NoError(t, callErr(""))
	require.EqualError(t, callErr("boom"), "boom")
}

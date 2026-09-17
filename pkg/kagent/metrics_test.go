package kagent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

// TestKagentMetricsRecordSuccessAndError verifies that each bounded
// KagentClient operation increments console_kagent_calls_total with the
// right operation/result labels and records a duration observation.
func TestKagentMetricsRecordSuccessAndError(t *testing.T) {
	okServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/health":
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/api/agents":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer okServer.Close()

	client := NewKagentClient(okServer.URL)

	before := testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opStatus, resultSuccess))
	_, err := client.Status()
	require.NoError(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opStatus, resultSuccess)))

	before = testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opListAgents, resultSuccess))
	_, err = client.ListAgents()
	require.NoError(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opListAgents, resultSuccess)))

	before = testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opDiscover, resultError))
	_, err = client.Discover("ns", "missing-agent")
	require.Error(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opDiscover, resultError)))

	before = testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opInvoke, resultError))
	_, err = client.Invoke(context.Background(), "ns", "missing-agent", "hello", "")
	require.Error(t, err)
	require.Equal(t, before+1, testutil.ToFloat64(kagentCallsTotal.WithLabelValues(opInvoke, resultError)))

	require.Equal(t, 4, testutil.CollectAndCount(kagentCallDuration, "console_kagent_call_duration_seconds"))
}

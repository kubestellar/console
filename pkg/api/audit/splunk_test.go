package audit

import (
	"context"
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

func TestSplunkDestination_Send(t *testing.T) {
	events := []PipelineEvent{
		{
			ID:        "evt-1",
			Cluster:   "test-cluster",
			User:      "test-user",
			Timestamp: time.Now().UTC(),
		},
		{
			ID:        "evt-2",
			Cluster:   "test-cluster",
			User:      "test-user",
			Timestamp: time.Now().UTC(),
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "Splunk test-token", r.Header.Get("Authorization"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		// Splunk HEC expects newline-delimited JSON for batches
		lines := strings.Split(strings.TrimSpace(string(body)), "\n")
		require.Len(t, lines, 2)

		for i, line := range lines {
			var wrapped splunkEvent
			err := json.Unmarshal([]byte(line), &wrapped)
			require.NoError(t, err)
			assert.Equal(t, events[i].ID, wrapped.Event.ID)
			assert.Equal(t, splunkSource, wrapped.Source)
			assert.Equal(t, splunkSourcetype, wrapped.Sourcetype)
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewSplunkDestination(srv.URL, "test-token", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)
}

func TestSplunkDestination_SendError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	dest, err := NewSplunkDestination(srv.URL, "test-token", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{{ID: "fail"}})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

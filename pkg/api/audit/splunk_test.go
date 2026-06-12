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

func TestSplunkDestination_SendRetryableErrors(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantErr    string
	}{
		{name: "service unavailable (503)", statusCode: http.StatusServiceUnavailable, wantErr: "503"},
		{name: "too many requests (429)", statusCode: http.StatusTooManyRequests, wantErr: "429"},
		{name: "bad gateway (502)", statusCode: http.StatusBadGateway, wantErr: "502"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
			}))
			defer srv.Close()

			dest, err := NewSplunkDestination(srv.URL, "test-token", srv.Client())
			require.NoError(t, err)

			events := []PipelineEvent{{ID: "evt-retry", Cluster: "test", Timestamp: time.Now().UTC()}}
			err = dest.Send(context.Background(), events)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestSplunkDestination_PayloadFormat(t *testing.T) {
	events := []PipelineEvent{
		{
			ID:        "evt-payload-1",
			Cluster:   "prod-cluster",
			EventType: "pod.create",
			Resource:  "/api/v1/pods",
			User:      "admin@example.com",
			Timestamp: time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC),
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var wrapped splunkEvent
		err = json.Unmarshal(body, &wrapped)
		require.NoError(t, err)

		assert.Equal(t, splunkSource, wrapped.Source)
		assert.Equal(t, splunkSourcetype, wrapped.Sourcetype)
		assert.Equal(t, events[0].Timestamp.Unix(), wrapped.Time)

		assert.Equal(t, events[0].ID, wrapped.Event.ID)
		assert.Equal(t, events[0].Cluster, wrapped.Event.Cluster)
		assert.Equal(t, events[0].EventType, wrapped.Event.EventType)

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewSplunkDestination(srv.URL, "test-token", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)
}

func TestSplunkDestination_SendEmptyEvents(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not be called for empty events")
	}))
	defer srv.Close()

	dest, err := NewSplunkDestination(srv.URL, "test-token", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), nil)
	assert.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{})
	assert.NoError(t, err)
}

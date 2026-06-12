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

func TestElasticDestination_Send(t *testing.T) {
	events := []PipelineEvent{
		{
			ID:        "evt-1",
			Cluster:   "test-cluster",
			Timestamp: time.Now().UTC(),
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/x-ndjson", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		// Elastic _bulk expects pairs of (action, doc)
		lines := strings.Split(strings.TrimSpace(string(body)), "\n")
		require.Len(t, lines, 2)

		var action elasticBulkAction
		err = json.Unmarshal([]byte(lines[0]), &action)
		require.NoError(t, err)
		assert.Equal(t, "test-index", action.Index.Index)
		assert.Equal(t, "evt-1", action.Index.ID)

		var doc PipelineEvent
		err = json.Unmarshal([]byte(lines[1]), &doc)
		require.NoError(t, err)
		assert.Equal(t, "evt-1", doc.ID)

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)
}

func TestElasticDestination_DefaultIndex(t *testing.T) {
	dest, err := NewElasticDestination("http://localhost:9200", "", nil)
	require.NoError(t, err)
	assert.Equal(t, elasticDefaultIndex, dest.index)
}

func TestElasticDestination_SendError(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantErr    string
	}{
		{name: "internal server error", statusCode: http.StatusInternalServerError, wantErr: "500"},
		{name: "service unavailable", statusCode: http.StatusServiceUnavailable, wantErr: "503"},
		{name: "too many requests", statusCode: http.StatusTooManyRequests, wantErr: "429"},
		{name: "bad request", statusCode: http.StatusBadRequest, wantErr: "400"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
			}))
			defer srv.Close()

			dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
			require.NoError(t, err)

			events := []PipelineEvent{{ID: "evt-fail", Cluster: "test", Timestamp: time.Now().UTC()}}
			err = dest.Send(context.Background(), events)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestElasticDestination_SendMultipleEvents(t *testing.T) {
	events := []PipelineEvent{
		{ID: "evt-1", Cluster: "cluster-a", EventType: "create", Timestamp: time.Now().UTC()},
		{ID: "evt-2", Cluster: "cluster-b", EventType: "update", Timestamp: time.Now().UTC()},
		{ID: "evt-3", Cluster: "cluster-c", EventType: "delete", Timestamp: time.Now().UTC()},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		lines := strings.Split(strings.TrimSpace(string(body)), "\n")
		require.Len(t, lines, 6) // 3 events * 2 lines each

		for i := 0; i < 3; i++ {
			var action elasticBulkAction
			err := json.Unmarshal([]byte(lines[i*2]), &action)
			require.NoError(t, err)
			assert.Equal(t, "test-index", action.Index.Index)
			assert.Equal(t, events[i].ID, action.Index.ID)

			var doc PipelineEvent
			err = json.Unmarshal([]byte(lines[i*2+1]), &doc)
			require.NoError(t, err)
			assert.Equal(t, events[i].ID, doc.ID)
			assert.Equal(t, events[i].Cluster, doc.Cluster)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)
}

func TestElasticDestination_SendEmptyEvents(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not be called for empty events")
	}))
	defer srv.Close()

	dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), nil)
	assert.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{})
	assert.NoError(t, err)
}

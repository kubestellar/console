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
	allowLoopbackDestinations(t)
	dest, err := NewElasticDestination("http://localhost:9200", "", nil)
	require.NoError(t, err)
	assert.Equal(t, elasticDefaultIndex, dest.index)
}

func TestElasticDestination_Provider(t *testing.T) {
	dest := &ElasticDestination{}
	assert.Equal(t, ProviderElastic, dest.Provider())
}

func TestElasticDestination_SendWithoutURLReturnsUnsupported(t *testing.T) {
	dest := &ElasticDestination{index: "test-index"}
	err := dest.Send(context.Background(), []PipelineEvent{{ID: "evt-1"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
}

func TestElasticDestination_SendEmptyEventsSkipsRequest(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("server should not be called for empty events")
	}))
	defer srv.Close()

	dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
	require.NoError(t, err)

	assert.NoError(t, dest.Send(context.Background(), nil))
	assert.NoError(t, dest.Send(context.Background(), []PipelineEvent{}))
}

func TestElasticDestination_SendErrorStatus(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	dest, err := NewElasticDestination(srv.URL, "test-index", srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{{ID: "evt-1"}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "status 502")
}

func TestNewElasticDestination_AppendsBulkPath(t *testing.T) {
	allowLoopbackDestinations(t)

	dest, err := NewElasticDestination("http://localhost:9200/root/", "test-index", nil)
	require.NoError(t, err)
	assert.True(t, strings.HasSuffix(dest.url, "/root/_bulk"))
}

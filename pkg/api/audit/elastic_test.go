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

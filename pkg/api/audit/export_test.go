package audit

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegisterDestination_FullFlow(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	cfg := DestinationConfig{
		ID:       "test-webhook",
		Name:     "Test Webhook",
		Provider: ProviderWebhook,
		URL:      "http://example.com/webhook",
	}

	adapter, err := RegisterDestination(cfg)
	require.NoError(t, err)
	require.NotNil(t, adapter)
	assert.Equal(t, ProviderWebhook, adapter.Provider())

	dests := ListDestinations()
	require.Len(t, dests, 1)
	assert.Equal(t, "test-webhook", dests[0].ID)
	assert.Equal(t, StatusActive, dests[0].Status)
}

func TestBuildSummary(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	// Add a destination
	_, err := RegisterDestination(DestinationConfig{
		ID:       "dest-1",
		Provider: ProviderWebhook,
		URL:      "http://x",
	})
	require.NoError(t, err)

	now := time.Now().UTC()

	// Record some events
	RecordEvent(PipelineEvent{ID: "e1", Timestamp: now.Add(-50 * time.Second)})
	RecordEvent(PipelineEvent{ID: "e2", Timestamp: now.Add(-10 * time.Second)})
	RecordEvent(PipelineEvent{ID: "e3", Timestamp: now.Add(-25 * time.Hour)}) // Outside 24h

	summary := BuildSummary(now)
	assert.Equal(t, 1, summary.TotalDestinations)
	assert.Equal(t, 1, summary.ActiveDestinations)
	assert.Equal(t, int64(2), summary.TotalEvents24h)
	assert.Equal(t, 2, summary.EventsPerMinute) // Both e1 and e2 are within last minute
}

func TestRecordEvent_RingBuffer(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	// maxBufferedEvents is 256. Let's record more.
	for i := 0; i < 300; i++ {
		RecordEvent(PipelineEvent{ID: "evt"})
	}

	events := RecentEvents()
	assert.Len(t, events, 256)
}

func TestWebhookDestination_Send(t *testing.T) {
	events := []PipelineEvent{
		{ID: "evt-1", Cluster: "test-cluster", Timestamp: time.Now().UTC()},
		{ID: "evt-2", Cluster: "test-cluster", Timestamp: time.Now().UTC()},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var payload WebhookPayload
		err = json.Unmarshal(body, &payload)
		require.NoError(t, err)

		assert.Equal(t, webhookPayloadVersion, payload.Version)
		assert.Len(t, payload.Events, 2)
		assert.Equal(t, "evt-1", payload.Events[0].ID)

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)
}

func TestWebhookDestination_SendError(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantErr    string
	}{
		{name: "bad request", statusCode: http.StatusBadRequest, wantErr: "400"},
		{name: "internal server error", statusCode: http.StatusInternalServerError, wantErr: "500"},
		{name: "service unavailable", statusCode: http.StatusServiceUnavailable, wantErr: "503"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
			}))
			defer srv.Close()

			dest, err := NewWebhookDestination(srv.URL, srv.Client())
			require.NoError(t, err)

			events := []PipelineEvent{{ID: "evt-fail", Timestamp: time.Now().UTC()}}
			err = dest.Send(context.Background(), events)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestWebhookDestination_EmptyEvents(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not be called for empty events")
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), nil)
	assert.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{})
	assert.NoError(t, err)
}

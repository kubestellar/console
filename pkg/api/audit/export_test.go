package audit

import (
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

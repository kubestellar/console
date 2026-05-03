package handlers

import (
	"context"
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type eventsTestStore struct {
	test.MockStore
	recordedEvent  *models.UserEvent
	recordErr      error
	capturedSince  time.Duration
	capturedLimit  int
	capturedOffset int
}

func (s *eventsTestStore) RecordEvent(_ context.Context, event *models.UserEvent) error {
	s.recordedEvent = event
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	return s.recordErr
}

func (s *eventsTestStore) GetRecentEvents(_ context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error) {
	s.capturedSince = since
	s.capturedLimit = limit
	s.capturedOffset = offset
	if s.recordErr != nil {
		return nil, s.recordErr
	}
	return []models.UserEvent{{ID: uuid.New(), UserID: userID, EventType: models.EventTypePageView}}, nil
}

func TestEventRecordEvent_Success(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{}
	handler := NewEventHandler(store)
	env.App.Post("/api/events", handler.RecordEvent)

	cardID := uuid.New()
	body, err := json.Marshal(map[string]any{
		"event_type": string(models.EventTypeCardAction),
		"card_id":    cardID.String(),
		"metadata": map[string]any{
			"source": "dashboard",
			"count":  3,
		},
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/events", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	require.NotNil(t, store.recordedEvent)
	assert.Equal(t, testAdminUserID, store.recordedEvent.UserID)
	assert.Equal(t, models.EventTypeCardAction, store.recordedEvent.EventType)
	require.NotNil(t, store.recordedEvent.CardID)
	assert.Equal(t, cardID, *store.recordedEvent.CardID)

	var metadata map[string]any
	require.NoError(t, json.Unmarshal(store.recordedEvent.Metadata, &metadata))
	assert.Equal(t, "dashboard", metadata["source"])
	assert.Equal(t, float64(3), metadata["count"])
}

func TestEventRecordEvent_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewEventHandler(&eventsTestStore{})
	env.App.Post("/api/events", handler.RecordEvent)

	req, err := http.NewRequest(http.MethodPost, "/api/events", bytes.NewBufferString("{"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestEventRecordEvent_InvalidCardID verifies that POST /api/events with a
// non-UUID card_id returns 400 and does NOT insert anything into the store
// (#7855 / #7815).
func TestEventRecordEvent_InvalidCardID(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{}
	handler := NewEventHandler(store)
	env.App.Post("/api/events", handler.RecordEvent)

	body, err := json.Marshal(map[string]any{
		"event_type": string(models.EventTypeCardAction),
		"card_id":    "not-a-uuid",
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/events", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	// Critical: RecordEvent must not have been called — otherwise a junk
	// row would land in user_events with a nil CardID.
	assert.Nil(t, store.recordedEvent, "RecordEvent should not be called when card_id is invalid")
}

func TestEventRecordEvent_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{recordErr: errors.New("write failed")}
	handler := NewEventHandler(store)
	env.App.Post("/api/events", handler.RecordEvent)

	body, err := json.Marshal(map[string]any{"event_type": string(models.EventTypePageView)})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/events", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}
func TestEventGetEvents_Success(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{}
	handler := NewEventHandler(store)
	env.App.Get("/api/events", handler.GetEvents)

	req, err := http.NewRequest(http.MethodGet, "/api/events", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result struct {
		Events []models.UserEvent `json:"events"`
	}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Len(t, result.Events, 1)
	assert.Equal(t, testAdminUserID, result.Events[0].UserID)
}

func TestEventGetEvents_QueryParams(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{}
	handler := NewEventHandler(store)
	env.App.Get("/api/events", handler.GetEvents)

	req, err := http.NewRequest(http.MethodGet, "/api/events?since=1h&limit=50&offset=10", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result struct {
		Limit  int `json:"limit"`
		Offset int `json:"offset"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, 50, result.Limit)
	assert.Equal(t, 10, result.Offset)
	assert.Equal(t, time.Hour, store.capturedSince)
	assert.Equal(t, 50, store.capturedLimit)
	assert.Equal(t, 10, store.capturedOffset)
}

func TestEventGetEvents_LimitClamped(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{}
	handler := NewEventHandler(store)
	env.App.Get("/api/events", handler.GetEvents)

	req, err := http.NewRequest(http.MethodGet, "/api/events?limit=999999", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result struct {
		Limit int `json:"limit"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	// The response must reflect the clamped value, not the raw caller-supplied one.
	assert.Equal(t, maxEventLimit, result.Limit, "limit in response must be clamped to maxEventLimit")
	assert.Equal(t, maxEventLimit, store.capturedLimit, "store must receive the clamped limit")
}

func TestEventGetEvents_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	store := &eventsTestStore{recordErr: errors.New("read failed")}
	handler := NewEventHandler(store)
	env.App.Get("/api/events", handler.GetEvents)

	req, err := http.NewRequest(http.MethodGet, "/api/events", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

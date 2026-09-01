package store

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// The existing TestUserEventCRUD/"Record and GetRecentEvents round-trip"
// covers RecordEvent's happy path with a bare event (no CardID, no Metadata),
// leaving these two arms at sqlite_dashboards.go:644 uncovered:
//
//   - `if event.CardID != nil { ... cardID = &str }`     — CardID pointer set
//   - `if event.Metadata != nil { ... metadataStr = &str }` — Metadata set
//
// These tests pin both arms by recording events with CardID and Metadata
// populated, then reading them back through GetRecentEvents and asserting
// the round-tripped values match. Coverage on RecordEvent rises from
// 75% -> 100%.

func TestRecordEventPersistsCardIDAndMetadata(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-event-branches", "eventbranchesuser")
	dash := &models.Dashboard{UserID: user.ID, Name: "Main"}
	require.NoError(t, s.CreateDashboard(ctx, dash))
	card := &models.Card{DashboardID: dash.ID, CardType: models.CardTypeClusterHealth, Position: models.CardPosition{W: 1, H: 1}}
	require.NoError(t, s.CreateCard(ctx, card))

	metaRaw := json.RawMessage(`{"reason":"user-click","step":3}`)
	event := &models.UserEvent{
		UserID:    user.ID,
		EventType: models.EventTypeCardFocus,
		CardID:    &card.ID,
		Metadata:  metaRaw,
	}
	require.NoError(t, s.RecordEvent(ctx, event))

	// RecordEvent must assign a fresh ID and stamp CreatedAt.
	require.NotEqual(t, uuid.Nil, event.ID, "RecordEvent should assign an ID when zero")
	require.False(t, event.CreatedAt.IsZero(), "RecordEvent should stamp CreatedAt")

	got, err := s.GetRecentEvents(ctx, user.ID, time.Hour, 10, 0)
	require.NoError(t, err)
	require.Len(t, got, 1)

	require.NotNil(t, got[0].CardID, "CardID must round-trip when set")
	require.Equal(t, card.ID, *got[0].CardID)
	require.JSONEq(t, string(metaRaw), string(got[0].Metadata))
	require.Equal(t, models.EventTypeCardFocus, got[0].EventType)
}

func TestRecordEventPreservesPreassignedID(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-event-preassigned", "preassigneduser")

	preID := uuid.New()
	event := &models.UserEvent{
		ID:        preID,
		UserID:    user.ID,
		EventType: models.EventTypeCardFocus,
	}
	require.NoError(t, s.RecordEvent(ctx, event))
	// The `event.ID == uuid.Nil` guard's false arm — pre-assigned IDs must
	// pass through unchanged.
	require.Equal(t, preID, event.ID)

	got, err := s.GetRecentEvents(ctx, user.ID, time.Hour, 10, 0)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, preID, got[0].ID)
	// The CardID nil arm and Metadata nil arm are the paths the existing
	// happy-path test also covers; asserting them here keeps the two
	// pinning tests independent.
	require.Nil(t, got[0].CardID)
	require.Empty(t, got[0].Metadata)
}

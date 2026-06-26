package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

func TestCardHistoryCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-history", "historyuser")

	t.Run("Add and GetUserCardHistory round-trip", func(t *testing.T) {
		origID := uuid.New()
		history := &models.CardHistory{
			UserID:         user.ID,
			OriginalCardID: &origID,
			CardType:       models.CardTypeClusterHealth,
			Reason:         "User manual swap",
		}
		require.NoError(t, s.AddCardHistory(ctx, history))

		list, err := s.GetUserCardHistory(ctx, user.ID, 10)
		require.NoError(t, err)
		require.Len(t, list, 1)
		require.Equal(t, "User manual swap", list[0].Reason)
	})
}

func TestPendingSwapCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-swap", "swapuser")
	dash := &models.Dashboard{UserID: user.ID, Name: "SwapDash"}
	require.NoError(t, s.CreateDashboard(ctx, dash))
	card := &models.Card{DashboardID: dash.ID, CardType: models.CardTypePodIssues, Position: models.CardPosition{W: 1, H: 1}}
	require.NoError(t, s.CreateCard(ctx, card))

	t.Run("Create and GetPendingSwap round-trip", func(t *testing.T) {
		swap := &models.PendingSwap{
			UserID:      user.ID,
			CardID:      card.ID,
			NewCardType: models.CardTypeTopPods,
			Reason:      "Optimizing layout",
			SwapAt:      time.Now().Add(time.Hour),
		}
		require.NoError(t, s.CreatePendingSwap(ctx, swap))

		got, err := s.GetPendingSwap(ctx, swap.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, models.CardTypeTopPods, got.NewCardType)
	})

	t.Run("UpdateSwapStatus changes status", func(t *testing.T) {
		swap := &models.PendingSwap{
			UserID:      user.ID,
			CardID:      card.ID,
			NewCardType: models.CardTypeEventStream,
			SwapAt:      time.Now().Add(time.Hour),
		}
		require.NoError(t, s.CreatePendingSwap(ctx, swap))

		require.NoError(t, s.UpdateSwapStatus(ctx, swap.ID, models.SwapStatusCompleted))

		got, err := s.GetPendingSwap(ctx, swap.ID)
		require.NoError(t, err)
		require.Equal(t, models.SwapStatusCompleted, got.Status)
	})
}

func TestUserEventCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-event", "eventuser")

	t.Run("Record and GetRecentEvents round-trip", func(t *testing.T) {
		event := &models.UserEvent{
			UserID:    user.ID,
			EventType: models.EventTypeCardFocus,
		}
		require.NoError(t, s.RecordEvent(ctx, event))

		events, err := s.GetRecentEvents(ctx, user.ID, time.Hour, 10, 0)
		require.NoError(t, err)
		require.Len(t, events, 1)
		require.Equal(t, models.EventTypeCardFocus, events[0].EventType)
	})
}

func TestDashboardExtra(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-dash-extra", "dashuser")

	t.Run("CountUserDashboards returns correct count", func(t *testing.T) {
		for i := 0; i < 3; i++ {
			require.NoError(t, s.CreateDashboard(ctx, &models.Dashboard{UserID: user.ID, Name: "D"}))
		}
		count, err := s.CountUserDashboards(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, 3, count)
	})

	t.Run("MoveCardWithLimit moves card and enforces limit", func(t *testing.T) {
		d1 := &models.Dashboard{UserID: user.ID, Name: "D1"}
		d2 := &models.Dashboard{UserID: user.ID, Name: "D2"}
		require.NoError(t, s.CreateDashboard(ctx, d1))
		require.NoError(t, s.CreateDashboard(ctx, d2))

		card := &models.Card{DashboardID: d1.ID, CardType: models.CardTypeClusterHealth, Position: models.CardPosition{W: 1, H: 1}}
		require.NoError(t, s.CreateCard(ctx, card))

		// Move to d2
		require.NoError(t, s.MoveCardWithLimit(ctx, card.ID, d2.ID, 5))

		cards, err := s.GetDashboardCards(ctx, d2.ID)
		require.NoError(t, err)
		require.Len(t, cards, 1)
		require.Equal(t, card.ID, cards[0].ID)

		// Try to move back but with limit 0
		err = s.MoveCardWithLimit(ctx, card.ID, d1.ID, 0)
		require.ErrorIs(t, err, ErrDashboardCardLimitReached)
	})
}

package store

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// TestCreateCardTx exercises the transactional variant of CreateCard,
// previously at 0.0% coverage. CreateCardTx is a thin wrapper around the
// same createCard helper used by CreateCard but takes a *sql.Tx instead of
// s.db, which lets handlers batch a card insert into a larger business
// transaction (e.g. dashboard-import atomicity).
//
// The critical invariants are:
//  1. A committed transaction must persist the card so subsequent reads
//     via GetDashboardCards see it.
//  2. A rolled-back transaction must NOT leak the card into the dashboard.
//  3. CreateCardTx must generate a UUID when the caller passes uuid.Nil,
//     matching the non-Tx variant.
//
// A regression that (for example) accidentally routed CreateCardTx through
// s.db instead of tx would silently defeat rollback semantics and land past
// CI today because no test file references CreateCardTx by name.
func TestCreateCardTx(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-cardtx", "cardtxuser")

	dash := &models.Dashboard{UserID: user.ID, Name: "TxDash"}
	require.NoError(t, s.CreateDashboard(ctx, dash))

	t.Run("committed tx persists the card", func(t *testing.T) {
		tx, err := s.db.BeginTx(ctx, nil)
		require.NoError(t, err)

		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{W: 2, H: 1},
		}
		require.NoError(t, s.CreateCardTx(ctx, tx, card))
		require.NotEqual(t, uuid.Nil, card.ID, "CreateCardTx must assign an ID when caller passes uuid.Nil")
		require.False(t, card.CreatedAt.IsZero(), "CreateCardTx must stamp CreatedAt")

		require.NoError(t, tx.Commit())

		cards, err := s.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		require.Len(t, cards, 1, "committed CreateCardTx card must be visible after commit")
		require.Equal(t, card.ID, cards[0].ID)
		require.Equal(t, models.CardTypePodIssues, cards[0].CardType)
	})

	t.Run("rolled-back tx does not leak the card", func(t *testing.T) {
		// Start from a clean dashboard so the rollback assertion is precise.
		dash2 := &models.Dashboard{UserID: user.ID, Name: "TxDashRollback"}
		require.NoError(t, s.CreateDashboard(ctx, dash2))

		tx, err := s.db.BeginTx(ctx, nil)
		require.NoError(t, err)

		card := &models.Card{
			DashboardID: dash2.ID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{W: 1, H: 1},
		}
		require.NoError(t, s.CreateCardTx(ctx, tx, card))
		require.NotEqual(t, uuid.Nil, card.ID)

		require.NoError(t, tx.Rollback())

		cards, err := s.GetDashboardCards(ctx, dash2.ID)
		require.NoError(t, err)
		require.Empty(t, cards, "rolled-back CreateCardTx card must NOT be visible — otherwise the write bypassed the transaction")
	})

	t.Run("preserves a caller-supplied UUID", func(t *testing.T) {
		presetID := uuid.New()
		tx, err := s.db.BeginTx(ctx, nil)
		require.NoError(t, err)

		card := &models.Card{
			ID:          presetID,
			DashboardID: dash.ID,
			CardType:    models.CardTypeTopPods,
			Position:    models.CardPosition{W: 3, H: 2},
		}
		require.NoError(t, s.CreateCardTx(ctx, tx, card))
		require.Equal(t, presetID, card.ID, "CreateCardTx must not overwrite a caller-supplied UUID")
		require.NoError(t, tx.Commit())

		cards, err := s.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		var found bool
		for _, c := range cards {
			if c.ID == presetID {
				found = true
				break
			}
		}
		require.True(t, found, "committed card with caller-supplied UUID must be visible")
	})
}

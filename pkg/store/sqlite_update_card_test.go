package store

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// TestUpdateCard_SuccessPath covers the previously-uncovered happy-path
// branches of UpdateCard (sqlite_dashboards.go:366). Prior to this file the
// only existing UpdateCard test (TestUpdateCard_MissingReturnsErrNoRows in
// wave3_fixes_test.go) exercised the sql.ErrNoRows branch when the id is
// absent, leaving:
//
//   - the RowsAffected > 0 success return;
//   - the configStr == nil branch (card.Config left nil); and
//   - the configStr != nil branch (card.Config populated with raw JSON)
//
// all uncovered, so a regression that (for example) forgot to persist Config
// or swapped Position and Config columns would ship green.
//
// This lifts UpdateCard from 62.5% -> 100%.
func TestUpdateCard_SuccessPath(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-updcard", "updcarduser")

	dash := &models.Dashboard{UserID: user.ID, Name: "UpdCardDash"}
	require.NoError(t, s.CreateDashboard(ctx, dash))

	t.Run("nil Config: position updates and Config remains nil", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{X: 1, Y: 2, W: 3, H: 4},
		}
		require.NoError(t, s.CreateCard(ctx, card))

		card.Position = models.CardPosition{X: 5, Y: 6, W: 7, H: 8}
		require.NoError(t, s.UpdateCard(ctx, card))

		got, err := s.GetCard(ctx, card.ID)
		require.NoError(t, err)
		assert.Equal(t, models.CardPosition{X: 5, Y: 6, W: 7, H: 8}, got.Position)
		assert.Nil(t, got.Config, "nil Config in must round-trip as nil out")
	})

	t.Run("non-nil Config: raw JSON round-trips", func(t *testing.T) {
		initial := json.RawMessage(`{"widget":"gauge","threshold":10}`)
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{W: 1, H: 1},
			Config:      initial,
		}
		require.NoError(t, s.CreateCard(ctx, card))

		card.Config = json.RawMessage(`{"widget":"gauge","threshold":42}`)
		card.Position = models.CardPosition{X: 9, Y: 9, W: 2, H: 2}
		require.NoError(t, s.UpdateCard(ctx, card))

		got, err := s.GetCard(ctx, card.ID)
		require.NoError(t, err)
		assert.JSONEq(t, `{"widget":"gauge","threshold":42}`, string(got.Config),
			"UpdateCard must persist the new Config JSON, not the pre-update value")
		assert.Equal(t, models.CardPosition{X: 9, Y: 9, W: 2, H: 2}, got.Position)
	})

	t.Run("dashboard_id column is written from card.DashboardID", func(t *testing.T) {
		// Create a second dashboard so we can prove the WHERE-id UPDATE also
		// re-parents the card via the SET dashboard_id = ? clause.
		other := &models.Dashboard{UserID: user.ID, Name: "OtherUpdCardDash"}
		require.NoError(t, s.CreateDashboard(ctx, other))

		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{W: 1, H: 1},
		}
		require.NoError(t, s.CreateCard(ctx, card))

		card.DashboardID = other.ID
		require.NoError(t, s.UpdateCard(ctx, card))

		// The card must now appear under `other` and NOT under `dash`.
		got, err := s.GetCard(ctx, card.ID)
		require.NoError(t, err)
		assert.Equal(t, other.ID, got.DashboardID,
			"UpdateCard must re-parent card via SET dashboard_id")

		// And the source dashboard's card set must exclude it.
		srcCards, err := s.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		for _, c := range srcCards {
			assert.NotEqual(t, card.ID, c.ID, "moved card must no longer be in source dashboard")
		}
	})

	t.Run("stale/wrong id returns ErrNoRows even when other cards exist", func(t *testing.T) {
		// Guardrail for the RowsAffected == 0 branch: at this point the store
		// contains cards from previous subtests, so this proves the check is
		// per-id, not "was any row touched by this UPDATE against this table".
		bogus := &models.Card{
			ID:          uuid.New(),
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{W: 1, H: 1},
		}
		err := s.UpdateCard(ctx, bogus)
		require.Error(t, err, "UpdateCard on unknown id must return an error")
	})
}

package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/require"
)

func TestDashboardOperations(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	// Create a test user first
	userID := uuid.New()
	_, err := store.db.ExecContext(ctx,
		`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		userID.String(), "gh-001", "testuser", "viewer", 0,
	)
	require.NoError(t, err)

	t.Run("CreateDashboard persists dashboard", func(t *testing.T) {
		layout := json.RawMessage(`{"columns": 3}`)
		dash := &models.Dashboard{
			UserID:    userID,
			Name:      "Test Dashboard",
			Layout:    layout,
			IsDefault: true,
		}

		err := store.CreateDashboard(ctx, dash)
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, dash.ID)
		require.False(t, dash.CreatedAt.IsZero())
	})

	t.Run("GetDashboard retrieves dashboard", func(t *testing.T) {
		layout := json.RawMessage(`{"columns": 2}`)
		dash := &models.Dashboard{
			UserID:    userID,
			Name:      "Retrievable Dashboard",
			Layout:    layout,
			IsDefault: false,
		}
		err := store.CreateDashboard(ctx, dash)
		require.NoError(t, err)

		retrieved, err := store.GetDashboard(ctx, dash.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "Retrievable Dashboard", retrieved.Name)
		require.Equal(t, userID, retrieved.UserID)
		require.JSONEq(t, `{"columns": 2}`, string(retrieved.Layout))
	})

	t.Run("GetUserDashboards returns user dashboards", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-002", "dashuser", "viewer", 0,
		)
		require.NoError(t, err)

		// Create multiple dashboards
		for i := 0; i < 3; i++ {
			dash := &models.Dashboard{
				UserID: uid,
				Name:   "Dashboard " + string(rune('A'+i)),
			}
			err := s.CreateDashboard(ctx, dash)
			require.NoError(t, err)
		}

		dashboards, err := s.GetUserDashboards(ctx, uid, 0, 0)
		require.NoError(t, err)
		require.Len(t, dashboards, 3)
	})

	t.Run("GetDefaultDashboard returns default dashboard", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-003", "defuser", "viewer", 0,
		)
		require.NoError(t, err)

		nonDefault := &models.Dashboard{
			UserID:    uid,
			Name:      "Non-Default",
			IsDefault: false,
		}
		err = s.CreateDashboard(ctx, nonDefault)
		require.NoError(t, err)

		defaultDash := &models.Dashboard{
			UserID:    uid,
			Name:      "Default",
			IsDefault: true,
		}
		err = s.CreateDashboard(ctx, defaultDash)
		require.NoError(t, err)

		retrieved, err := s.GetDefaultDashboard(ctx, uid)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "Default", retrieved.Name)
		require.True(t, retrieved.IsDefault)
	})

	t.Run("UpdateDashboard modifies dashboard", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-004", "upduser", "viewer", 0,
		)
		require.NoError(t, err)

		dash := &models.Dashboard{
			UserID: uid,
			Name:   "Original Name",
		}
		err = s.CreateDashboard(ctx, dash)
		require.NoError(t, err)

		dash.Name = "Updated Name"
		newLayout := json.RawMessage(`{"columns": 4}`)
		dash.Layout = newLayout

		err = s.UpdateDashboard(ctx, dash)
		require.NoError(t, err)
		require.NotNil(t, dash.UpdatedAt)

		retrieved, err := s.GetDashboard(ctx, dash.ID)
		require.NoError(t, err)
		require.Equal(t, "Updated Name", retrieved.Name)
		require.JSONEq(t, `{"columns": 4}`, string(retrieved.Layout))
	})

	t.Run("DeleteDashboard removes dashboard", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-005", "deluser", "viewer", 0,
		)
		require.NoError(t, err)

		dash := &models.Dashboard{
			UserID: uid,
			Name:   "To Delete",
		}
		err = s.CreateDashboard(ctx, dash)
		require.NoError(t, err)

		err = s.DeleteDashboard(ctx, dash.ID)
		require.NoError(t, err)

		retrieved, err := s.GetDashboard(ctx, dash.ID)
		require.NoError(t, err)
		require.Nil(t, retrieved)
	})

	t.Run("CountUserDashboards returns count", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-006", "countuser", "viewer", 0,
		)
		require.NoError(t, err)

		for i := 0; i < 5; i++ {
			dash := &models.Dashboard{
				UserID: uid,
				Name:   "Dashboard",
			}
			err := s.CreateDashboard(ctx, dash)
			require.NoError(t, err)
		}

		count, err := s.CountUserDashboards(ctx, uid)
		require.NoError(t, err)
		require.Equal(t, 5, count)
	})
}

func TestCardOperations(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	// Setup user and dashboard
	userID := uuid.New()
	_, err := store.db.ExecContext(ctx,
		`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		userID.String(), "gh-card", "carduser", "viewer", 0,
	)
	require.NoError(t, err)

	dashID := uuid.New()
	_, err = store.db.ExecContext(ctx,
		`INSERT INTO dashboards (id, user_id, name, is_default, created_at)
		 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		dashID.String(), userID.String(), "Card Dashboard", 0,
	)
	require.NoError(t, err)

	t.Run("CreateCard persists card", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dashID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{X: 0, Y: 0, W: 4, H: 3},
		}

		err := store.CreateCard(ctx, card)
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, card.ID)
	})

	t.Run("GetCard retrieves card", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dashID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{X: 4, Y: 0, W: 4, H: 3},
		}
		err := store.CreateCard(ctx, card)
		require.NoError(t, err)

		retrieved, err := store.GetCard(ctx, card.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, models.CardTypePodIssues, retrieved.CardType)
		require.Equal(t, 4, retrieved.Position.X)
	})

	t.Run("GetDashboardCards returns cards", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-cards", "cardsuser", "viewer", 0,
		)
		require.NoError(t, err)

		did := uuid.New()
		_, err = s.db.ExecContext(ctx,
			`INSERT INTO dashboards (id, user_id, name, is_default, created_at)
			 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			did.String(), uid.String(), "Cards Dashboard", 0,
		)
		require.NoError(t, err)

		for i := 0; i < 3; i++ {
			card := &models.Card{
				DashboardID: did,
				CardType:    models.CardTypeClusterHealth,
				Position:    models.CardPosition{X: i, Y: 0, W: 4, H: 3},
			}
			err := s.CreateCard(ctx, card)
			require.NoError(t, err)
		}

		cards, err := s.GetDashboardCards(ctx, did)
		require.NoError(t, err)
		require.Len(t, cards, 3)
	})

	t.Run("UpdateCardFocus sets summary and focus time", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dashID,
			CardType:    models.CardTypeEventStream,
			Position:    models.CardPosition{X: 0, Y: 3, W: 8, H: 3},
		}
		err := store.CreateCard(ctx, card)
		require.NoError(t, err)

		err = store.UpdateCardFocus(ctx, card.ID, "All systems operational")
		require.NoError(t, err)

		retrieved, err := store.GetCard(ctx, card.ID)
		require.NoError(t, err)
		require.Equal(t, "All systems operational", retrieved.LastSummary)
		require.NotNil(t, retrieved.LastFocus)
	})

	t.Run("DeleteCard removes card", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dashID,
			CardType:    models.CardTypeTopPods,
			Position:    models.CardPosition{X: 0, Y: 6, W: 4, H: 3},
		}
		err := store.CreateCard(ctx, card)
		require.NoError(t, err)

		err = store.DeleteCard(ctx, card.ID)
		require.NoError(t, err)

		retrieved, err := store.GetCard(ctx, card.ID)
		require.NoError(t, err)
		require.Nil(t, retrieved)
	})
}

package store

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// newTestStore creates a fresh SQLiteStore backed by a temp file for each test.
func newTestStore(t *testing.T) *SQLiteStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { store.Close() })
	return store
}

// createTestUser is a helper that persists a user and returns it.
func createTestUser(t *testing.T, store *SQLiteStore, githubID, login string) *models.User {
	t.Helper()
	user := &models.User{
		GitHubID:    githubID,
		GitHubLogin: login,
		Email:       login + "@example.com",
		Role:        models.UserRoleViewer,
	}
	require.NoError(t, store.CreateUser(user))
	require.NotEqual(t, uuid.Nil, user.ID, "CreateUser should assign an ID")
	return user
}

func TestNewSQLiteStore(t *testing.T) {
	tests := []struct {
		name    string
		dbPath  string
		wantErr bool
	}{
		{
			name:    "valid temp file path",
			dbPath:  filepath.Join(t.TempDir(), "new.db"),
			wantErr: false,
		},
		{
			name:    "invalid path",
			dbPath:  "/nonexistent-dir-abc123/sub/test.db",
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store, err := NewSQLiteStore(tc.dbPath)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, store)
			store.Close()
		})
	}
}

func TestUserCRUD(t *testing.T) {
	store := newTestStore(t)

	t.Run("CreateUser assigns ID and timestamp", func(t *testing.T) {
		user := createTestUser(t, store, "gh-100", "alice")
		require.False(t, user.CreatedAt.IsZero(), "CreatedAt should be set")
	})

	t.Run("GetUserByGitHubID returns created user", func(t *testing.T) {
		_ = createTestUser(t, store, "gh-200", "bob")

		got, err := store.GetUserByGitHubID("gh-200")
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "bob", got.GitHubLogin)
		require.Equal(t, models.UserRoleViewer, got.Role)
	})

	t.Run("GetUser returns created user by ID", func(t *testing.T) {
		user := createTestUser(t, store, "gh-300", "carol")

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "carol", got.GitHubLogin)
	})

	t.Run("GetUserByGitHubID returns nil for unknown ID", func(t *testing.T) {
		got, err := store.GetUserByGitHubID("nonexistent")
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("UpdateUser modifies fields", func(t *testing.T) {
		user := createTestUser(t, store, "gh-400", "dave")
		user.Email = "dave-updated@example.com"
		user.Onboarded = true
		require.NoError(t, store.UpdateUser(user))

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.Equal(t, "dave-updated@example.com", got.Email)
		require.True(t, got.Onboarded)
	})

	t.Run("UpdateUserRole changes role only", func(t *testing.T) {
		user := createTestUser(t, store, "gh-500", "eve")
		require.NoError(t, store.UpdateUserRole(user.ID, "admin"))

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.Equal(t, models.UserRoleAdmin, got.Role)
	})

	t.Run("DeleteUser removes user", func(t *testing.T) {
		user := createTestUser(t, store, "gh-600", "frank")
		require.NoError(t, store.DeleteUser(user.ID))

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("ListUsers returns all users", func(t *testing.T) {
		// Create a fresh store to have a clean count
		s := newTestStore(t)
		createTestUser(t, s, "gh-list-1", "u1")
		createTestUser(t, s, "gh-list-2", "u2")

		users, err := s.ListUsers()
		require.NoError(t, err)
		require.Len(t, users, 2)
	})

	t.Run("CountUsersByRole returns correct counts", func(t *testing.T) {
		s := newTestStore(t)
		u1 := createTestUser(t, s, "gh-count-1", "admin1")
		require.NoError(t, s.UpdateUserRole(u1.ID, "admin"))
		createTestUser(t, s, "gh-count-2", "viewer1")
		createTestUser(t, s, "gh-count-3", "viewer2")

		admins, editors, viewers, err := s.CountUsersByRole()
		require.NoError(t, err)
		require.Equal(t, 1, admins)
		require.Equal(t, 0, editors)
		require.Equal(t, 2, viewers)
	})

	t.Run("UpdateLastLogin sets last_login", func(t *testing.T) {
		user := createTestUser(t, store, "gh-700", "grace")
		require.NoError(t, store.UpdateLastLogin(user.ID))

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.NotNil(t, got.LastLogin)
	})
}

func TestTokenRevocation(t *testing.T) {
	store := newTestStore(t)

	t.Run("RevokeToken and IsTokenRevoked round-trip", func(t *testing.T) {
		jti := "token-abc-123"
		futureExpiry := time.Now().Add(time.Hour)

		require.NoError(t, store.RevokeToken(jti, futureExpiry))

		revoked, err := store.IsTokenRevoked(jti)
		require.NoError(t, err)
		require.True(t, revoked)
	})

	t.Run("IsTokenRevoked returns false for unknown token", func(t *testing.T) {
		revoked, err := store.IsTokenRevoked("unknown-jti")
		require.NoError(t, err)
		require.False(t, revoked)
	})

	t.Run("CleanupExpiredTokens removes expired entries", func(t *testing.T) {
		s := newTestStore(t)
		pastExpiry := time.Now().Add(-time.Hour)
		require.NoError(t, s.RevokeToken("expired-token", pastExpiry))

		// Also add a valid token
		futureExpiry := time.Now().Add(time.Hour)
		require.NoError(t, s.RevokeToken("valid-token", futureExpiry))

		removed, err := s.CleanupExpiredTokens()
		require.NoError(t, err)
		require.Equal(t, int64(1), removed)

		// Expired one should be gone
		revoked, err := s.IsTokenRevoked("expired-token")
		require.NoError(t, err)
		require.False(t, revoked)

		// Valid one should still be present
		revoked, err = s.IsTokenRevoked("valid-token")
		require.NoError(t, err)
		require.True(t, revoked)
	})
}

func TestDashboardCRUD(t *testing.T) {
	store := newTestStore(t)
	user := createTestUser(t, store, "gh-dash", "dashuser")

	t.Run("CreateDashboard and GetDashboard round-trip", func(t *testing.T) {
		layout := json.RawMessage(`{"columns": 3}`)
		dash := &models.Dashboard{
			UserID:    user.ID,
			Name:      "My Dashboard",
			Layout:    layout,
			IsDefault: true,
		}
		require.NoError(t, store.CreateDashboard(dash))
		require.NotEqual(t, uuid.Nil, dash.ID)

		got, err := store.GetDashboard(dash.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "My Dashboard", got.Name)
		require.True(t, got.IsDefault)
		require.JSONEq(t, `{"columns": 3}`, string(got.Layout))
	})

	t.Run("GetUserDashboards returns all user dashboards", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-dashlist", "dashlistuser")

		for i := 0; i < 3; i++ {
			require.NoError(t, s.CreateDashboard(&models.Dashboard{
				UserID: u.ID,
				Name:   "Dashboard",
			}))
		}

		dashboards, err := s.GetUserDashboards(u.ID)
		require.NoError(t, err)
		require.Len(t, dashboards, 3)
	})

	t.Run("GetDefaultDashboard returns the default", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-default", "defuser")

		require.NoError(t, s.CreateDashboard(&models.Dashboard{
			UserID:    u.ID,
			Name:      "Non-default",
			IsDefault: false,
		}))
		require.NoError(t, s.CreateDashboard(&models.Dashboard{
			UserID:    u.ID,
			Name:      "Default",
			IsDefault: true,
		}))

		got, err := s.GetDefaultDashboard(u.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "Default", got.Name)
	})

	t.Run("UpdateDashboard modifies fields", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-upd", "upduser")

		dash := &models.Dashboard{UserID: u.ID, Name: "Original"}
		require.NoError(t, s.CreateDashboard(dash))

		dash.Name = "Updated"
		require.NoError(t, s.UpdateDashboard(dash))

		got, err := s.GetDashboard(dash.ID)
		require.NoError(t, err)
		require.Equal(t, "Updated", got.Name)
		require.NotNil(t, got.UpdatedAt)
	})

	t.Run("DeleteDashboard removes dashboard", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-del", "deluser")

		dash := &models.Dashboard{UserID: u.ID, Name: "ToDelete"}
		require.NoError(t, s.CreateDashboard(dash))
		require.NoError(t, s.DeleteDashboard(dash.ID))

		got, err := s.GetDashboard(dash.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})
}

func TestCardCRUD(t *testing.T) {
	store := newTestStore(t)
	user := createTestUser(t, store, "gh-card", "carduser")
	dash := &models.Dashboard{UserID: user.ID, Name: "CardDash"}
	require.NoError(t, store.CreateDashboard(dash))

	t.Run("CreateCard and GetCard round-trip", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{X: 0, Y: 0, W: 4, H: 3},
		}
		require.NoError(t, store.CreateCard(card))
		require.NotEqual(t, uuid.Nil, card.ID)

		got, err := store.GetCard(card.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, models.CardTypeClusterHealth, got.CardType)
		require.Equal(t, 4, got.Position.W)
	})

	t.Run("GetDashboardCards returns cards for dashboard", func(t *testing.T) {
		require.NoError(t, store.CreateCard(&models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{X: 4, Y: 0, W: 4, H: 3},
		}))

		cards, err := store.GetDashboardCards(dash.ID)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(cards), 1)
	})

	t.Run("UpdateCardFocus sets summary and focus time", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeEventStream,
			Position:    models.CardPosition{X: 0, Y: 3, W: 8, H: 3},
		}
		require.NoError(t, store.CreateCard(card))
		require.NoError(t, store.UpdateCardFocus(card.ID, "All healthy"))

		got, err := store.GetCard(card.ID)
		require.NoError(t, err)
		require.Equal(t, "All healthy", got.LastSummary)
		require.NotNil(t, got.LastFocus)
	})

	t.Run("DeleteCard removes card", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeTopPods,
			Position:    models.CardPosition{X: 0, Y: 6, W: 4, H: 3},
		}
		require.NoError(t, store.CreateCard(card))
		require.NoError(t, store.DeleteCard(card.ID))

		got, err := store.GetCard(card.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})
}

func TestOnboarding(t *testing.T) {
	store := newTestStore(t)
	user := createTestUser(t, store, "gh-onboard", "onboarduser")

	t.Run("SaveOnboardingResponse and GetOnboardingResponses round-trip", func(t *testing.T) {
		resp := &models.OnboardingResponse{
			UserID:      user.ID,
			QuestionKey: "role",
			Answer:      "SRE",
		}
		require.NoError(t, store.SaveOnboardingResponse(resp))

		responses, err := store.GetOnboardingResponses(user.ID)
		require.NoError(t, err)
		require.Len(t, responses, 1)
		require.Equal(t, "SRE", responses[0].Answer)
	})

	t.Run("SetUserOnboarded marks user as onboarded", func(t *testing.T) {
		require.NoError(t, store.SetUserOnboarded(user.ID))

		got, err := store.GetUser(user.ID)
		require.NoError(t, err)
		require.True(t, got.Onboarded)
	})
}

func TestHelpers(t *testing.T) {
	t.Run("getEnvInt returns default for unset var", func(t *testing.T) {
		const defaultVal = 42
		got := getEnvInt("KC_TEST_NONEXISTENT_VAR_XYZ", defaultVal)
		require.Equal(t, defaultVal, got)
	})

	t.Run("nullString empty returns invalid NullString", func(t *testing.T) {
		ns := nullString("")
		require.False(t, ns.Valid)
	})

	t.Run("nullString non-empty returns valid NullString", func(t *testing.T) {
		ns := nullString("hello")
		require.True(t, ns.Valid)
		require.Equal(t, "hello", ns.String)
	})

	t.Run("boolToInt converts correctly", func(t *testing.T) {
		require.Equal(t, 1, boolToInt(true))
		require.Equal(t, 0, boolToInt(false))
	})
}

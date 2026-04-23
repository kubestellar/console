package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// ctx is a background context used by all test store method calls.
var ctx = context.Background() //nolint:gochecknoglobals // test-only convenience

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
	require.NoError(t, store.CreateUser(ctx, user))
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

		got, err := store.GetUserByGitHubID(ctx, "gh-200")
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "bob", got.GitHubLogin)
		require.Equal(t, models.UserRoleViewer, got.Role)
	})

	t.Run("GetUser returns created user by ID", func(t *testing.T) {
		user := createTestUser(t, store, "gh-300", "carol")

		got, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "carol", got.GitHubLogin)
	})

	t.Run("GetUserByGitHubLogin returns created user (case-insensitive)", func(t *testing.T) {
		_ = createTestUser(t, store, "gh-800", "Charlie")

		got, err := store.GetUserByGitHubLogin(ctx, "charlie")
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "Charlie", got.GitHubLogin)

		got2, err := store.GetUserByGitHubLogin(ctx, "CHARLIE")
		require.NoError(t, err)
		require.NotNil(t, got2)
		require.Equal(t, "Charlie", got2.GitHubLogin)
	})

	t.Run("GetUserByGitHubID returns nil for unknown ID", func(t *testing.T) {
		got, err := store.GetUserByGitHubID(ctx, "nonexistent")
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("UpdateUser modifies fields", func(t *testing.T) {
		user := createTestUser(t, store, "gh-400", "dave")
		user.Email = "dave-updated@example.com"
		user.Onboarded = true
		require.NoError(t, store.UpdateUser(ctx, user))

		got, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, "dave-updated@example.com", got.Email)
		require.True(t, got.Onboarded)
	})

	t.Run("UpdateUserRole changes role only", func(t *testing.T) {
		user := createTestUser(t, store, "gh-500", "eve")
		require.NoError(t, store.UpdateUserRole(ctx, user.ID, "admin"))

		got, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, models.UserRoleAdmin, got.Role)
	})

	t.Run("DeleteUser removes user", func(t *testing.T) {
		user := createTestUser(t, store, "gh-600", "frank")
		require.NoError(t, store.DeleteUser(ctx, user.ID))

		got, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("ListUsers returns all users", func(t *testing.T) {
		// Create a fresh store to have a clean count
		s := newTestStore(t)
		createTestUser(t, s, "gh-list-1", "u1")
		createTestUser(t, s, "gh-list-2", "u2")

		// #6595: ListUsers now requires limit/offset; 0 means store default.
		users, err := s.ListUsers(ctx, 0, 0)
		require.NoError(t, err)
		require.Len(t, users, 2)
	})

	t.Run("CountUsersByRole returns correct counts", func(t *testing.T) {
		s := newTestStore(t)
		u1 := createTestUser(t, s, "gh-count-1", "admin1")
		require.NoError(t, s.UpdateUserRole(ctx, u1.ID, "admin"))
		createTestUser(t, s, "gh-count-2", "viewer1")
		createTestUser(t, s, "gh-count-3", "viewer2")

		admins, editors, viewers, err := s.CountUsersByRole(ctx)
		require.NoError(t, err)
		require.Equal(t, 1, admins)
		require.Equal(t, 0, editors)
		require.Equal(t, 2, viewers)
	})

	t.Run("UpdateLastLogin sets last_login", func(t *testing.T) {
		user := createTestUser(t, store, "gh-700", "grace")
		require.NoError(t, store.UpdateLastLogin(ctx, user.ID))

		got, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, got.LastLogin)
	})
}

func TestTokenRevocation(t *testing.T) {
	store := newTestStore(t)

	t.Run("RevokeToken and IsTokenRevoked round-trip", func(t *testing.T) {
		jti := "token-abc-123"
		futureExpiry := time.Now().Add(time.Hour)

		require.NoError(t, store.RevokeToken(ctx, jti, futureExpiry))

		revoked, err := store.IsTokenRevoked(ctx, jti)
		require.NoError(t, err)
		require.True(t, revoked)
	})

	t.Run("IsTokenRevoked returns false for unknown token", func(t *testing.T) {
		revoked, err := store.IsTokenRevoked(ctx, "unknown-jti")
		require.NoError(t, err)
		require.False(t, revoked)
	})

	t.Run("CleanupExpiredTokens removes expired entries", func(t *testing.T) {
		s := newTestStore(t)
		pastExpiry := time.Now().Add(-time.Hour)
		require.NoError(t, s.RevokeToken(ctx, "expired-token", pastExpiry))

		// Also add a valid token
		futureExpiry := time.Now().Add(time.Hour)
		require.NoError(t, s.RevokeToken(ctx, "valid-token", futureExpiry))

		removed, err := s.CleanupExpiredTokens(ctx)
		require.NoError(t, err)
		require.Equal(t, int64(1), removed)

		// Expired one should be gone
		revoked, err := s.IsTokenRevoked(ctx, "expired-token")
		require.NoError(t, err)
		require.False(t, revoked)

		// Valid one should still be present
		revoked, err = s.IsTokenRevoked(ctx, "valid-token")
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
		require.NoError(t, store.CreateDashboard(ctx, dash))
		require.NotEqual(t, uuid.Nil, dash.ID)

		got, err := store.GetDashboard(ctx, dash.ID)
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
			require.NoError(t, s.CreateDashboard(ctx, &models.Dashboard{
				UserID: u.ID,
				Name:   "Dashboard",
			}))
		}

		// #6596: GetUserDashboards now requires limit/offset; 0 means default.
		dashboards, err := s.GetUserDashboards(ctx, u.ID, 0, 0)
		require.NoError(t, err)
		require.Len(t, dashboards, 3)
	})

	t.Run("GetDefaultDashboard returns the default", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-default", "defuser")

		require.NoError(t, s.CreateDashboard(ctx, &models.Dashboard{
			UserID:    u.ID,
			Name:      "Non-default",
			IsDefault: false,
		}))
		require.NoError(t, s.CreateDashboard(ctx, &models.Dashboard{
			UserID:    u.ID,
			Name:      "Default",
			IsDefault: true,
		}))

		got, err := s.GetDefaultDashboard(ctx, u.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "Default", got.Name)
	})

	t.Run("UpdateDashboard modifies fields", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-upd", "upduser")

		dash := &models.Dashboard{UserID: u.ID, Name: "Original"}
		require.NoError(t, s.CreateDashboard(ctx, dash))

		dash.Name = "Updated"
		require.NoError(t, s.UpdateDashboard(ctx, dash))

		got, err := s.GetDashboard(ctx, dash.ID)
		require.NoError(t, err)
		require.Equal(t, "Updated", got.Name)
		require.NotNil(t, got.UpdatedAt)
	})

	t.Run("DeleteDashboard removes dashboard", func(t *testing.T) {
		s := newTestStore(t)
		u := createTestUser(t, s, "gh-del", "deluser")

		dash := &models.Dashboard{UserID: u.ID, Name: "ToDelete"}
		require.NoError(t, s.CreateDashboard(ctx, dash))
		require.NoError(t, s.DeleteDashboard(ctx, dash.ID))

		got, err := s.GetDashboard(ctx, dash.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})
}

func TestCardCRUD(t *testing.T) {
	store := newTestStore(t)
	user := createTestUser(t, store, "gh-card", "carduser")
	dash := &models.Dashboard{UserID: user.ID, Name: "CardDash"}
	require.NoError(t, store.CreateDashboard(ctx, dash))

	t.Run("CreateCard and GetCard round-trip", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{X: 0, Y: 0, W: 4, H: 3},
		}
		require.NoError(t, store.CreateCard(ctx, card))
		require.NotEqual(t, uuid.Nil, card.ID)

		got, err := store.GetCard(ctx, card.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, models.CardTypeClusterHealth, got.CardType)
		require.Equal(t, 4, got.Position.W)
	})

	t.Run("GetDashboardCards returns cards for dashboard", func(t *testing.T) {
		require.NoError(t, store.CreateCard(ctx, &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypePodIssues,
			Position:    models.CardPosition{X: 4, Y: 0, W: 4, H: 3},
		}))

		cards, err := store.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(cards), 1)
	})

	t.Run("UpdateCardFocus sets summary and focus time", func(t *testing.T) {
		card := &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeEventStream,
			Position:    models.CardPosition{X: 0, Y: 3, W: 8, H: 3},
		}
		require.NoError(t, store.CreateCard(ctx, card))
		require.NoError(t, store.UpdateCardFocus(ctx, card.ID, "All healthy"))

		got, err := store.GetCard(ctx, card.ID)
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
		require.NoError(t, store.CreateCard(ctx, card))
		require.NoError(t, store.DeleteCard(ctx, card.ID))

		got, err := store.GetCard(ctx, card.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})
}

// TestCreateCardWithLimit verifies that the per-dashboard card limit is
// enforced both sequentially and under concurrent inserts. The concurrent
// sub-test is a regression guard for #6027: the previous implementation
// used a deferred BEGIN transaction which, under WAL mode, allowed two
// writers to both observe a count below the limit and both succeed.
func TestCreateCardWithLimit(t *testing.T) {
	// cardLimitTest is the per-dashboard cap used in these tests. Small
	// enough to be reachable, large enough to exercise multi-insert paths.
	const cardLimitTest = 3

	t.Run("allows inserts up to the limit and rejects the next one", func(t *testing.T) {
		store := newTestStore(t)
		user := createTestUser(t, store, "gh-limit-seq", "limitseq")
		dash := &models.Dashboard{UserID: user.ID, Name: "LimitSeq"}
		require.NoError(t, store.CreateDashboard(ctx, dash))

		for i := 0; i < cardLimitTest; i++ {
			err := store.CreateCardWithLimit(ctx, &models.Card{
				DashboardID: dash.ID,
				CardType:    models.CardTypeClusterHealth,
				Position:    models.CardPosition{X: i, Y: 0, W: 4, H: 3},
			}, cardLimitTest)
			require.NoError(t, err, "insert %d should succeed under the limit", i)
		}

		err := store.CreateCardWithLimit(ctx, &models.Card{
			DashboardID: dash.ID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{X: 0, Y: 1, W: 4, H: 3},
		}, cardLimitTest)
		require.ErrorIs(t, err, ErrDashboardCardLimitReached)

		cards, err := store.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		require.Len(t, cards, cardLimitTest)
	})

	t.Run("concurrent inserts never exceed the limit", func(t *testing.T) {
		store := newTestStore(t)
		user := createTestUser(t, store, "gh-limit-conc", "limitconc")
		dash := &models.Dashboard{UserID: user.ID, Name: "LimitConc"}
		require.NoError(t, store.CreateDashboard(ctx, dash))

		// concurrentInserters is the number of goroutines racing to insert
		// cards. Significantly larger than cardLimitTest so that most must
		// be rejected — any extra successes beyond cardLimitTest indicate
		// the TOCTOU race has returned.
		const concurrentInserters = 16

		var (
			wg              sync.WaitGroup
			successes       int64
			rejections      int64
			otherErrs       int64
			firstOtherErrMu sync.Mutex
			firstOtherErr   string
			start           = make(chan struct{})
		)

		wg.Add(concurrentInserters)
		for i := 0; i < concurrentInserters; i++ {
			i := i
			go func() {
				defer wg.Done()
				<-start
				err := store.CreateCardWithLimit(ctx, &models.Card{
					DashboardID: dash.ID,
					CardType:    models.CardTypeClusterHealth,
					Position:    models.CardPosition{X: i, Y: 0, W: 4, H: 3},
				}, cardLimitTest)
				switch {
				case err == nil:
					atomic.AddInt64(&successes, 1)
				case err == ErrDashboardCardLimitReached:
					atomic.AddInt64(&rejections, 1)
				default:
					atomic.AddInt64(&otherErrs, 1)
					firstOtherErrMu.Lock()
					if firstOtherErr == "" {
						firstOtherErr = err.Error()
					}
					firstOtherErrMu.Unlock()
				}
			}()
		}
		close(start)
		wg.Wait()

		firstOtherErrMu.Lock()
		if firstOtherErr != "" {
			t.Logf("first unexpected error: %s", firstOtherErr)
		}
		firstOtherErrMu.Unlock()
		require.Zero(t, atomic.LoadInt64(&otherErrs), "no unexpected errors")
		require.Equal(t, int64(cardLimitTest), atomic.LoadInt64(&successes),
			"exactly cardLimitTest inserts should succeed under concurrency")
		require.Equal(t, int64(concurrentInserters-cardLimitTest), atomic.LoadInt64(&rejections),
			"remaining inserts should be rejected with ErrDashboardCardLimitReached")

		cards, err := store.GetDashboardCards(ctx, dash.ID)
		require.NoError(t, err)
		require.Len(t, cards, cardLimitTest,
			"dashboard must never exceed cardLimitTest rows under concurrent writers")
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
		require.NoError(t, store.SaveOnboardingResponse(ctx, resp))

		responses, err := store.GetOnboardingResponses(ctx, user.ID)
		require.NoError(t, err)
		require.Len(t, responses, 1)
		require.Equal(t, "SRE", responses[0].Answer)
	})

	t.Run("SetUserOnboarded marks user as onboarded", func(t *testing.T) {
		require.NoError(t, store.SetUserOnboarded(ctx, user.ID))

		got, err := store.GetUser(ctx, user.ID)
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

	t.Run("getEnvDuration returns default for unset var", func(t *testing.T) {
		const defaultVal = 5 * time.Minute
		got := getEnvDuration("KC_TEST_NONEXISTENT_DURATION_XYZ", defaultVal)
		require.Equal(t, defaultVal, got)
	})

	t.Run("getEnvDuration parses valid duration", func(t *testing.T) {
		t.Setenv("KC_TEST_DURATION", "10m")
		const defaultVal = 5 * time.Minute
		got := getEnvDuration("KC_TEST_DURATION", defaultVal)
		require.Equal(t, 10*time.Minute, got)
	})

	t.Run("getEnvDuration falls back to default on invalid duration", func(t *testing.T) {
		t.Setenv("KC_TEST_DURATION_INVALID", "invalid")
		const defaultVal = 5 * time.Minute
		got := getEnvDuration("KC_TEST_DURATION_INVALID", defaultVal)
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

	t.Run("configureConnectionPool applies defaults when env vars unset", func(t *testing.T) {
		// Clear any existing env vars
		t.Setenv("KC_SQLITE_MAX_OPEN_CONNS", "")
		t.Setenv("KC_SQLITE_MAX_IDLE_CONNS", "")
		t.Setenv("KC_SQLITE_CONN_MAX_LIFETIME", "")
		t.Setenv("KC_SQLITE_CONN_MAX_IDLE_TIME", "")

		db, err := sql.Open("sqlite", ":memory:")
		require.NoError(t, err)
		defer db.Close()

		configureConnectionPool(db)

		// Verify defaults are applied
		require.Equal(t, sqliteDefaultMaxOpenConns, getEnvInt("KC_SQLITE_MAX_OPEN_CONNS", sqliteDefaultMaxOpenConns))
	})

	t.Run("configureConnectionPool validates maxOpen >= 1", func(t *testing.T) {
		t.Setenv("KC_SQLITE_MAX_OPEN_CONNS", "0")
		t.Setenv("KC_SQLITE_MAX_IDLE_CONNS", "5")
		t.Setenv("KC_SQLITE_CONN_MAX_LIFETIME", "10m")
		t.Setenv("KC_SQLITE_CONN_MAX_IDLE_TIME", "2m")

		db, err := sql.Open("sqlite", ":memory:")
		require.NoError(t, err)
		defer db.Close()

		// Should not panic and should log warning
		configureConnectionPool(db)
	})

	t.Run("configureConnectionPool validates maxIdle <= maxOpen", func(t *testing.T) {
		t.Setenv("KC_SQLITE_MAX_OPEN_CONNS", "10")
		t.Setenv("KC_SQLITE_MAX_IDLE_CONNS", "20")
		t.Setenv("KC_SQLITE_CONN_MAX_LIFETIME", "10m")
		t.Setenv("KC_SQLITE_CONN_MAX_IDLE_TIME", "2m")

		db, err := sql.Open("sqlite", ":memory:")
		require.NoError(t, err)
		defer db.Close()

		// Should not panic and should log warning
		configureConnectionPool(db)
	})

	t.Run("configureConnectionPool validates lifetime >= 30s", func(t *testing.T) {
		t.Setenv("KC_SQLITE_MAX_OPEN_CONNS", "25")
		t.Setenv("KC_SQLITE_MAX_IDLE_CONNS", "5")
		t.Setenv("KC_SQLITE_CONN_MAX_LIFETIME", "10s")
		t.Setenv("KC_SQLITE_CONN_MAX_IDLE_TIME", "2m")

		db, err := sql.Open("sqlite", ":memory:")
		require.NoError(t, err)
		defer db.Close()

		// Should not panic and should log warning
		configureConnectionPool(db)
	})
}

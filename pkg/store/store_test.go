package store

import (
	"context"
	"database/sql"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	stellarproviders "github.com/kubestellar/console/pkg/stellar/providers"
)

func OpenTestDB(t *testing.T) *SQLiteStore {
	t.Helper()

	drv, err := sqlDriver("sqlite")
	require.NoError(t, err)

	db := sql.OpenDB(&fkConnector{driver: drv, dsn: ":memory:"})
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	db.SetConnMaxIdleTime(0)

	store := &SQLiteStore{db: db}
	require.NoError(t, store.migrate())

	t.Cleanup(func() {
		require.NoError(t, store.Close())
	})

	return store
}

func TestOpenTestDBAppliesMigrations(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	require.NoError(t, store.migrate(), "migrations should be idempotent")

	tests := []struct {
		name    string
		table   string
		columns []string
	}{
		{name: "users", table: "users", columns: []string{"id", "github_id", "github_login", "role", "last_login"}},
		{name: "dashboards", table: "dashboards", columns: []string{"id", "user_id", "layout", "updated_at"}},
		{name: "revoked tokens", table: "revoked_tokens", columns: []string{"jti", "expires_at"}},
		{name: "oauth states", table: "oauth_states", columns: []string{"state", "created_at", "expires_at"}},
		{name: "stellar providers", table: "stellar_provider_configs", columns: []string{"id", "user_id", "api_key_enc", "last_tested", "updated_at"}},
		{name: "stellar memory fts", table: "stellar_memory_fts", columns: []string{"summary", "raw_content", "tags"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cols := tableColumns(t, ctx, store.db, tc.table)
			for _, col := range tc.columns {
				require.Contains(t, cols, col)
			}
		})
	}

	var indexName string
	err := store.db.QueryRowContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, "idx_stellar_provider_user_default").Scan(&indexName)
	require.NoError(t, err)
	require.Equal(t, "idx_stellar_provider_user_default", indexName)
}

func TestSQLiteAuthRoundTrip(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	t.Run("revoked tokens", func(t *testing.T) {
		tests := []struct {
			name      string
			jti       string
			expiresAt time.Time
			revoked   bool
		}{
			{name: "future token remains", jti: "token-active", expiresAt: now.Add(time.Hour), revoked: true},
			{name: "expired token cleaned", jti: "token-expired", expiresAt: now.Add(-time.Hour), revoked: false},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				require.NoError(t, store.RevokeToken(ctx, tc.jti, tc.expiresAt))

				revoked, err := store.IsTokenRevoked(ctx, tc.jti)
				require.NoError(t, err)
				require.True(t, revoked)
			})
		}

		removed, err := store.CleanupExpiredTokens(ctx)
		require.NoError(t, err)
		require.EqualValues(t, 1, removed)

		for _, tc := range tests {
			t.Run(fmt.Sprintf("post-cleanup/%s", tc.name), func(t *testing.T) {
				revoked, err := store.IsTokenRevoked(ctx, tc.jti)
				require.NoError(t, err)
				require.Equal(t, tc.revoked, revoked)
			})
		}
	})

	t.Run("oauth states", func(t *testing.T) {
		tests := []struct {
			name      string
			state     string
			ttl       time.Duration
			wantValid bool
		}{
			{name: "valid state", state: "state-valid", ttl: time.Hour, wantValid: true},
			{name: "expired state", state: "state-expired", ttl: -time.Second, wantValid: false},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				require.NoError(t, store.StoreOAuthState(ctx, tc.state, tc.ttl))

				consumed, err := store.ConsumeOAuthState(ctx, tc.state)
				require.NoError(t, err)
				require.Equal(t, tc.wantValid, consumed)

				consumedAgain, err := store.ConsumeOAuthState(ctx, tc.state)
				require.NoError(t, err)
				require.False(t, consumedAgain)
			})
		}

		require.NoError(t, store.StoreOAuthState(ctx, "state-cleanup", -time.Second))
		removed, err := store.CleanupExpiredOAuthStates(ctx)
		require.NoError(t, err)
		require.EqualValues(t, 1, removed)
	})
}

func TestSQLiteUsersRoundTrip(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	created := []*models.User{
		{
			GitHubID:    "1001",
			GitHubLogin: "Alpha",
			Email:       "alpha@example.com",
			SlackID:     "U001",
			AvatarURL:   "https://example.com/a.png",
			Role:        models.UserRoleAdmin,
		},
		{
			GitHubID:    "1002",
			GitHubLogin: "bravo",
			Email:       "bravo@example.com",
			Role:        models.UserRoleViewer,
		},
	}

	for _, user := range created {
		require.NoError(t, store.CreateUser(ctx, user))
		require.NotEqual(t, uuid.Nil, user.ID)
	}

	t.Run("lookups", func(t *testing.T) {
		byID, err := store.GetUser(ctx, created[0].ID)
		require.NoError(t, err)
		require.NotNil(t, byID)
		require.Equal(t, created[0].GitHubLogin, byID.GitHubLogin)
		require.Equal(t, created[0].Email, byID.Email)

		byGitHubID, err := store.GetUserByGitHubID(ctx, created[0].GitHubID)
		require.NoError(t, err)
		require.NotNil(t, byGitHubID)
		require.Equal(t, created[0].ID, byGitHubID.ID)

		byLogin, err := store.GetUserByGitHubLogin(ctx, strings.ToUpper(created[1].GitHubLogin))
		require.NoError(t, err)
		require.NotNil(t, byLogin)
		require.Equal(t, created[1].ID, byLogin.ID)
	})

	t.Run("update and list", func(t *testing.T) {
		created[0].GitHubLogin = "alpha-renamed"
		created[0].Email = "alpha+updated@example.com"
		created[0].SlackID = "U999"
		created[0].AvatarURL = "https://example.com/updated.png"
		created[0].Onboarded = true
		require.NoError(t, store.UpdateUser(ctx, created[0]))
		require.NoError(t, store.UpdateUserRole(ctx, created[1].ID, string(models.UserRoleEditor)))
		require.NoError(t, store.UpdateLastLogin(ctx, created[0].ID))

		updated, err := store.GetUser(ctx, created[0].ID)
		require.NoError(t, err)
		require.NotNil(t, updated)
		require.Equal(t, created[0].GitHubLogin, updated.GitHubLogin)
		require.Equal(t, created[0].Email, updated.Email)
		require.Equal(t, created[0].SlackID, updated.SlackID)
		require.True(t, updated.Onboarded)
		require.NotNil(t, updated.LastLogin)

		listed, err := store.ListUsers(ctx, 10, 0)
		require.NoError(t, err)
		require.Len(t, listed, 2)
		require.Equal(t, created[1].ID, listed[0].ID)
		require.Equal(t, created[0].ID, listed[1].ID)

		admins, editors, viewers, err := store.CountUsersByRole(ctx)
		require.NoError(t, err)
		require.Equal(t, 1, admins)
		require.Equal(t, 1, editors)
		require.Equal(t, 0, viewers)
	})

	t.Run("delete", func(t *testing.T) {
		require.NoError(t, store.DeleteUser(ctx, created[1].ID))

		deleted, err := store.GetUser(ctx, created[1].ID)
		require.NoError(t, err)
		require.Nil(t, deleted)
	})
}

func TestSQLiteDashboardsRoundTrip(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()
	user := &models.User{GitHubID: "2001", GitHubLogin: "dash-owner", Role: models.UserRoleViewer}
	require.NoError(t, store.CreateUser(ctx, user))

	dashboards := []*models.Dashboard{
		{UserID: user.ID, Name: "Primary", Layout: []byte(`{"grid":[1]}`), IsDefault: true},
		{UserID: user.ID, Name: "Secondary", Layout: []byte(`{"grid":[2]}`), IsDefault: false},
	}
	for _, dashboard := range dashboards {
		require.NoError(t, store.CreateDashboard(ctx, dashboard))
	}

	t.Run("read and list", func(t *testing.T) {
		got, err := store.GetDashboard(ctx, dashboards[0].ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, dashboards[0].Name, got.Name)
		require.JSONEq(t, string(dashboards[0].Layout), string(got.Layout))
		require.True(t, got.IsDefault)

		count, err := store.CountUserDashboards(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, 2, count)

		listed, err := store.GetUserDashboards(ctx, user.ID, 10, 0)
		require.NoError(t, err)
		require.Len(t, listed, 2)
		require.Equal(t, dashboards[0].ID, listed[0].ID)
		require.Equal(t, dashboards[1].ID, listed[1].ID)

		defaultDash, err := store.GetDefaultDashboard(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, defaultDash)
		require.Equal(t, dashboards[0].ID, defaultDash.ID)
	})

	t.Run("update and delete", func(t *testing.T) {
		dashboards[1].Name = "Secondary Updated"
		dashboards[1].Layout = []byte(`{"grid":[2,3]}`)
		dashboards[1].IsDefault = true
		require.NoError(t, store.UpdateDashboard(ctx, dashboards[1]))

		updated, err := store.GetDashboard(ctx, dashboards[1].ID)
		require.NoError(t, err)
		require.NotNil(t, updated)
		require.Equal(t, dashboards[1].Name, updated.Name)
		require.JSONEq(t, string(dashboards[1].Layout), string(updated.Layout))
		require.True(t, updated.IsDefault)
		require.NotNil(t, updated.UpdatedAt)

		require.NoError(t, store.DeleteDashboard(ctx, dashboards[0].ID))
		missing, err := store.GetDashboard(ctx, dashboards[0].ID)
		require.NoError(t, err)
		require.Nil(t, missing)
	})
}

func TestSQLiteStellarProvidersRoundTrip(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	apiKeyEnc := []byte("stored-ciphertext")
	encryptedForTest, encryptErr := stellarproviders.EncryptAPIKey("super-secret-token")
	if encryptErr == nil {
		apiKeyEnc = encryptedForTest
	}

	configs := []*StellarProviderConfig{
		{
			UserID:      "user-1",
			Provider:    "openai",
			DisplayName: "OpenAI",
			BaseURL:     "https://api.openai.com/v1",
			Model:       "gpt-4.1",
			APIKeyEnc:   apiKeyEnc,
			IsDefault:   true,
			IsActive:    true,
		},
		{
			UserID:      "user-1",
			Provider:    "anthropic",
			DisplayName: "Anthropic",
			BaseURL:     "https://api.anthropic.com",
			Model:       "claude-sonnet-4.5",
			APIKeyEnc:   apiKeyEnc,
			IsDefault:   false,
			IsActive:    true,
		},
	}

	for _, cfg := range configs {
		require.NoError(t, store.UpsertProviderConfig(ctx, cfg))
		require.NotEmpty(t, cfg.ID)
	}

	listed, err := store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, listed, 2)
	require.Equal(t, configs[0].ID, listed[0].ID)
	require.True(t, listed[0].IsDefault)
	require.Equal(t, apiKeyEnc, listed[0].APIKeyEnc)

	if encryptErr == nil {
		plaintext, err := stellarproviders.DecryptAPIKey(listed[0].APIKeyEnc)
		require.NoError(t, err)
		require.Equal(t, "super-secret-token", plaintext)
	}

	defaultCfg, err := store.GetUserDefaultProvider(ctx, "user-1")
	require.NoError(t, err)
	require.NotNil(t, defaultCfg)
	require.Equal(t, configs[0].ID, defaultCfg.ID)

	require.NoError(t, store.SetUserDefaultProvider(ctx, "user-1", configs[1].ID))
	require.NoError(t, store.UpdateProviderLatency(ctx, configs[1].ID, 187))

	listed, err = store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, listed, 2)
	for _, cfg := range listed {
		if cfg.ID != configs[1].ID {
			continue
		}
		require.True(t, cfg.IsDefault)
		require.Equal(t, 187, cfg.LastLatency)
		require.NotNil(t, cfg.LastTested)
	}

	require.NoError(t, store.DeleteProviderConfig(ctx, configs[0].ID, "user-1"))
	listed, err = store.GetUserProviderConfigs(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, configs[1].ID, listed[0].ID)
}

func tableColumns(t *testing.T, ctx context.Context, db *sql.DB, table string) []string {
	t.Helper()

	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	require.NoError(t, err)
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var (
			cid        int
			name       string
			dataType   string
			notNull    int
			defaultV   any
			primaryKey int
		)
		require.NoError(t, rows.Scan(&cid, &name, &dataType, &notNull, &defaultV, &primaryKey))
		columns = append(columns, name)
	}
	require.NoError(t, rows.Err())
	require.NotEmpty(t, columns, "expected table %s to have columns", table)
	slices.Sort(columns)
	return columns
}

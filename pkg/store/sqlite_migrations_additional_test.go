package store

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

const (
	importDashboardCardLimit = 2
	overLimitCardCount       = 2
)

func openLegacyTestStore(t *testing.T) *SQLiteStore {
	t.Helper()

	drv, err := sqlDriver("sqlite")
	require.NoError(t, err)

	db := sql.OpenDB(&fkConnector{driver: drv, dsn: ":memory:"})
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	db.SetConnMaxIdleTime(0)

	store := &SQLiteStore{db: db}
	t.Cleanup(func() {
		require.NoError(t, store.Close())
	})
	return store
}

func TestSQLiteAuthAdditionalBehaviors(t *testing.T) {
	store := OpenTestDB(t)
	expiresAt := time.Now().UTC().Add(time.Hour).Truncate(time.Second)
	laterExpiry := expiresAt.Add(time.Hour)

	require.NoError(t, store.RevokeToken(context.Background(), "duplicate-jti", expiresAt))
	require.NoError(t, store.RevokeToken(context.Background(), "duplicate-jti", laterExpiry))

	var storedExpiry time.Time
	err := store.db.QueryRowContext(context.Background(), `SELECT expires_at FROM revoked_tokens WHERE jti = ?`, "duplicate-jti").Scan(&storedExpiry)
	require.NoError(t, err)
	require.Equal(t, expiresAt, storedExpiry.UTC())

	require.NoError(t, store.StoreOAuthState(context.Background(), "nil-context-state", time.Hour))
	consumed, err := store.ConsumeOAuthState(nil, "nil-context-state")
	require.NoError(t, err)
	require.True(t, consumed)
}

func TestSQLiteDashboardTransactionFlows(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()
	user := &models.User{GitHubID: "3001", GitHubLogin: "dash-tx-user", Role: models.UserRoleViewer}
	require.NoError(t, store.CreateUser(ctx, user))

	t.Run("CreateDashboardTx commits dashboard", func(t *testing.T) {
		dashboard := &models.Dashboard{UserID: user.ID, Name: "Tx Dashboard", Layout: []byte(`{"grid":[1]}`)}

		require.NoError(t, store.WithTransaction(ctx, func(tx *sql.Tx) error {
			return store.CreateDashboardTx(ctx, tx, dashboard)
		}))

		got, err := store.GetDashboard(ctx, dashboard.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, dashboard.Name, got.Name)
	})

	t.Run("ImportDashboardAtomic rolls back on card limit", func(t *testing.T) {
		dashboard := &models.Dashboard{UserID: user.ID, Name: "Rollback Dashboard"}
		cards := []*models.Card{
			{CardType: models.CardTypeClusterHealth, Position: models.CardPosition{X: 0, Y: 0, W: 2, H: 2}},
			{CardType: models.CardTypeTopPods, Position: models.CardPosition{X: 2, Y: 0, W: 2, H: 2}},
		}

		err := store.ImportDashboardAtomic(ctx, dashboard, cards, importDashboardCardLimit-1)
		require.ErrorIs(t, err, ErrDashboardCardLimitReached)

		got, err := store.GetDashboard(ctx, dashboard.ID)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("ImportDashboardAtomic persists cards on success", func(t *testing.T) {
		dashboard := &models.Dashboard{UserID: user.ID, Name: "Imported Dashboard"}
		cards := []*models.Card{
			{CardType: models.CardTypeClusterHealth, Position: models.CardPosition{X: 0, Y: 0, W: 2, H: 2}, Config: []byte(`{"cluster":"a"}`)},
			{CardType: models.CardTypeTopPods, Position: models.CardPosition{X: 2, Y: 0, W: 2, H: 2}, Config: []byte(`{"cluster":"b"}`)},
		}

		require.NoError(t, store.ImportDashboardAtomic(ctx, dashboard, cards, importDashboardCardLimit))

		persistedCards, err := store.GetDashboardCards(ctx, dashboard.ID)
		require.NoError(t, err)
		require.Len(t, persistedCards, overLimitCardCount)
		require.Equal(t, dashboard.ID, persistedCards[0].DashboardID)
		require.JSONEq(t, string(cards[0].Config), string(persistedCards[0].Config))
	})
}

func TestSQLiteMigrationHelpers(t *testing.T) {
	t.Run("migrationLogID is deterministic", func(t *testing.T) {
		const version = 7
		const statement = "ALTER TABLE demo ADD COLUMN extra TEXT"
		first := migrationLogID(version, statement)
		second := migrationLogID(version, statement)
		require.Equal(t, first, second)
		require.Equal(t, fmt.Sprintf("v%d-", version), first[:len(fmt.Sprintf("v%d-", version))])
	})

	t.Run("ensureStellarMemoryFTS rebuilds missing rows", func(t *testing.T) {
		store := OpenTestDB(t)
		ctx := context.Background()
		memoryID := uuid.New().String()

		_, err := store.db.ExecContext(ctx, `INSERT INTO stellar_memory_entries (id, user_id, cluster, category, summary, raw_content, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			memoryID, "user-1", "cluster-a", "incident", "summary text", "details", `[]`)
		require.NoError(t, err)

		_, err = store.db.ExecContext(ctx, `DELETE FROM stellar_memory_fts`)
		require.NoError(t, err)

		require.NoError(t, store.ensureStellarMemoryFTS(ctx))

		var count int
		err = store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_memory_fts`).Scan(&count)
		require.NoError(t, err)
		require.Equal(t, 1, count)
	})

	t.Run("deduplicateBeforeUniqueIndex assigns ids as dedupe keys", func(t *testing.T) {
		store := openLegacyTestStore(t)
		ctx := context.Background()
		_, err := store.db.ExecContext(ctx, `
			CREATE TABLE stellar_notifications (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				type TEXT NOT NULL,
				severity TEXT NOT NULL DEFAULT 'info',
				title TEXT NOT NULL,
				body TEXT NOT NULL,
				cluster TEXT NOT NULL DEFAULT '',
				namespace TEXT NOT NULL DEFAULT '',
				mission_id TEXT NOT NULL DEFAULT '',
				action_id TEXT NOT NULL DEFAULT '',
				read INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				dedupe_key TEXT NOT NULL DEFAULT ''
			)
		`)
		require.NoError(t, err)
		_, err = store.db.ExecContext(ctx, `INSERT INTO stellar_notifications (id, user_id, type, title, body) VALUES ('n1', 'user-1', 'event', 'title-1', 'body-1'), ('n2', 'user-1', 'event', 'title-2', 'body-2')`)
		require.NoError(t, err)

		require.NoError(t, store.deduplicateBeforeUniqueIndex(ctx, "migration-id", "CREATE UNIQUE INDEX IF NOT EXISTS idx_stellar_notifications_user_dedupe ON stellar_notifications(user_id, dedupe_key)"))

		rows, err := store.db.QueryContext(ctx, `SELECT id, dedupe_key FROM stellar_notifications ORDER BY id`)
		require.NoError(t, err)
		defer rows.Close()

		for rows.Next() {
			var id string
			var dedupeKey string
			require.NoError(t, rows.Scan(&id, &dedupeKey))
			require.Equal(t, id, dedupeKey)
		}
		require.NoError(t, rows.Err())
	})

	t.Run("migrate upgrades pending gpu reservations to active", func(t *testing.T) {
		store := openLegacyTestStore(t)
		ctx := context.Background()
		_, err := store.db.ExecContext(ctx, `
			CREATE TABLE gpu_reservations (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				user_name TEXT NOT NULL,
				title TEXT NOT NULL,
				description TEXT DEFAULT '',
				cluster TEXT NOT NULL,
				namespace TEXT NOT NULL,
				gpu_count INTEGER NOT NULL,
				gpu_type TEXT DEFAULT '',
				start_date TEXT NOT NULL,
				duration_hours INTEGER DEFAULT 24,
				notes TEXT DEFAULT '',
				status TEXT DEFAULT 'pending',
				quota_name TEXT DEFAULT '',
				quota_enforced INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME
			)
		`)
		require.NoError(t, err)
		_, err = store.db.ExecContext(ctx, `INSERT INTO gpu_reservations (id, user_id, user_name, title, cluster, namespace, gpu_count, start_date, status) VALUES ('r1', 'user-1', 'alice', 'demo', 'cluster-a', 'ns-a', 1, '2025-01-01T00:00:00Z', 'pending')`)
		require.NoError(t, err)

		require.NoError(t, store.migrate())

		var status string
		err = store.db.QueryRowContext(ctx, `SELECT status FROM gpu_reservations WHERE id = 'r1'`).Scan(&status)
		require.NoError(t, err)
		require.Equal(t, "active", status)
	})
}

package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// fkConnector wraps a sql.Driver so that every freshly-opened connection
// executes PRAGMA foreign_keys = ON before being handed to the pool.
// DSN-level _pragma parameters are parsed by the modernc driver on each
// Open(), but connection-pool recycling can theoretically skip the DSN
// parse on reused file handles.  This connector guarantees enforcement on
// every physical connection regardless of pool lifecycle (#6905).
type fkConnector struct {
	driver driver.Driver
	dsn    string
}

func (c *fkConnector) Connect(_ context.Context) (driver.Conn, error) {
	conn, err := c.driver.Open(c.dsn)
	if err != nil {
		return nil, err
	}

	// Enable foreign-key enforcement on this specific connection.
	stmt, err := conn.Prepare("PRAGMA foreign_keys = ON")
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("prepare FK pragma: %w", err)
	}
	if _, err := stmt.Exec(nil); err != nil { //nolint:staticcheck // driver.Stmt.Exec([]driver.Value) is the v1 interface
		stmt.Close()
		conn.Close()
		return nil, fmt.Errorf("exec FK pragma: %w", err)
	}
	stmt.Close()
	return conn, nil
}

func (c *fkConnector) Driver() driver.Driver { return c.driver }

// sqlDriver returns the registered database/sql driver with the given name.
func sqlDriver(name string) (driver.Driver, error) {
	for _, d := range sql.Drivers() {
		if d == name {
			// Open a throwaway DB just to grab the driver reference.
			db, err := sql.Open(name, "")
			if err != nil {
				return nil, err
			}
			drv := db.Driver()
			db.Close()
			return drv, nil
		}
	}
	return nil, fmt.Errorf("sql driver %q not registered", name)
}

// ErrDashboardCardLimitReached is returned by CreateCardWithLimit when the
// dashboard already contains the maximum number of cards. Handlers should
// map this error to HTTP 429 Too Many Requests.
var ErrDashboardCardLimitReached = errors.New("dashboard card limit reached")

// ErrDailyBonusUnavailable is returned by ClaimDailyBonus when the user's
// last claim is within the daily-bonus cooldown window (issue #6011).
// Handlers should map this error to HTTP 429 Too Many Requests.
var ErrDailyBonusUnavailable = errors.New("daily bonus already claimed within cooldown window")

// MinCoinBalance is the floor for user coin balances. Negative increments
// are clamped to this value so buggy clients cannot drive balances below
// zero. Exported so handlers and tests can reference the same constant.
const MinCoinBalance = 0

// DefaultUserLevel is the level assigned to brand-new reward rows. Rewards
// rows are created on-demand the first time a user mutates their balance,
// so every user effectively starts at level 1.
const DefaultUserLevel = 1

// SQLite connection pool defaults
const (
	// sqliteDefaultMaxOpenConns limits concurrent database connections
	sqliteDefaultMaxOpenConns = 25
	// sqliteDefaultMaxIdleConns controls idle connection pool size
	sqliteDefaultMaxIdleConns = 5
	// sqliteDefaultConnMaxLifetime recycles connections periodically
	sqliteDefaultConnMaxLifetime = 5 * time.Minute
	// sqliteDefaultConnMaxIdleTime closes long-idle connections
	sqliteDefaultConnMaxIdleTime = 2 * time.Minute
	// sqliteMinConnLifetime is the minimum allowed connection lifetime
	// to prevent excessive connection churn
	sqliteMinConnLifetime = 30 * time.Second
	// sqliteBusyTimeoutMs is the millisecond duration that a writer will
	// wait for the SQLite write lock before returning SQLITE_BUSY. Under
	// WAL mode only one writer holds the lock at a time; this timeout
	// lets concurrent writers queue instead of failing immediately.
	// Also required for AddUserTokenDelta which uses BEGIN IMMEDIATE on a
	// pinned connection so concurrent goroutines can wait for the lock
	// rather than fail.
	sqliteBusyTimeoutMs = 5000
)

// parseUUID parses a UUID string from a DB column, logging a warning on
// malformed input before returning the zero UUID. The zero-UUID fallback is
// deliberate — the row scanners that call this helper would otherwise have
// to abort entire list queries when a single row has corrupt data, which is
// worse than serving the rest of the list with one misattributed row.
//
// #6609: callers that need a hard error (e.g. single-row lookups where a
// corrupt id means the returned value is meaningless) should use
// parseUUIDStrict instead, which returns (uuid.UUID, error) and lets the
// caller propagate the failure up to the handler layer.
func parseUUID(s string, field string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		slog.Warn("[Store] malformed UUID in database — using zero UUID", "field", field, "value", s, "error", err)
	}
	return id
}

// parseUUIDStrict parses a UUID string and returns an error on failure,
// so callers can propagate corruption instead of silently substituting the
// zero UUID. Added for #6609 — new code paths should prefer this helper;
// existing list/row scanners continue to use the logging-only parseUUID
// to keep partial-failure tolerance on bulk queries.
func parseUUIDStrict(s string, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, fmt.Errorf("malformed UUID in %s: %w", field, err)
	}
	return id, nil
}

// maxSQLLimit is the maximum allowed value for SQL LIMIT parameters.
// This provides defense-in-depth against unbounded queries from internal callers.
const maxSQLLimit = 1000

// defaultPageLimit is the default page size for list queries when the caller
// does not supply one (limit <= 0). #6598-#6602.
const defaultPageLimit = 500

// defaultAdminPageLimit is the default page size for admin list queries that
// are hit on every dashboard load (e.g. GetAllFeatureRequests). Smaller than
// defaultPageLimit because the admin UI pages through results. #6602.
const defaultAdminPageLimit = 100

// clampLimit ensures a SQL LIMIT parameter is within safe bounds (1 to maxSQLLimit).
func clampLimit(limit int) int {
	if limit < 1 {
		return 1
	}
	if limit > maxSQLLimit {
		return maxSQLLimit
	}
	return limit
}

// resolvePageLimit applies the supplied limit (falling back to fallback when
// limit <= 0) and clamps the result to maxSQLLimit. #6598-#6602.
func resolvePageLimit(limit, fallback int) int {
	if limit <= 0 {
		limit = fallback
	}
	return clampLimit(limit)
}

// resolvePageOffset clamps negative offsets to 0. #6598-#6602.
func resolvePageOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}

// getEnvInt reads an integer from the environment, falling back to defaultVal.
func getEnvInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return defaultVal
}

// getEnvDuration reads a duration from the environment, falling back to defaultVal.
func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultVal
}

// configureConnectionPool sets SQLite connection pool parameters from environment variables.
// Reads KC_SQLITE_MAX_OPEN_CONNS, KC_SQLITE_MAX_IDLE_CONNS, KC_SQLITE_CONN_MAX_LIFETIME,
// and KC_SQLITE_CONN_MAX_IDLE_TIME, validates bounds, and logs the final configuration.
func configureConnectionPool(db *sql.DB) {
	maxOpen := getEnvInt("KC_SQLITE_MAX_OPEN_CONNS", sqliteDefaultMaxOpenConns)
	maxIdle := getEnvInt("KC_SQLITE_MAX_IDLE_CONNS", sqliteDefaultMaxIdleConns)
	lifetime := getEnvDuration("KC_SQLITE_CONN_MAX_LIFETIME", sqliteDefaultConnMaxLifetime)
	idleTime := getEnvDuration("KC_SQLITE_CONN_MAX_IDLE_TIME", sqliteDefaultConnMaxIdleTime)

	// Validate and clamp maxOpen to prevent zero or negative values
	if maxOpen < 1 {
		slog.Warn("[SQLite] KC_SQLITE_MAX_OPEN_CONNS must be >= 1, using default",
			"value", maxOpen, "default", sqliteDefaultMaxOpenConns)
		maxOpen = sqliteDefaultMaxOpenConns
	}

	// Validate maxIdle <= maxOpen to prevent idle pool larger than open pool
	if maxIdle > maxOpen {
		slog.Warn("[SQLite] KC_SQLITE_MAX_IDLE_CONNS cannot exceed KC_SQLITE_MAX_OPEN_CONNS, clamping",
			"max_idle", maxIdle, "max_open", maxOpen)
		maxIdle = maxOpen
	}

	// Validate lifetime >= 30s to prevent excessive connection churn
	if lifetime < sqliteMinConnLifetime {
		slog.Warn("[SQLite] KC_SQLITE_CONN_MAX_LIFETIME must be >= 30s, using default",
			"value", lifetime, "default", sqliteDefaultConnMaxLifetime)
		lifetime = sqliteDefaultConnMaxLifetime
	}

	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(lifetime)
	db.SetConnMaxIdleTime(idleTime)

	slog.Info("[SQLite] connection pool configured",
		"max_open_conns", maxOpen,
		"max_idle_conns", maxIdle,
		"conn_max_lifetime", lifetime,
		"conn_max_idle_time", idleTime,
	)
}

// SQLiteStore implements Store using SQLite
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite store
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	// DSN notes (modernc.org/sqlite accepts PRAGMAs via _pragma=key(value)):
	//  - journal_mode=WAL enables Write-Ahead Logging so readers don't
	//    block writers.
	//  - synchronous=NORMAL is the recommended pairing with WAL for good
	//    durability without the overhead of FULL fsyncs.
	//  - busy_timeout queues contending writers instead of returning
	//    SQLITE_BUSY immediately; required for safe concurrent writes
	//    alongside db.SetMaxOpenConns > 1.
	//  - foreign_keys=on enforces FK constraints (off by default in SQLite).
	dsn := fmt.Sprintf(
		"%s?_pragma=foreign_keys(on)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(%d)",
		dbPath, sqliteBusyTimeoutMs,
	)
	// Use sql.OpenDB with a custom connector so that PRAGMA foreign_keys = ON
	// is executed on every new physical connection, not just the first one.
	// This prevents ghost-card orphans when the pool recycles connections (#6905).
	drv, err := sqlDriver("sqlite")
	if err != nil {
		return nil, fmt.Errorf("sqlite driver lookup: %w", err)
	}
	db := sql.OpenDB(&fkConnector{driver: drv, dsn: dsn})

	// Configure connection pool for resource management under high load
	configureConnectionPool(db)

	store := &SQLiteStore{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}

	return store, nil
}

// migrate creates the database schema
func (s *SQLiteStore) migrate() error {
	ctx := context.Background()
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		github_id TEXT UNIQUE NOT NULL,
		github_login TEXT NOT NULL,
		email TEXT,
		slack_id TEXT,
		avatar_url TEXT,
		role TEXT DEFAULT 'viewer',
		onboarded INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_login DATETIME
	);

	CREATE TABLE IF NOT EXISTS onboarding_responses (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		question_key TEXT NOT NULL,
		answer TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, question_key)
	);

	CREATE TABLE IF NOT EXISTS dashboards (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		layout TEXT,
		is_default INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS cards (
		id TEXT PRIMARY KEY,
		dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
		card_type TEXT NOT NULL,
		config TEXT,
		position TEXT NOT NULL,
		last_summary TEXT,
		last_focus DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS card_history (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		original_card_id TEXT,
		card_type TEXT NOT NULL,
		config TEXT,
		swapped_out_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		reason TEXT
	);

	CREATE TABLE IF NOT EXISTS user_events (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		event_type TEXT NOT NULL,
		card_id TEXT,
		metadata TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS pending_swaps (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
		new_card_type TEXT NOT NULL,
		new_card_config TEXT,
		reason TEXT,
		swap_at DATETIME NOT NULL,
		status TEXT DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_dashboards_user ON dashboards(user_id);
	CREATE INDEX IF NOT EXISTS idx_cards_dashboard ON cards(dashboard_id);
	CREATE INDEX IF NOT EXISTS idx_events_user_time ON user_events(user_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_card_history_user ON card_history(user_id, swapped_out_at DESC);
	CREATE INDEX IF NOT EXISTS idx_pending_swaps_due ON pending_swaps(status, swap_at);
	CREATE INDEX IF NOT EXISTS idx_pending_swaps_user ON pending_swaps(user_id);

	-- Feature requests from users (bugs/features submitted via console)
	CREATE TABLE IF NOT EXISTS feature_requests (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		request_type TEXT NOT NULL,
		target_repo TEXT NOT NULL DEFAULT 'console',
		github_issue_number INTEGER,
		-- NOTE: github_issue_url was removed (#7735) — it was never
		-- populated or read by any INSERT/SELECT/UPDATE query.  The
		-- handler's QueueItem.GitHubIssueURL is populated from the
		-- live GitHub API, not from this table.
		status TEXT DEFAULT 'submitted',
		pr_number INTEGER,
		pr_url TEXT,
		copilot_session_url TEXT,
		netlify_preview_url TEXT,
		latest_comment TEXT,
		closed_by_user INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);

	-- PR feedback from users (thumbs up/down on AI-generated fixes)
	CREATE TABLE IF NOT EXISTS pr_feedback (
		id TEXT PRIMARY KEY,
		feature_request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		feedback_type TEXT NOT NULL,
		comment TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- User notifications for feature request status updates
	CREATE TABLE IF NOT EXISTS notifications (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		feature_request_id TEXT REFERENCES feature_requests(id) ON DELETE CASCADE,
		notification_type TEXT NOT NULL,
		title TEXT NOT NULL,
		message TEXT NOT NULL,
		read INTEGER DEFAULT 0,
		action_url TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_feature_requests_user ON feature_requests(user_id);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_issue ON feature_requests(github_issue_number);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_pr ON feature_requests(pr_number);
	CREATE INDEX IF NOT EXISTS idx_pr_feedback_request ON pr_feedback(feature_request_id);
	CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

	-- GPU reservations
	CREATE TABLE IF NOT EXISTS gpu_reservations (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		user_name TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT DEFAULT '',
		cluster TEXT NOT NULL,
		namespace TEXT NOT NULL,
		gpu_count INTEGER NOT NULL,
		gpu_type TEXT DEFAULT '',
		-- Multi-type: JSON-encoded []string of acceptable GPU types. Empty
		-- string means "no preference" (any type); a one-element list is
		-- equivalent to the legacy single-type behaviour. The legacy
		-- gpu_type column is kept alongside and mirrors gpu_types[0].
		gpu_types TEXT NOT NULL DEFAULT '',
		start_date TEXT NOT NULL,
		duration_hours INTEGER DEFAULT 24,
		notes TEXT DEFAULT '',
		status TEXT DEFAULT 'pending',
		quota_name TEXT DEFAULT '',
		quota_enforced INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_gpu_reservations_user ON gpu_reservations(user_id);
	CREATE INDEX IF NOT EXISTS idx_gpu_reservations_status ON gpu_reservations(status);

	-- GPU utilization snapshots (hourly measurements per reservation)
	CREATE TABLE IF NOT EXISTS gpu_utilization_snapshots (
		id TEXT PRIMARY KEY,
		reservation_id TEXT NOT NULL,
		timestamp DATETIME NOT NULL,
		gpu_utilization_pct REAL NOT NULL,
		memory_utilization_pct REAL NOT NULL,
		active_gpu_count INTEGER NOT NULL,
		total_gpu_count INTEGER NOT NULL,
		FOREIGN KEY (reservation_id) REFERENCES gpu_reservations(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_utilization_reservation ON gpu_utilization_snapshots(reservation_id, timestamp);

	-- Revoked JWT tokens (persisted across server restarts)
	CREATE TABLE IF NOT EXISTS revoked_tokens (
		jti TEXT PRIMARY KEY,
		expires_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

	-- User rewards persistence (issue #6011): coin/point/level/bonus balances
	-- survive browser cache clears, private windows and device switches. The
	-- canonical store is server-side; the frontend treats localStorage as a
	-- loading-bridge cache only.
	CREATE TABLE IF NOT EXISTS user_rewards (
		user_id TEXT PRIMARY KEY,
		coins INTEGER NOT NULL DEFAULT 0,
		points INTEGER NOT NULL DEFAULT 0,
		level INTEGER NOT NULL DEFAULT 1,
		bonus_points INTEGER NOT NULL DEFAULT 0,
		last_daily_bonus_at DATETIME,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_user_rewards_updated ON user_rewards(updated_at);

	-- User token-usage persistence (follow-up to issue #6011, folds the
	-- #6020 token-usage state into the same PR). Mirrors the rewards table
	-- layout: the server is authoritative, localStorage is a fast cache
	-- only. tokens_by_category holds the per-category breakdown as JSON so
	-- new categories do not require a schema migration. last_agent_session
	-- is the most recent kc-agent session marker the server has observed
	-- for this user — a change signals an agent restart and the server
	-- rebases totals instead of accumulating the stale delta.
	CREATE TABLE IF NOT EXISTS user_token_usage (
		user_id TEXT PRIMARY KEY,
		total_tokens INTEGER NOT NULL DEFAULT 0,
		tokens_by_category TEXT NOT NULL DEFAULT '{}',
		last_agent_session_id TEXT NOT NULL DEFAULT '',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_user_token_usage_updated ON user_token_usage(updated_at);

	-- OAuth state tokens (persisted so in-flight OAuth flows survive a
	-- backend restart between /auth/login and /auth/callback — see issue #6028).
	-- Time columns use DATETIME to match the rest of the schema
	-- (revoked_tokens, user_rewards, etc.) and avoid driver-quirk surprises.
	CREATE TABLE IF NOT EXISTS oauth_states (
		state TEXT PRIMARY KEY,
		created_at DATETIME NOT NULL,
		expires_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

	CREATE TABLE IF NOT EXISTS cluster_groups (
		name TEXT PRIMARY KEY,
		data BLOB NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Audit log for security-sensitive operations (#8670 Phase 3).
	-- Entries are append-only; the detail column holds a JSON blob with
	-- action-specific context (target type, target ID, IP, path, etc.).
	CREATE TABLE IF NOT EXISTS audit_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TEXT NOT NULL,
		user_id TEXT NOT NULL,
		action TEXT NOT NULL,
		detail TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_audit_log_user_time ON audit_log(user_id, timestamp);

	-- Cross-cluster event journal (#9967 Phase 1)
	CREATE TABLE IF NOT EXISTS cluster_events (
		id TEXT PRIMARY KEY,
		cluster_name TEXT NOT NULL,
		namespace TEXT NOT NULL DEFAULT '',
		event_type TEXT NOT NULL,
		reason TEXT NOT NULL,
		message TEXT,
		involved_object_kind TEXT,
		involved_object_name TEXT,
		event_uid TEXT NOT NULL UNIQUE,
		event_count INTEGER DEFAULT 1,
		first_seen DATETIME NOT NULL,
		last_seen DATETIME NOT NULL,
		recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_ce_cluster_time ON cluster_events(cluster_name, last_seen DESC);
	CREATE INDEX IF NOT EXISTS idx_ce_uid ON cluster_events(event_uid);

	-- OAuth credentials persisted by the GitHub App Manifest one-click flow.
	-- Single-row table (CHECK constraint) so only one app registration exists.
	CREATE TABLE IF NOT EXISTS oauth_credentials (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		client_id TEXT NOT NULL,
		client_secret TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := s.db.ExecContext(ctx, schema)
	if err != nil {
		return err
	}

	// Run column migrations for existing databases
	migrations := []string{
		"ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'",
		"ALTER TABLE users ADD COLUMN slack_id TEXT",
		"ALTER TABLE feature_requests ADD COLUMN closed_by_user INTEGER DEFAULT 0",
		// #6284: UpdateFeatureRequestLatestComment writes to this column
		// but it was never added to CREATE TABLE or migrations.
		"ALTER TABLE feature_requests ADD COLUMN latest_comment TEXT",
		// #6949: ActionURL was declared in the Notification model but never
		// persisted — the column, INSERT, and SELECT all omitted it.
		"ALTER TABLE notifications ADD COLUMN action_url TEXT NOT NULL DEFAULT ''",
		// Multi-type GPU reservations. gpu_types is a JSON-encoded
		// []string of acceptable GPU types. The legacy gpu_type column is
		// still populated (mirrors gpu_types[0]) so pre-migration clients
		// continue to read meaningful values, and pre-migration rows are
		// transparently promoted to a one-element list on read.
		"ALTER TABLE gpu_reservations ADD COLUMN gpu_types TEXT NOT NULL DEFAULT ''",
		// target_repo was declared in the FeatureRequest model but never
		// persisted — the column, INSERT, and SELECT all omitted it, causing
		// webhook/close/update operations to route docs issues to the wrong repo.
		"ALTER TABLE feature_requests ADD COLUMN target_repo TEXT NOT NULL DEFAULT 'console'",
	}
	for i, migration := range migrations {
		if _, err := s.db.ExecContext(ctx, migration); err != nil {
			// #6291 / #6614: distinguish "column already exists"
			// (expected, idempotent) from other errors (DB locked,
			// read-only, corrupt, typo in the DDL). The former is how
			// we get idempotent migrations; the latter used to only
			// log a warning and let the server keep booting against a
			// partially-migrated schema, which would silently 500 on
			// any query that touched the missing column. Real errors
			// now surface and abort startup so an operator can fix
			// the underlying problem before serving traffic.
			if strings.Contains(err.Error(), "duplicate column name") {
				slog.Debug("[SQLite] migration already applied",
					"migration", migration, "version", i+1)
				continue
			}
			slog.Error("[SQLite] migration failed — refusing to start",
				"migration", migration, "version", i+1, "error", err)
			return fmt.Errorf("migration %d %q failed: %w", i+1, migration, err)
		}
		slog.Debug("[SQLite] migration applied", "migration", migration, "version", i+1)
	}
	slog.Info("[SQLite] schema migrations complete", "total_migrations", len(migrations))

	return nil
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// Shared helper functions

// Helper functions

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// rollbackTimeout bounds the time a best-effort ROLLBACK is allowed to run on
// a pinned connection. Must be long enough for SQLite to release its write
// lock but short enough to avoid holding the pool when the pool is itself
// shutting down.
const rollbackTimeout = 5 * time.Second

// rollbackConn executes ROLLBACK against a pinned connection using a fresh
// bounded context. Use this from defers in BEGIN IMMEDIATE flows instead of
// ExecContext(ctx, "ROLLBACK"): if the caller's ctx is already cancelled
// (client disconnect, request timeout), a rollback on that ctx fails
// immediately and leaves the transaction zombified on the connection (#8854).
func rollbackConn(conn *sql.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), rollbackTimeout)
	defer cancel()
	_, _ = conn.ExecContext(ctx, "ROLLBACK")
}

package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // registers the "sqlite" driver

	"github.com/kubestellar/console/pkg/models"
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
	db.SetMaxOpenConns(getEnvInt("KC_SQLITE_MAX_OPEN_CONNS", sqliteDefaultMaxOpenConns))
	db.SetMaxIdleConns(getEnvInt("KC_SQLITE_MAX_IDLE_CONNS", sqliteDefaultMaxIdleConns))
	db.SetConnMaxLifetime(sqliteDefaultConnMaxLifetime)
	db.SetConnMaxIdleTime(sqliteDefaultConnMaxIdleTime)

	store := &SQLiteStore{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}

	return store, nil
}

// migrate creates the database schema
func (s *SQLiteStore) migrate() error {
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

	-- Feature requests from users (bugs/features submitted via console)
	CREATE TABLE IF NOT EXISTS feature_requests (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		request_type TEXT NOT NULL,
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
	`
	_, err := s.db.Exec(schema)
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
	}
	for i, migration := range migrations {
		if _, err := s.db.Exec(migration); err != nil {
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

// User methods

func (s *SQLiteStore) GetUser(id uuid.UUID) (*models.User, error) {
	row := s.db.QueryRow(`SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users WHERE id = ?`, id.String())
	return s.scanUser(row)
}

func (s *SQLiteStore) GetUserByGitHubID(githubID string) (*models.User, error) {
	row := s.db.QueryRow(`SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users WHERE github_id = ?`, githubID)
	return s.scanUser(row)
}

func (s *SQLiteStore) scanUser(row *sql.Row) (*models.User, error) {
	var u models.User
	var idStr string
	var onboarded int
	var email, slackID, avatar, role sql.NullString
	var lastLogin sql.NullTime

	err := row.Scan(&idStr, &u.GitHubID, &u.GitHubLogin, &email, &slackID, &avatar, &role, &onboarded, &u.CreatedAt, &lastLogin)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	u.ID = parseUUID(idStr, "user.ID")
	u.Onboarded = onboarded == 1
	if email.Valid {
		u.Email = email.String
	}
	if slackID.Valid {
		u.SlackID = slackID.String
	}
	if avatar.Valid {
		u.AvatarURL = avatar.String
	}
	if role.Valid {
		u.Role = models.UserRole(role.String)
	} else {
		u.Role = models.UserRoleViewer // default role
	}
	if lastLogin.Valid {
		u.LastLogin = &lastLogin.Time
	}
	return &u, nil
}

func (s *SQLiteStore) CreateUser(user *models.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	user.CreatedAt = time.Now()
	if user.Role == "" {
		user.Role = models.UserRoleViewer // default role
	}

	_, err := s.db.Exec(`INSERT INTO users (id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		user.ID.String(), user.GitHubID, user.GitHubLogin, nullString(user.Email), nullString(user.SlackID), nullString(user.AvatarURL), user.Role, boolToInt(user.Onboarded), user.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateUser(user *models.User) error {
	_, err := s.db.Exec(`UPDATE users SET github_login = ?, email = ?, slack_id = ?, avatar_url = ?, role = ?, onboarded = ? WHERE id = ?`,
		user.GitHubLogin, nullString(user.Email), nullString(user.SlackID), nullString(user.AvatarURL), user.Role, boolToInt(user.Onboarded), user.ID.String())
	return err
}

func (s *SQLiteStore) UpdateLastLogin(userID uuid.UUID) error {
	_, err := s.db.Exec(`UPDATE users SET last_login = ? WHERE id = ?`, time.Now(), userID.String())
	return err
}

// ListUsers returns a page of users ordered newest first.
// #6595: limit/offset are required to prevent an unbounded full-table scan.
// Pass 0 for limit to use the store default (defaultPageLimit). The secondary
// ORDER BY id DESC is a stable tie-breaker for rows with identical created_at
// timestamps so pagination is deterministic across calls.
func (s *SQLiteStore) ListUsers(limit, offset int) ([]models.User, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.Query(`SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		var idStr string
		var onboarded int
		var email, slackID, avatar, role sql.NullString
		var lastLogin sql.NullTime

		if err := rows.Scan(&idStr, &u.GitHubID, &u.GitHubLogin, &email, &slackID, &avatar, &role, &onboarded, &u.CreatedAt, &lastLogin); err != nil {
			return nil, err
		}

		u.ID = parseUUID(idStr, "u.ID")
		u.Onboarded = onboarded == 1
		if email.Valid {
			u.Email = email.String
		}
		if slackID.Valid {
			u.SlackID = slackID.String
		}
		if avatar.Valid {
			u.AvatarURL = avatar.String
		}
		if role.Valid {
			u.Role = models.UserRole(role.String)
		} else {
			u.Role = models.UserRoleViewer
		}
		if lastLogin.Valid {
			u.LastLogin = &lastLogin.Time
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// DeleteUser removes a user by ID
func (s *SQLiteStore) DeleteUser(id uuid.UUID) error {
	_, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, id.String())
	return err
}

// validUserRoles is the set of allowed role values for user accounts.
var validUserRoles = map[string]bool{
	"admin":  true,
	"editor": true,
	"viewer": true,
}

// UpdateUserRole updates only the user's role after validating it against
// the allowed set (admin, editor, viewer).
func (s *SQLiteStore) UpdateUserRole(userID uuid.UUID, role string) error {
	if !validUserRoles[role] {
		return fmt.Errorf("invalid role %q: must be one of admin, editor, viewer", role)
	}
	_, err := s.db.Exec(`UPDATE users SET role = ? WHERE id = ?`, role, userID.String())
	return err
}

// CountUsersByRole returns the count of users by role.
//
// #6607: previously the default switch branch lumped every unrecognized role
// (including empty strings from pre-migration rows, or any typo in the DB)
// into the "viewers" bucket, so a corrupted row could silently inflate the
// viewer count and nothing would alert an operator. We now only count rows
// whose role matches the allowlist ("admin", "editor", "viewer") and log a
// warning for anything else so corruption is surfaced instead of hidden.
func (s *SQLiteStore) CountUsersByRole() (admins, editors, viewers int, err error) {
	rows, err := s.db.Query(`SELECT role, COUNT(*) FROM users GROUP BY role`)
	if err != nil {
		return 0, 0, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return 0, 0, 0, err
		}
		switch role {
		case "admin":
			admins = count
		case "editor":
			editors = count
		case "viewer", "":
			// Treat NULL/empty as "viewer" — that is the documented default
			// applied by the users.role column default and scanUser fallback.
			viewers += count
		default:
			slog.Warn("[Store] CountUsersByRole: unknown role in users table — excluded from counts",
				"role", role, "count", count)
		}
	}
	return admins, editors, viewers, rows.Err()
}

// Onboarding methods

// SaveOnboardingResponse upserts a single onboarding answer for (user_id,
// question_key). #6606: the previous implementation used INSERT OR REPLACE,
// which under SQLite is a delete-then-insert that bumps the autoincrement
// sequence and fires DELETE triggers — effectively renaming the row's
// identity on every save. We now use ON CONFLICT (user_id, question_key)
// DO UPDATE so repeated saves keep the same row id and never trip any
// ON DELETE cascade wired up against onboarding_responses.
func (s *SQLiteStore) SaveOnboardingResponse(response *models.OnboardingResponse) error {
	if response.ID == uuid.Nil {
		response.ID = uuid.New()
	}
	response.CreatedAt = time.Now()

	_, err := s.db.Exec(
		`INSERT INTO onboarding_responses (id, user_id, question_key, answer, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, question_key) DO UPDATE SET
		   answer = excluded.answer,
		   created_at = excluded.created_at`,
		response.ID.String(), response.UserID.String(), response.QuestionKey, response.Answer, response.CreatedAt)
	return err
}

func (s *SQLiteStore) GetOnboardingResponses(userID uuid.UUID) ([]models.OnboardingResponse, error) {
	rows, err := s.db.Query(`SELECT id, user_id, question_key, answer, created_at FROM onboarding_responses WHERE user_id = ?`, userID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var responses []models.OnboardingResponse
	for rows.Next() {
		var r models.OnboardingResponse
		var idStr, userIDStr string
		if err := rows.Scan(&idStr, &userIDStr, &r.QuestionKey, &r.Answer, &r.CreatedAt); err != nil {
			return nil, err
		}
		r.ID = parseUUID(idStr, "r.ID")
		r.UserID = parseUUID(userIDStr, "r.UserID")
		responses = append(responses, r)
	}
	return responses, rows.Err()
}

func (s *SQLiteStore) SetUserOnboarded(userID uuid.UUID) error {
	_, err := s.db.Exec(`UPDATE users SET onboarded = 1 WHERE id = ?`, userID.String())
	return err
}

// Dashboard methods

func (s *SQLiteStore) GetDashboard(id uuid.UUID) (*models.Dashboard, error) {
	row := s.db.QueryRow(`SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE id = ?`, id.String())
	return s.scanDashboard(row)
}

// CountUserDashboards returns the total number of dashboards owned by a user.
// Used to enforce the per-user dashboard limit (#7010).
func (s *SQLiteStore) CountUserDashboards(userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM dashboards WHERE user_id = ?`, userID.String()).Scan(&count)
	return count, err
}

// GetUserDashboards returns a page of a user's dashboards, default dashboard
// first, then oldest-first within each group.
// #6596: limit/offset are required to prevent an unbounded per-user read if a
// user ever accumulates a pathological number of dashboards. Pass 0 for limit
// to use the store default. ORDER BY includes an id ASC tie-breaker so rows
// that share created_at paginate deterministically.
func (s *SQLiteStore) GetUserDashboards(userID uuid.UUID, limit, offset int) ([]models.Dashboard, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.Query(`SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE user_id = ? ORDER BY is_default DESC, created_at ASC, id ASC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dashboards []models.Dashboard
	for rows.Next() {
		d, err := s.scanDashboardRow(rows)
		if err != nil {
			return nil, err
		}
		dashboards = append(dashboards, *d)
	}
	return dashboards, rows.Err()
}

func (s *SQLiteStore) GetDefaultDashboard(userID uuid.UUID) (*models.Dashboard, error) {
	row := s.db.QueryRow(`SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE user_id = ? AND is_default = 1`, userID.String())
	return s.scanDashboard(row)
}

func (s *SQLiteStore) scanDashboard(row *sql.Row) (*models.Dashboard, error) {
	var d models.Dashboard
	var idStr, userIDStr string
	var layout sql.NullString
	var isDefault int
	var updatedAt sql.NullTime

	err := row.Scan(&idStr, &userIDStr, &d.Name, &layout, &isDefault, &d.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	d.ID = parseUUID(idStr, "d.ID")
	d.UserID = parseUUID(userIDStr, "d.UserID")
	d.IsDefault = isDefault == 1
	if layout.Valid {
		d.Layout = json.RawMessage(layout.String)
	}
	if updatedAt.Valid {
		d.UpdatedAt = &updatedAt.Time
	}
	return &d, nil
}

func (s *SQLiteStore) scanDashboardRow(rows *sql.Rows) (*models.Dashboard, error) {
	var d models.Dashboard
	var idStr, userIDStr string
	var layout sql.NullString
	var isDefault int
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &d.Name, &layout, &isDefault, &d.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	d.ID = parseUUID(idStr, "d.ID")
	d.UserID = parseUUID(userIDStr, "d.UserID")
	d.IsDefault = isDefault == 1
	if layout.Valid {
		d.Layout = json.RawMessage(layout.String)
	}
	if updatedAt.Valid {
		d.UpdatedAt = &updatedAt.Time
	}
	return &d, nil
}

func (s *SQLiteStore) CreateDashboard(dashboard *models.Dashboard) error {
	if dashboard.ID == uuid.Nil {
		dashboard.ID = uuid.New()
	}
	dashboard.CreatedAt = time.Now()

	var layoutStr *string
	if dashboard.Layout != nil {
		str := string(dashboard.Layout)
		layoutStr = &str
	}

	_, err := s.db.Exec(`INSERT INTO dashboards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		dashboard.ID.String(), dashboard.UserID.String(), dashboard.Name, layoutStr, boolToInt(dashboard.IsDefault), dashboard.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateDashboard(dashboard *models.Dashboard) error {
	now := time.Now()
	dashboard.UpdatedAt = &now

	var layoutStr *string
	if dashboard.Layout != nil {
		str := string(dashboard.Layout)
		layoutStr = &str
	}

	_, err := s.db.Exec(`UPDATE dashboards SET name = ?, layout = ?, is_default = ?, updated_at = ? WHERE id = ?`,
		dashboard.Name, layoutStr, boolToInt(dashboard.IsDefault), dashboard.UpdatedAt, dashboard.ID.String())
	return err
}

func (s *SQLiteStore) DeleteDashboard(id uuid.UUID) error {
	_, err := s.db.Exec(`DELETE FROM dashboards WHERE id = ?`, id.String())
	return err
}

// Card methods

func (s *SQLiteStore) GetCard(id uuid.UUID) (*models.Card, error) {
	row := s.db.QueryRow(`SELECT id, dashboard_id, card_type, config, position, last_summary, last_focus, created_at FROM cards WHERE id = ?`, id.String())
	return s.scanCard(row)
}

// maxDashboardCards is the upper bound on cards returned per dashboard (#7733).
const maxDashboardCards = 500

func (s *SQLiteStore) GetDashboardCards(dashboardID uuid.UUID) ([]models.Card, error) {
	rows, err := s.db.Query(`SELECT id, dashboard_id, card_type, config, position, last_summary, last_focus, created_at FROM cards WHERE dashboard_id = ? ORDER BY created_at LIMIT ?`, dashboardID.String(), maxDashboardCards)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []models.Card
	for rows.Next() {
		c, err := s.scanCardRow(rows)
		if err != nil {
			return nil, err
		}
		cards = append(cards, *c)
	}
	return cards, rows.Err()
}

func (s *SQLiteStore) scanCard(row *sql.Row) (*models.Card, error) {
	var c models.Card
	var idStr, dashboardIDStr, positionStr string
	var config, lastSummary sql.NullString
	var lastFocus sql.NullTime
	var cardType string

	err := row.Scan(&idStr, &dashboardIDStr, &cardType, &config, &positionStr, &lastSummary, &lastFocus, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	c.ID = parseUUID(idStr, "c.ID")
	c.DashboardID = parseUUID(dashboardIDStr, "c.DashboardID")
	c.CardType = models.CardType(cardType)
	if config.Valid {
		c.Config = json.RawMessage(config.String)
	}
	if err := json.Unmarshal([]byte(positionStr), &c.Position); err != nil {
		// Log only that the position was corrupt — omit raw content to prevent information disclosure
		slog.Warn("[Store] corrupt card position data — card will use zero position", "cardID", idStr)
	}
	if lastSummary.Valid {
		c.LastSummary = lastSummary.String
	}
	if lastFocus.Valid {
		c.LastFocus = &lastFocus.Time
	}
	return &c, nil
}

func (s *SQLiteStore) scanCardRow(rows *sql.Rows) (*models.Card, error) {
	var c models.Card
	var idStr, dashboardIDStr, positionStr string
	var config, lastSummary sql.NullString
	var lastFocus sql.NullTime
	var cardType string

	err := rows.Scan(&idStr, &dashboardIDStr, &cardType, &config, &positionStr, &lastSummary, &lastFocus, &c.CreatedAt)
	if err != nil {
		return nil, err
	}

	c.ID = parseUUID(idStr, "c.ID")
	c.DashboardID = parseUUID(dashboardIDStr, "c.DashboardID")
	c.CardType = models.CardType(cardType)
	if config.Valid {
		c.Config = json.RawMessage(config.String)
	}
	if err := json.Unmarshal([]byte(positionStr), &c.Position); err != nil {
		// Log only that the position was corrupt — omit raw content to prevent information disclosure
		slog.Warn("[Store] corrupt card position data — card will use zero position", "cardID", idStr)
	}
	if lastSummary.Valid {
		c.LastSummary = lastSummary.String
	}
	if lastFocus.Valid {
		c.LastFocus = &lastFocus.Time
	}
	return &c, nil
}

func (s *SQLiteStore) CreateCard(card *models.Card) error {
	if card.ID == uuid.Nil {
		card.ID = uuid.New()
	}
	card.CreatedAt = time.Now()

	positionJSON, err := json.Marshal(card.Position)
	if err != nil {
		return fmt.Errorf("failed to marshal card position: %w", err)
	}
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	_, err = s.db.Exec(`INSERT INTO cards (id, dashboard_id, card_type, config, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		card.ID.String(), card.DashboardID.String(), string(card.CardType), configStr, string(positionJSON), card.CreatedAt)
	return err
}

// CreateCardWithLimit atomically enforces a per-dashboard card limit and
// inserts the card in a single SQL statement. This closes the TOCTOU race
// (#6010) where two concurrent CreateCard handlers could both read a count
// of maxCards-1 and both succeed inserting, pushing the dashboard above
// the limit.
//
// The previous implementation used db.Begin() (a deferred transaction),
// which under SQLite's WAL journal mode does not acquire the write lock
// until the first write statement runs. That left a window where two
// transactions on separate connections could both run SELECT COUNT(*),
// both observe a count below maxCards, and both proceed to INSERT — the
// second write would simply wait for the first to commit and then succeed,
// silently bypassing the limit.
//
// The fix is to make the count check and the insert a single atomic
// statement: INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < ?. SQLite
// evaluates the subquery while holding the write lock for the INSERT, so
// no other writer can add a row in between the count and the insert.
// Returns ErrDashboardCardLimitReached when the dashboard is already at
// or above maxCards.
func (s *SQLiteStore) CreateCardWithLimit(card *models.Card, maxCards int) error {
	if card.ID == uuid.Nil {
		card.ID = uuid.New()
	}
	card.CreatedAt = time.Now()

	positionJSON, err := json.Marshal(card.Position)
	if err != nil {
		return fmt.Errorf("failed to marshal card position: %w", err)
	}
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	// Conditional insert: the row is inserted only when the current count
	// for this dashboard is strictly less than maxCards. Because this is a
	// single statement, SQLite's per-database write lock serializes the
	// count+insert atomically across connections under WAL mode.
	result, err := s.db.Exec(
		`INSERT INTO cards (id, dashboard_id, card_type, config, position, created_at)
		 SELECT ?, ?, ?, ?, ?, ?
		 WHERE (SELECT COUNT(*) FROM cards WHERE dashboard_id = ?) < ?`,
		card.ID.String(), card.DashboardID.String(), string(card.CardType), configStr, string(positionJSON), card.CreatedAt,
		card.DashboardID.String(), maxCards,
	)
	if err != nil {
		return fmt.Errorf("failed to insert card: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to read rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrDashboardCardLimitReached
	}
	return nil
}

// UpdateCard updates a card row. #6610: previously the driver result was
// discarded, so a no-op update against a missing card id returned nil and
// handlers treated that as success. We now check RowsAffected and return
// sql.ErrNoRows when the card id is not present, so callers can surface a
// 404 instead of silently accepting a write that never happened.
func (s *SQLiteStore) UpdateCard(card *models.Card) error {
	positionJSON, err := json.Marshal(card.Position)
	if err != nil {
		return fmt.Errorf("failed to marshal card position: %w", err)
	}
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	res, err := s.db.Exec(`UPDATE cards SET card_type = ?, config = ?, position = ? WHERE id = ?`,
		string(card.CardType), configStr, string(positionJSON), card.ID.String())
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to read rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *SQLiteStore) DeleteCard(id uuid.UUID) error {
	_, err := s.db.Exec(`DELETE FROM cards WHERE id = ?`, id.String())
	return err
}

func (s *SQLiteStore) UpdateCardFocus(cardID uuid.UUID, summary string) error {
	_, err := s.db.Exec(`UPDATE cards SET last_focus = ?, last_summary = ? WHERE id = ?`, time.Now(), summary, cardID.String())
	return err
}

// Card History methods

func (s *SQLiteStore) AddCardHistory(history *models.CardHistory) error {
	if history.ID == uuid.Nil {
		history.ID = uuid.New()
	}
	history.SwappedOutAt = time.Now()

	var origCardID *string
	if history.OriginalCardID != nil {
		str := history.OriginalCardID.String()
		origCardID = &str
	}
	var configStr *string
	if history.Config != nil {
		str := string(history.Config)
		configStr = &str
	}

	_, err := s.db.Exec(`INSERT INTO card_history (id, user_id, original_card_id, card_type, config, swapped_out_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		history.ID.String(), history.UserID.String(), origCardID, string(history.CardType), configStr, history.SwappedOutAt, history.Reason)
	return err
}

func (s *SQLiteStore) GetUserCardHistory(userID uuid.UUID, limit int) ([]models.CardHistory, error) {
	limit = clampLimit(limit)
	rows, err := s.db.Query(`SELECT id, user_id, original_card_id, card_type, config, swapped_out_at, reason FROM card_history WHERE user_id = ? ORDER BY swapped_out_at DESC LIMIT ?`, userID.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []models.CardHistory
	for rows.Next() {
		var h models.CardHistory
		var idStr, userIDStr string
		var origCardID, config, reason sql.NullString
		var cardType string

		if err := rows.Scan(&idStr, &userIDStr, &origCardID, &cardType, &config, &h.SwappedOutAt, &reason); err != nil {
			return nil, err
		}

		h.ID = parseUUID(idStr, "h.ID")
		h.UserID = parseUUID(userIDStr, "h.UserID")
		h.CardType = models.CardType(cardType)
		if origCardID.Valid {
			id := parseUUID(origCardID.String, "id")
			h.OriginalCardID = &id
		}
		if config.Valid {
			h.Config = json.RawMessage(config.String)
		}
		if reason.Valid {
			h.Reason = reason.String
		}
		history = append(history, h)
	}
	return history, rows.Err()
}

// Pending Swap methods

func (s *SQLiteStore) GetPendingSwap(id uuid.UUID) (*models.PendingSwap, error) {
	row := s.db.QueryRow(`SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE id = ?`, id.String())
	return s.scanPendingSwap(row)
}

// GetUserPendingSwaps returns a page of a user's pending swaps, oldest
// swap_at first.
// #6597: limit/offset are required so a user with a large backlog of pending
// swaps cannot force an unbounded read. Pass 0 for limit to use the store
// default. ORDER BY includes an id ASC tie-breaker so rows that share
// swap_at paginate deterministically.
func (s *SQLiteStore) GetUserPendingSwaps(userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.Query(`SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE user_id = ? AND status = 'pending' ORDER BY swap_at ASC, id ASC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var swaps []models.PendingSwap
	for rows.Next() {
		swap, err := s.scanPendingSwapRow(rows)
		if err != nil {
			return nil, err
		}
		swaps = append(swaps, *swap)
	}
	return swaps, rows.Err()
}

// GetDueSwaps returns pending swaps whose swap_at has arrived, ordered by
// swap_at ascending so the oldest due swaps are processed first.
// #6598: LIMIT/OFFSET prevent OOM when a scheduler outage leaves a large
// backlog. Callers that need to drain the full backlog must page.
func (s *SQLiteStore) GetDueSwaps(limit, offset int) ([]models.PendingSwap, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	// #6621: id ASC tie-breaker ensures pages are stable when multiple swaps
	// share the same swap_at (common after batch scheduling). Without it,
	// OFFSET paging could skip or duplicate rows as SQLite picks arbitrary
	// tie-break order between calls.
	rows, err := s.db.Query(`SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE status = 'pending' AND swap_at <= ? ORDER BY swap_at ASC, id ASC LIMIT ? OFFSET ?`, time.Now(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var swaps []models.PendingSwap
	for rows.Next() {
		swap, err := s.scanPendingSwapRow(rows)
		if err != nil {
			return nil, err
		}
		swaps = append(swaps, *swap)
	}
	return swaps, rows.Err()
}

func (s *SQLiteStore) scanPendingSwap(row *sql.Row) (*models.PendingSwap, error) {
	var swap models.PendingSwap
	var idStr, userIDStr, cardIDStr, newCardType, status string
	var config, reason sql.NullString

	err := row.Scan(&idStr, &userIDStr, &cardIDStr, &newCardType, &config, &reason, &swap.SwapAt, &status, &swap.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	swap.ID = parseUUID(idStr, "swap.ID")
	swap.UserID = parseUUID(userIDStr, "swap.UserID")
	swap.CardID = parseUUID(cardIDStr, "swap.CardID")
	swap.NewCardType = models.CardType(newCardType)
	swap.Status = models.SwapStatus(status)
	if config.Valid {
		swap.NewCardConfig = json.RawMessage(config.String)
	}
	if reason.Valid {
		swap.Reason = reason.String
	}
	return &swap, nil
}

func (s *SQLiteStore) scanPendingSwapRow(rows *sql.Rows) (*models.PendingSwap, error) {
	var swap models.PendingSwap
	var idStr, userIDStr, cardIDStr, newCardType, status string
	var config, reason sql.NullString

	err := rows.Scan(&idStr, &userIDStr, &cardIDStr, &newCardType, &config, &reason, &swap.SwapAt, &status, &swap.CreatedAt)
	if err != nil {
		return nil, err
	}

	swap.ID = parseUUID(idStr, "swap.ID")
	swap.UserID = parseUUID(userIDStr, "swap.UserID")
	swap.CardID = parseUUID(cardIDStr, "swap.CardID")
	swap.NewCardType = models.CardType(newCardType)
	swap.Status = models.SwapStatus(status)
	if config.Valid {
		swap.NewCardConfig = json.RawMessage(config.String)
	}
	if reason.Valid {
		swap.Reason = reason.String
	}
	return &swap, nil
}

func (s *SQLiteStore) CreatePendingSwap(swap *models.PendingSwap) error {
	if swap.ID == uuid.Nil {
		swap.ID = uuid.New()
	}
	swap.CreatedAt = time.Now()
	if swap.Status == "" {
		swap.Status = models.SwapStatusPending
	}

	var configStr *string
	if swap.NewCardConfig != nil {
		str := string(swap.NewCardConfig)
		configStr = &str
	}

	_, err := s.db.Exec(`INSERT INTO pending_swaps (id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		swap.ID.String(), swap.UserID.String(), swap.CardID.String(), string(swap.NewCardType), configStr, swap.Reason, swap.SwapAt, string(swap.Status), swap.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateSwapStatus(id uuid.UUID, status models.SwapStatus) error {
	_, err := s.db.Exec(`UPDATE pending_swaps SET status = ? WHERE id = ?`, string(status), id.String())
	return err
}

func (s *SQLiteStore) SnoozeSwap(id uuid.UUID, newSwapAt time.Time) error {
	_, err := s.db.Exec(`UPDATE pending_swaps SET swap_at = ?, status = ? WHERE id = ?`, newSwapAt, string(models.SwapStatusSnoozed), id.String())
	return err
}

// User Event methods

func (s *SQLiteStore) RecordEvent(event *models.UserEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	event.CreatedAt = time.Now()

	var cardID *string
	if event.CardID != nil {
		str := event.CardID.String()
		cardID = &str
	}
	var metadataStr *string
	if event.Metadata != nil {
		str := string(event.Metadata)
		metadataStr = &str
	}

	_, err := s.db.Exec(`INSERT INTO user_events (id, user_id, event_type, card_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		event.ID.String(), event.UserID.String(), string(event.EventType), cardID, metadataStr, event.CreatedAt)
	return err
}

// GetRecentEvents returns a user's events within the given window, newest first.
// #6599: LIMIT/OFFSET bound the read so a chatty client cannot force an
// unbounded scan of user_events.
func (s *SQLiteStore) GetRecentEvents(userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error) {
	cutoff := time.Now().Add(-since)
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	// #6621: id DESC tie-breaker ensures pages are stable when many events
	// share the same created_at (common when clients burst-record events in
	// the same millisecond). Without it, OFFSET paging could skip rows.
	rows, err := s.db.Query(`SELECT id, user_id, event_type, card_id, metadata, created_at FROM user_events WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, userID.String(), cutoff, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.UserEvent
	for rows.Next() {
		var e models.UserEvent
		var idStr, userIDStr string
		var eventType string
		var cardID, metadata sql.NullString

		if err := rows.Scan(&idStr, &userIDStr, &eventType, &cardID, &metadata, &e.CreatedAt); err != nil {
			return nil, err
		}

		e.ID = parseUUID(idStr, "e.ID")
		e.UserID = parseUUID(userIDStr, "e.UserID")
		e.EventType = models.EventType(eventType)
		if cardID.Valid {
			id := parseUUID(cardID.String, "id")
			e.CardID = &id
		}
		if metadata.Valid {
			e.Metadata = json.RawMessage(metadata.String)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// Feature Request methods

func (s *SQLiteStore) CreateFeatureRequest(request *models.FeatureRequest) error {
	if request.ID == uuid.Nil {
		request.ID = uuid.New()
	}
	request.CreatedAt = time.Now()
	if request.Status == "" {
		request.Status = models.RequestStatusOpen
	}

	_, err := s.db.Exec(`INSERT INTO feature_requests (id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		request.ID.String(), request.UserID.String(), request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, string(request.Status),
		request.PRNumber, nullString(request.PRURL), nullString(request.CopilotSessionURL), nullString(request.NetlifyPreviewURL), request.CreatedAt)
	return err
}

func (s *SQLiteStore) GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE id = ?`, id.String())
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE github_issue_number = ?`, issueNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE pr_number = ?`, prNumber)
	return s.scanFeatureRequest(row)
}

// GetUserFeatureRequests returns a page of a user's feature requests,
// newest first.
// #6601: LIMIT/OFFSET prevent unbounded per-user reads.
// #6621: id DESC tie-breaker ensures OFFSET paging is stable when rows share
// created_at (e.g. seeded data, bulk imports).
func (s *SQLiteStore) GetUserFeatureRequests(userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.FeatureRequest
	for rows.Next() {
		r, err := s.scanFeatureRequestRow(rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, *r)
	}
	return requests, rows.Err()
}

// GetAllFeatureRequests returns a single page of feature_requests, newest
// first. Callers that need to walk the full table must page by passing
// successive offsets; this function never returns more than `limit` rows
// (clamped to maxSQLLimit) and applies the admin default when limit <= 0.
// #6602: LIMIT/OFFSET required. The admin dashboard hits this on every load,
// so the default page size (defaultAdminPageLimit) is intentionally smaller
// than the generic defaultPageLimit.
// #6621: id DESC tie-breaker ensures OFFSET paging is stable when rows share
// created_at (e.g. seeded data, bulk imports).
func (s *SQLiteStore) GetAllFeatureRequests(limit, offset int) ([]models.FeatureRequest, error) {
	lim := resolvePageLimit(limit, defaultAdminPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.FeatureRequest
	for rows.Next() {
		r, err := s.scanFeatureRequestRow(rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, *r)
	}
	return requests, rows.Err()
}

func (s *SQLiteStore) scanFeatureRequest(row *sql.Row) (*models.FeatureRequest, error) {
	var r models.FeatureRequest
	var idStr, userIDStr string
	var requestType, status string
	var issueNumber, prNumber sql.NullInt64
	var prURL, copilotSessionURL, previewURL, latestComment sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := row.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &latestComment, &r.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if prNumber.Valid {
		num := int(prNumber.Int64)
		r.PRNumber = &num
	}
	if prURL.Valid {
		r.PRURL = prURL.String
	}
	if copilotSessionURL.Valid {
		r.CopilotSessionURL = copilotSessionURL.String
	}
	if previewURL.Valid {
		r.NetlifyPreviewURL = previewURL.String
	}
	if closedByUser.Valid {
		r.ClosedByUser = closedByUser.Int64 == 1
	}
	if latestComment.Valid {
		r.LatestComment = latestComment.String
	}
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	return &r, nil
}

func (s *SQLiteStore) scanFeatureRequestRow(rows *sql.Rows) (*models.FeatureRequest, error) {
	var r models.FeatureRequest
	var idStr, userIDStr string
	var requestType, status string
	var issueNumber, prNumber sql.NullInt64
	var prURL, copilotSessionURL, previewURL, latestComment sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &latestComment, &r.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if prNumber.Valid {
		num := int(prNumber.Int64)
		r.PRNumber = &num
	}
	if prURL.Valid {
		r.PRURL = prURL.String
	}
	if copilotSessionURL.Valid {
		r.CopilotSessionURL = copilotSessionURL.String
	}
	if previewURL.Valid {
		r.NetlifyPreviewURL = previewURL.String
	}
	if closedByUser.Valid {
		r.ClosedByUser = closedByUser.Int64 == 1
	}
	if latestComment.Valid {
		r.LatestComment = latestComment.String
	}
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	return &r, nil
}

func (s *SQLiteStore) UpdateFeatureRequest(request *models.FeatureRequest) error {
	now := time.Now()
	request.UpdatedAt = &now

	_, err := s.db.Exec(`UPDATE feature_requests SET title = ?, description = ?, request_type = ?, github_issue_number = ?, status = ?, pr_number = ?, pr_url = ?, copilot_session_url = ?, netlify_preview_url = ?, updated_at = ? WHERE id = ?`,
		request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, string(request.Status),
		request.PRNumber, nullString(request.PRURL), nullString(request.CopilotSessionURL), nullString(request.NetlifyPreviewURL),
		request.UpdatedAt, request.ID.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestStatus(id uuid.UUID, status models.RequestStatus) error {
	now := time.Now()
	_, err := s.db.Exec(`UPDATE feature_requests SET status = ?, updated_at = ? WHERE id = ?`, string(status), now, id.String())
	return err
}

func (s *SQLiteStore) CloseFeatureRequest(id uuid.UUID, closedByUser bool) error {
	now := time.Now()
	closedByUserInt := 0
	if closedByUser {
		closedByUserInt = 1
	}
	_, err := s.db.Exec(`UPDATE feature_requests SET status = ?, closed_by_user = ?, updated_at = ? WHERE id = ?`,
		string(models.RequestStatusClosed), closedByUserInt, now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestPR(id uuid.UUID, prNumber int, prURL string) error {
	now := time.Now()
	_, err := s.db.Exec(`UPDATE feature_requests SET pr_number = ?, pr_url = ?, status = ?, updated_at = ? WHERE id = ?`,
		prNumber, prURL, string(models.RequestStatusFixReady), now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestPreview(id uuid.UUID, previewURL string) error {
	now := time.Now()
	_, err := s.db.Exec(`UPDATE feature_requests SET netlify_preview_url = ?, updated_at = ? WHERE id = ?`,
		previewURL, now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestLatestComment(id uuid.UUID, comment string) error {
	now := time.Now()
	_, err := s.db.Exec(`UPDATE feature_requests SET latest_comment = ?, updated_at = ? WHERE id = ?`,
		comment, now, id.String())
	return err
}

// PR Feedback methods

func (s *SQLiteStore) CreatePRFeedback(feedback *models.PRFeedback) error {
	if feedback.ID == uuid.Nil {
		feedback.ID = uuid.New()
	}
	feedback.CreatedAt = time.Now()

	_, err := s.db.Exec(`INSERT INTO pr_feedback (id, feature_request_id, user_id, feedback_type, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		feedback.ID.String(), feedback.FeatureRequestID.String(), feedback.UserID.String(),
		string(feedback.FeedbackType), nullString(feedback.Comment), feedback.CreatedAt)
	return err
}

// prFeedbackMaxRows caps how many rows GetPRFeedback will return in a single
// call. PR feedback is usually a handful of entries per feature request, so
// 500 is generous; the cap is defense-in-depth against an unbounded scan if
// a bug ever let one feature_request_id accumulate thousands of rows (#6603).
const prFeedbackMaxRows = 500

func (s *SQLiteStore) GetPRFeedback(featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	// #6603: bound the result set — the previous query had no LIMIT, so a
	// single feature request could return an arbitrarily large slice and
	// starve the caller's memory. No handler has ever passed offset/limit
	// so we cap internally at prFeedbackMaxRows; if future callers need
	// pagination they should add an explicit limit/offset signature.
	rows, err := s.db.Query(`SELECT id, feature_request_id, user_id, feedback_type, comment, created_at FROM pr_feedback WHERE feature_request_id = ? ORDER BY created_at DESC LIMIT ?`, featureRequestID.String(), prFeedbackMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feedbacks []models.PRFeedback
	for rows.Next() {
		var f models.PRFeedback
		var idStr, requestIDStr, userIDStr string
		var feedbackType string
		var comment sql.NullString

		if err := rows.Scan(&idStr, &requestIDStr, &userIDStr, &feedbackType, &comment, &f.CreatedAt); err != nil {
			return nil, err
		}

		f.ID = parseUUID(idStr, "f.ID")
		f.FeatureRequestID = parseUUID(requestIDStr, "f.FeatureRequestID")
		f.UserID = parseUUID(userIDStr, "f.UserID")
		f.FeedbackType = models.FeedbackType(feedbackType)
		if comment.Valid {
			f.Comment = comment.String
		}
		feedbacks = append(feedbacks, f)
	}
	return feedbacks, rows.Err()
}

// Notification methods

func (s *SQLiteStore) CreateNotification(notification *models.Notification) error {
	if notification.ID == uuid.Nil {
		notification.ID = uuid.New()
	}
	notification.CreatedAt = time.Now()

	var featureRequestID *string
	if notification.FeatureRequestID != nil {
		str := notification.FeatureRequestID.String()
		featureRequestID = &str
	}

	_, err := s.db.Exec(`INSERT INTO notifications (id, user_id, feature_request_id, notification_type, title, message, read, action_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		notification.ID.String(), notification.UserID.String(), featureRequestID,
		string(notification.NotificationType), notification.Title, notification.Message,
		boolToInt(notification.Read), notification.ActionURL, notification.CreatedAt)
	return err
}

func (s *SQLiteStore) GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error) {
	// #6286: clamp the limit to safe bounds before passing to SQL.
	// SQLite treats negative LIMIT as "no limit", which would let a
	// caller bypass resource controls and return arbitrarily large
	// result sets. Match the card_history query's hardening.
	limit = clampLimit(limit)
	rows, err := s.db.Query(`SELECT id, user_id, feature_request_id, notification_type, title, message, read, action_url, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, userID.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		var idStr, userIDStr string
		var featureRequestID sql.NullString
		var notificationType string
		var read int

		if err := rows.Scan(&idStr, &userIDStr, &featureRequestID, &notificationType, &n.Title, &n.Message, &read, &n.ActionURL, &n.CreatedAt); err != nil {
			return nil, err
		}

		n.ID = parseUUID(idStr, "n.ID")
		n.UserID = parseUUID(userIDStr, "n.UserID")
		n.NotificationType = models.NotificationType(notificationType)
		n.Read = read == 1
		if featureRequestID.Valid {
			id := parseUUID(featureRequestID.String, "id")
			n.FeatureRequestID = &id
		}
		notifications = append(notifications, n)
	}
	return notifications, rows.Err()
}

func (s *SQLiteStore) GetUnreadNotificationCount(userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0`, userID.String()).Scan(&count)
	return count, err
}

// MarkNotificationRead is intentionally removed from the public Store
// interface. #6611: the unscoped "UPDATE notifications SET read = 1 WHERE
// id = ?" let any authenticated user mark any other user's notification as
// read, which is a privilege-escalation class bug. All callers now go
// through MarkNotificationReadByUser, which ownership-checks the row in
// the same UPDATE. The method is kept here as a private helper only for
// back-compat with existing admin/background code paths that have already
// resolved ownership; regular handlers MUST use MarkNotificationReadByUser.
func (s *SQLiteStore) MarkNotificationRead(id uuid.UUID) error {
	_, err := s.db.Exec(`UPDATE notifications SET read = 1 WHERE id = ?`, id.String())
	return err
}

// MarkNotificationReadByUser marks a single notification as read, but only if it
// belongs to the given user. Returns an error wrapping "not found" when the
// notification does not exist or is not owned by the caller.
func (s *SQLiteStore) MarkNotificationReadByUser(id uuid.UUID, userID uuid.UUID) error {
	res, err := s.db.Exec(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, id.String(), userID.String())
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("notification not found or not owned by user")
	}
	return nil
}

func (s *SQLiteStore) MarkAllNotificationsRead(userID uuid.UUID) error {
	_, err := s.db.Exec(`UPDATE notifications SET read = 1 WHERE user_id = ?`, userID.String())
	return err
}

// GPU Reservation methods

// encodeGPUTypes serializes the multi-type preference list into the JSON
// form persisted in the gpu_reservations.gpu_types column (gpu-multitype). An
// empty or nil list becomes an empty string, which is what the schema
// default emits for pre-migration rows — this keeps the round trip
// idempotent and lets a NULL/empty column decode back to "no preference".
func encodeGPUTypes(types []string) string {
	if len(types) == 0 {
		return ""
	}
	b, err := json.Marshal(types)
	if err != nil {
		// Marshaling a []string cannot realistically fail, but if it
		// does we fall back to an empty encoding rather than
		// corrupting the row. The legacy gpu_type column still
		// carries the primary type as a safety net.
		return ""
	}
	return string(b)
}

// decodeGPUTypes is the inverse of encodeGPUTypes. Empty/whitespace/
// non-JSON values decode to nil so callers can rely on
// NormalizeGPUTypes to promote the legacy gpu_type column into a
// single-element list on read.
func decodeGPUTypes(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(trimmed), &out); err != nil {
		return nil
	}
	return out
}

func (s *SQLiteStore) CreateGPUReservation(reservation *models.GPUReservation) error {
	if reservation.ID == uuid.Nil {
		reservation.ID = uuid.New()
	}
	reservation.CreatedAt = time.Now()
	if reservation.Status == "" {
		reservation.Status = models.ReservationStatusPending
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	_, err := s.db.Exec(`INSERT INTO gpu_reservations (id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		reservation.ID.String(), reservation.UserID.String(), reservation.UserName,
		reservation.Title, reservation.Description, reservation.Cluster, reservation.Namespace,
		reservation.GPUCount, reservation.GPUType, gpuTypesEncoded, reservation.StartDate, reservation.DurationHours,
		reservation.Notes, string(reservation.Status), reservation.QuotaName,
		boolToInt(reservation.QuotaEnforced), reservation.CreatedAt)
	return err
}

// ErrGPUQuotaExceeded is returned by CreateGPUReservationWithCapacity when
// the atomic capacity check fails — either the combined
// active+pending reservation count is already at or above capacity, or the
// caller's requested gpu_count would push it over. Handlers should map this
// error to HTTP 409 Conflict.
var ErrGPUQuotaExceeded = errors.New("gpu cluster capacity exceeded")

// ErrGPUReservationNotFound is returned when an update targets a
// reservation ID that does not exist, so callers can return HTTP 404.
var ErrGPUReservationNotFound = errors.New("gpu reservation not found")

// CreateGPUReservationWithCapacity atomically enforces a cluster GPU
// capacity cap and inserts the reservation in a single SQL statement.
//
// #6612: the previous flow was a two-step "SELECT SUM then INSERT", which
// under WAL mode lets two concurrent creates both observe the same stale
// reserved total, both proceed to insert, and push the cluster above its
// declared capacity. This method mirrors the CreateCardWithLimit pattern:
// INSERT ... SELECT ... WHERE (SELECT SUM(...) FROM ...) + ? <= capacity,
// so SQLite evaluates the check and the insert under a single write lock
// and a second concurrent insert cannot observe a pre-insert tally.
//
// If capacity <= 0 the function behaves identically to CreateGPUReservation
// (capacity checks skipped — matches the existing handler semantics when
// no capacity provider is configured).
//
// Returns ErrGPUQuotaExceeded when the insert is rejected by the WHERE
// clause, so handlers can distinguish "over-allocated" from other errors.
func (s *SQLiteStore) CreateGPUReservationWithCapacity(reservation *models.GPUReservation, capacity int) error {
	if reservation.ID == uuid.Nil {
		reservation.ID = uuid.New()
	}
	reservation.CreatedAt = time.Now()
	if reservation.Status == "" {
		reservation.Status = models.ReservationStatusPending
	}
	if capacity <= 0 {
		// No capacity cap — fall through to the unchecked insert. Matches
		// the existing ClusterCapacityProvider==nil handler behaviour.
		return s.CreateGPUReservation(reservation)
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	result, err := s.db.Exec(
		`INSERT INTO gpu_reservations (id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at)
		 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		 WHERE (COALESCE((SELECT SUM(gpu_count) FROM gpu_reservations WHERE cluster = ? AND status IN ('active', 'pending')), 0) + ?) <= ?`,
		reservation.ID.String(), reservation.UserID.String(), reservation.UserName,
		reservation.Title, reservation.Description, reservation.Cluster, reservation.Namespace,
		reservation.GPUCount, reservation.GPUType, gpuTypesEncoded, reservation.StartDate, reservation.DurationHours,
		reservation.Notes, string(reservation.Status), reservation.QuotaName,
		boolToInt(reservation.QuotaEnforced), reservation.CreatedAt,
		reservation.Cluster, reservation.GPUCount, capacity,
	)
	if err != nil {
		return fmt.Errorf("insert gpu reservation: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read rows affected: %w", err)
	}
	if rows == 0 {
		return ErrGPUQuotaExceeded
	}
	return nil
}

func (s *SQLiteStore) GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error) {
	row := s.db.QueryRow(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE id = ?`, id.String())
	return s.scanGPUReservation(row)
}

// gpuReservationsMaxRows is the defense-in-depth cap applied to the GPU
// reservation list queries (#6604). The UI only ever renders a small number
// of reservations per user/admin view, so 5000 is already well beyond any
// realistic production workload — the cap only exists so a corrupted table
// or a forgotten cleanup cron cannot return an unbounded slice.
const gpuReservationsMaxRows = 5000

func (s *SQLiteStore) ListGPUReservations() ([]models.GPUReservation, error) {
	// #6604: bound the result set. The UI has no expectation of seeing
	// more than a few hundred reservations at once; if an operator ever
	// needs a full dump they can query the DB directly.
	rows, err := s.db.Query(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations ORDER BY start_date DESC LIMIT ?`, gpuReservationsMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}

func (s *SQLiteStore) ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error) {
	// #6604: same defense-in-depth LIMIT as ListGPUReservations.
	rows, err := s.db.Query(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE user_id = ? ORDER BY start_date DESC LIMIT ?`, userID.String(), gpuReservationsMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}

func (s *SQLiteStore) UpdateGPUReservation(reservation *models.GPUReservation) error {
	now := time.Now()
	reservation.UpdatedAt = &now
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	_, err := s.db.Exec(`UPDATE gpu_reservations SET user_name = ?, title = ?, description = ?, cluster = ?, namespace = ?, gpu_count = ?, gpu_type = ?, gpu_types = ?, start_date = ?, duration_hours = ?, notes = ?, status = ?, quota_name = ?, quota_enforced = ?, updated_at = ? WHERE id = ?`,
		reservation.UserName, reservation.Title, reservation.Description,
		reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.GPUType, gpuTypesEncoded,
		reservation.StartDate, reservation.DurationHours, reservation.Notes,
		string(reservation.Status), reservation.QuotaName, boolToInt(reservation.QuotaEnforced),
		reservation.UpdatedAt, reservation.ID.String())
	return err
}

// UpdateGPUReservationWithCapacity atomically enforces a cluster GPU capacity
// cap when updating a reservation (#6957). The WHERE clause ensures the update
// only succeeds if the cluster's total reserved GPUs (excluding this
// reservation) plus the new count stays within the given capacity.
// Returns ErrGPUQuotaExceeded when the capacity check fails.
func (s *SQLiteStore) UpdateGPUReservationWithCapacity(reservation *models.GPUReservation, capacity int) error {
	now := time.Now()
	reservation.UpdatedAt = &now

	if capacity <= 0 {
		return s.UpdateGPUReservation(reservation)
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	result, err := s.db.Exec(
		`UPDATE gpu_reservations
		 SET user_name = ?, title = ?, description = ?, cluster = ?, namespace = ?,
		     gpu_count = ?, gpu_type = ?, gpu_types = ?, start_date = ?, duration_hours = ?,
		     notes = ?, status = ?, quota_name = ?, quota_enforced = ?, updated_at = ?
		 WHERE id = ?
		   AND (COALESCE((SELECT SUM(gpu_count) FROM gpu_reservations
		                   WHERE cluster = ? AND status IN ('active', 'pending') AND id != ?), 0) + ?) <= ?`,
		reservation.UserName, reservation.Title, reservation.Description,
		reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.GPUType, gpuTypesEncoded,
		reservation.StartDate, reservation.DurationHours, reservation.Notes,
		string(reservation.Status), reservation.QuotaName, boolToInt(reservation.QuotaEnforced),
		reservation.UpdatedAt, reservation.ID.String(),
		reservation.Cluster, reservation.ID.String(), reservation.GPUCount, capacity,
	)
	if err != nil {
		return fmt.Errorf("update gpu reservation: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read rows affected: %w", err)
	}
	if rows == 0 {
		// Distinguish "row not found" from "capacity exceeded": if the
		// reservation does not exist at all, return ErrGPUReservationNotFound
		// so the caller can map it to HTTP 404 instead of 409.
		var exists int
		if err := s.db.QueryRow(`SELECT 1 FROM gpu_reservations WHERE id = ?`, reservation.ID.String()).Scan(&exists); err != nil {
			return ErrGPUReservationNotFound
		}
		return ErrGPUQuotaExceeded
	}
	return nil
}

func (s *SQLiteStore) DeleteGPUReservation(id uuid.UUID) error {
	_, err := s.db.Exec(`DELETE FROM gpu_reservations WHERE id = ?`, id.String())
	return err
}

// GetGPUReservationsByIDs fetches multiple reservations in a single batched
// query, avoiding N+1 round-trips for ownership verification (#6963).
func (s *SQLiteStore) GetGPUReservationsByIDs(ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error) {
	result := make(map[uuid.UUID]*models.GPUReservation, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	// Batch in chunks to respect SQLite variable limits.
	for start := 0; start < len(ids); start += sqliteMaxVars {
		end := start + sqliteMaxVars
		if end > len(ids) {
			end = len(ids)
		}
		chunk := ids[start:end]

		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]

		args := make([]interface{}, len(chunk))
		for i, id := range chunk {
			args[i] = id.String()
		}

		rows, err := s.db.Query(
			fmt.Sprintf(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE id IN (%s)`, placeholders),
			args...,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			r, err := s.scanGPUReservationRow(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			result[r.ID] = r
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// GetClusterReservedGPUCount returns the total GPU count for active/pending reservations on a cluster.
// If excludeID is provided, that reservation is excluded (useful for updates).
func (s *SQLiteStore) GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error) {
	var total int
	var err error
	if excludeID != nil {
		err = s.db.QueryRow(
			`SELECT COALESCE(SUM(gpu_count), 0) FROM gpu_reservations WHERE cluster = ? AND status IN ('active', 'pending') AND id != ?`,
			cluster, excludeID.String(),
		).Scan(&total)
	} else {
		err = s.db.QueryRow(
			`SELECT COALESCE(SUM(gpu_count), 0) FROM gpu_reservations WHERE cluster = ? AND status IN ('active', 'pending')`,
			cluster,
		).Scan(&total)
	}
	return total, err
}

func (s *SQLiteStore) scanGPUReservation(row *sql.Row) (*models.GPUReservation, error) {
	var r models.GPUReservation
	var idStr, userIDStr, status string
	var quotaEnforced int
	var updatedAt sql.NullTime
	var gpuTypesRaw string

	err := row.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &gpuTypesRaw, &r.StartDate,
		&r.DurationHours, &r.Notes, &status, &r.QuotaName, &quotaEnforced,
		&r.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.Status = models.ReservationStatus(status)
	r.QuotaEnforced = quotaEnforced == 1
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	// Decode multi-type list and promote legacy single-type
	// reservations to a one-element list so callers always see a
	// populated GPUTypes slice.
	r.GPUTypes = decodeGPUTypes(gpuTypesRaw)
	r.NormalizeGPUTypes()
	return &r, nil
}

func (s *SQLiteStore) scanGPUReservationRow(rows *sql.Rows) (*models.GPUReservation, error) {
	var r models.GPUReservation
	var idStr, userIDStr, status string
	var quotaEnforced int
	var updatedAt sql.NullTime
	var gpuTypesRaw string

	err := rows.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &gpuTypesRaw, &r.StartDate,
		&r.DurationHours, &r.Notes, &status, &r.QuotaName, &quotaEnforced,
		&r.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.Status = models.ReservationStatus(status)
	r.QuotaEnforced = quotaEnforced == 1
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	// See scanGPUReservation — same normalization logic.
	r.GPUTypes = decodeGPUTypes(gpuTypesRaw)
	r.NormalizeGPUTypes()
	return &r, nil
}

// --- GPU Utilization Snapshots ---

// InsertUtilizationSnapshot writes a single GPU utilization sample. #6608:
// previously this blindly passed snapshot.ID through to the INSERT, so a
// caller that forgot to populate the id (or a future call path that fed us
// a zero-value snapshot) would end up inserting an empty-string primary
// key, collide on the next insert, and silently drop data. We now generate
// a UUID defensively when the caller left ID blank so the row is always
// written with a unique primary key.
func (s *SQLiteStore) InsertUtilizationSnapshot(snapshot *models.GPUUtilizationSnapshot) error {
	if snapshot.ID == "" {
		snapshot.ID = uuid.New().String()
	}
	if snapshot.Timestamp.IsZero() {
		snapshot.Timestamp = time.Now()
	}
	_, err := s.db.Exec(
		`INSERT INTO gpu_utilization_snapshots (id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		snapshot.ID, snapshot.ReservationID, snapshot.Timestamp,
		snapshot.GPUUtilizationPct, snapshot.MemoryUtilizationPct,
		snapshot.ActiveGPUCount, snapshot.TotalGPUCount,
	)
	return err
}

func (s *SQLiteStore) GetUtilizationSnapshots(reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error) {
	if limit <= 0 {
		limit = DefaultSnapshotQueryLimit
	}
	rows, err := s.db.Query(
		`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count FROM gpu_utilization_snapshots WHERE reservation_id = ? ORDER BY timestamp DESC LIMIT ?`,
		reservationID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snapshots []models.GPUUtilizationSnapshot
	for rows.Next() {
		var snap models.GPUUtilizationSnapshot
		if err := rows.Scan(&snap.ID, &snap.ReservationID, &snap.Timestamp,
			&snap.GPUUtilizationPct, &snap.MemoryUtilizationPct,
			&snap.ActiveGPUCount, &snap.TotalGPUCount); err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snap)
	}
	return snapshots, rows.Err()
}

// DefaultSnapshotQueryLimit caps the number of rows returned by
// GetUtilizationSnapshots to prevent unbounded result sets for
// long-lived reservations (#6965). Configurable via the limit parameter.
const DefaultSnapshotQueryLimit = 500

// sqliteMaxVars is the maximum number of bind variables per SQL statement.
// SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 999; we use 500 as a safe
// batch size to stay well under that limit (#6888).
const sqliteMaxVars = 500

// bulkUtilizationMaxRowsPerReservation caps the number of snapshot rows
// returned per reservation in a single GetBulkUtilizationSnapshots call.
// Each reservation typically has hours to days of hourly snapshots, so 500
// per reservation is well beyond any realistic view (#6964).
const bulkUtilizationMaxRowsPerReservation = 500

func (s *SQLiteStore) GetBulkUtilizationSnapshots(reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error) {
	result := make(map[string][]models.GPUUtilizationSnapshot)
	if len(reservationIDs) == 0 {
		return result, nil
	}

	// #6888: batch the IN clause to respect SQLite's variable limit.
	// Instead of rejecting requests with > sqliteMaxVars IDs, we chunk
	// the input and merge results across batches.
	for start := 0; start < len(reservationIDs); start += sqliteMaxVars {
		end := start + sqliteMaxVars
		if end > len(reservationIDs) {
			end = len(reservationIDs)
		}
		chunk := reservationIDs[start:end]

		if err := s.queryUtilizationChunk(chunk, result); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// queryUtilizationChunk executes a single batched query for a chunk of
// reservation IDs and merges rows into the provided result map.
// Uses ROW_NUMBER() to apply a per-reservation row limit so that
// reservations with many snapshots cannot starve others (#6964).
func (s *SQLiteStore) queryUtilizationChunk(ids []string, result map[string][]models.GPUUtilizationSnapshot) error {
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1] // trim trailing comma

	// +1 slot for the per-reservation LIMIT parameter.
	args := make([]interface{}, 0, len(ids)+1)
	for _, id := range ids {
		args = append(args, id)
	}
	args = append(args, bulkUtilizationMaxRowsPerReservation)

	// Use a window function to number rows per reservation, then filter to
	// only the first N rows per reservation ordered by timestamp.
	query := fmt.Sprintf(`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count
		FROM (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY reservation_id ORDER BY timestamp ASC) AS rn
			FROM gpu_utilization_snapshots
			WHERE reservation_id IN (%s)
		)
		WHERE rn <= ?
		ORDER BY reservation_id, timestamp ASC`, placeholders)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var snap models.GPUUtilizationSnapshot
		if err := rows.Scan(&snap.ID, &snap.ReservationID, &snap.Timestamp,
			&snap.GPUUtilizationPct, &snap.MemoryUtilizationPct,
			&snap.ActiveGPUCount, &snap.TotalGPUCount); err != nil {
			return err
		}
		result[snap.ReservationID] = append(result[snap.ReservationID], snap)
	}
	return rows.Err()
}

func (s *SQLiteStore) DeleteOldUtilizationSnapshots(before time.Time) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM gpu_utilization_snapshots WHERE timestamp < ?`, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) ListActiveGPUReservations() ([]models.GPUReservation, error) {
	// #6604: same defense-in-depth LIMIT as ListGPUReservations.
	rows, err := s.db.Query(
		`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE status IN ('active', 'pending') ORDER BY start_date DESC LIMIT ?`,
		gpuReservationsMaxRows,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}

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

// Token Revocation methods

// RevokeToken persists a revoked token JTI with its expiration time.
// INSERT OR IGNORE ensures re-revoking a token cannot silently extend
// its expiry — the first revocation is authoritative (#7731).
func (s *SQLiteStore) RevokeToken(jti string, expiresAt time.Time) error {
	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)`,
		jti, expiresAt,
	)
	return err
}

// IsTokenRevoked checks whether a token JTI has been revoked.
func (s *SQLiteStore) IsTokenRevoked(jti string) (bool, error) {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM revoked_tokens WHERE jti = ?`, jti,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CleanupExpiredTokens removes revoked tokens whose JWT has expired,
// since they can no longer be used regardless of revocation status.
func (s *SQLiteStore) CleanupExpiredTokens() (int64, error) {
	result, err := s.db.Exec(
		`DELETE FROM revoked_tokens WHERE expires_at < ?`, time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// User Rewards methods (issue #6011)

// scanUserRewardsRow decodes a single user_rewards row into a *UserRewards.
// last_daily_bonus_at is nullable in the schema; a NULL value maps to a nil
// pointer so callers can distinguish "never claimed" from "claimed at zero".
func scanUserRewardsRow(row interface {
	Scan(dest ...any) error
}) (*UserRewards, error) {
	var r UserRewards
	var lastBonus sql.NullTime
	if err := row.Scan(&r.UserID, &r.Coins, &r.Points, &r.Level, &r.BonusPoints, &lastBonus, &r.UpdatedAt); err != nil {
		return nil, err
	}
	if lastBonus.Valid {
		t := lastBonus.Time
		r.LastDailyBonusAt = &t
	}
	return &r, nil
}

// GetUserRewards returns the persisted rewards row for userID, or a zero-value
// struct (UserID set, Level=DefaultUserLevel, counters 0, LastDailyBonusAt nil)
// if no row exists yet. A missing row is NOT an error — every authenticated
// user is implicitly at the default starting balance until they earn their
// first coin.
func (s *SQLiteStore) GetUserRewards(userID string) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	row := s.db.QueryRow(
		`SELECT user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at
		 FROM user_rewards WHERE user_id = ?`, userID,
	)
	r, err := scanUserRewardsRow(row)
	if err == sql.ErrNoRows {
		return &UserRewards{
			UserID:    userID,
			Level:     DefaultUserLevel,
			UpdatedAt: time.Now(),
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user rewards: %w", err)
	}
	return r, nil
}

// UpdateUserRewards upserts the full rewards row. Callers pass the desired
// end-state; the stored updated_at timestamp is always rewritten to now.
// Coin/point/level values below their allowed floor are clamped.
func (s *SQLiteStore) UpdateUserRewards(rewards *UserRewards) error {
	if rewards == nil || rewards.UserID == "" {
		return errors.New("rewards.UserID is required")
	}
	if rewards.Coins < MinCoinBalance {
		rewards.Coins = MinCoinBalance
	}
	if rewards.Points < 0 {
		rewards.Points = 0
	}
	if rewards.Level < DefaultUserLevel {
		rewards.Level = DefaultUserLevel
	}
	if rewards.BonusPoints < 0 {
		rewards.BonusPoints = 0
	}
	now := time.Now()
	rewards.UpdatedAt = now

	var lastBonus sql.NullTime
	if rewards.LastDailyBonusAt != nil {
		lastBonus = sql.NullTime{Time: *rewards.LastDailyBonusAt, Valid: true}
	}

	_, err := s.db.Exec(
		`INSERT INTO user_rewards (user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   coins = excluded.coins,
		   points = excluded.points,
		   level = excluded.level,
		   bonus_points = excluded.bonus_points,
		   last_daily_bonus_at = excluded.last_daily_bonus_at,
		   updated_at = excluded.updated_at`,
		rewards.UserID, rewards.Coins, rewards.Points, rewards.Level,
		rewards.BonusPoints, lastBonus, now,
	)
	if err != nil {
		return fmt.Errorf("upsert user rewards: %w", err)
	}
	return nil
}

// IncrementUserCoins atomically adds delta to the user's coin balance inside
// a single transaction so concurrent writers cannot produce torn updates.
// A row is created on the fly if the user has never earned a coin before.
// Negative deltas are permitted but the resulting balance is clamped to
// MinCoinBalance; the returned *UserRewards reflects the clamped value.
func (s *SQLiteStore) IncrementUserCoins(ctx context.Context, userID string, delta int) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	// #6613: callers now thread a request context through the
	// transaction. A cancelled ctx (client disconnect, deadline
	// exceeded) aborts the in-flight write instead of running to
	// completion with context.Background().
	if ctx == nil {
		ctx = context.Background()
	}

	// Same BEGIN IMMEDIATE pattern as AddUserTokenDelta — the default
	// deferred transaction under WAL mode only grabs the write lock at the
	// first INSERT, letting two concurrent goroutines both read the same
	// stale balance and produce a torn update. Pin a connection and issue
	// BEGIN IMMEDIATE manually so the write lock is held from the SELECT
	// through the upsert.
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Close() //nolint:errcheck // best-effort release back to pool

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return nil, fmt.Errorf("begin immediate: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			rollbackConn(conn)
		}
	}()

	row := conn.QueryRowContext(ctx,
		`SELECT user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at
		 FROM user_rewards WHERE user_id = ?`, userID,
	)
	current, scanErr := scanUserRewardsRow(row)
	if scanErr == sql.ErrNoRows {
		current = &UserRewards{
			UserID: userID,
			Level:  DefaultUserLevel,
		}
	} else if scanErr != nil {
		return nil, fmt.Errorf("read current rewards: %w", scanErr)
	}

	newCoins := current.Coins + delta
	if newCoins < MinCoinBalance {
		newCoins = MinCoinBalance
	}
	// Positive deltas also accumulate into the lifetime "points" column so
	// callers that use POST /api/rewards/coins for everyday earn events get
	// a free lifetime-total bump. Negative deltas do NOT reduce lifetime.
	newPoints := current.Points
	if delta > 0 {
		newPoints += delta
	}
	current.Coins = newCoins
	current.Points = newPoints
	now := time.Now()
	current.UpdatedAt = now

	var lastBonus sql.NullTime
	if current.LastDailyBonusAt != nil {
		lastBonus = sql.NullTime{Time: *current.LastDailyBonusAt, Valid: true}
	}

	if _, err := conn.ExecContext(ctx,
		`INSERT INTO user_rewards (user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   coins = excluded.coins,
		   points = excluded.points,
		   level = excluded.level,
		   bonus_points = excluded.bonus_points,
		   last_daily_bonus_at = excluded.last_daily_bonus_at,
		   updated_at = excluded.updated_at`,
		current.UserID, current.Coins, current.Points, current.Level,
		current.BonusPoints, lastBonus, now,
	); err != nil {
		return nil, fmt.Errorf("increment user coins: %w", err)
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return nil, fmt.Errorf("commit immediate tx: %w", err)
	}
	committed = true
	return current, nil
}

// ClaimDailyBonus atomically awards bonusAmount to the user only if at least
// minInterval has elapsed since LastDailyBonusAt. When the cooldown has not
// expired, returns (nil, ErrDailyBonusUnavailable). The caller-provided now
// allows tests to exercise the cooldown deterministically without sleeping.
func (s *SQLiteStore) ClaimDailyBonus(ctx context.Context, userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if bonusAmount < 0 {
		return nil, errors.New("bonusAmount must be non-negative")
	}
	// #6613: see IncrementUserCoins.
	if ctx == nil {
		ctx = context.Background()
	}

	// Same BEGIN IMMEDIATE pattern as AddUserTokenDelta — without it, two
	// concurrent requests can both pass the cooldown check and each award
	// the bonus before either commits, producing a double claim.
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Close() //nolint:errcheck // best-effort release back to pool

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return nil, fmt.Errorf("begin immediate: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			rollbackConn(conn)
		}
	}()

	row := conn.QueryRowContext(ctx,
		`SELECT user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at
		 FROM user_rewards WHERE user_id = ?`, userID,
	)
	current, scanErr := scanUserRewardsRow(row)
	if scanErr == sql.ErrNoRows {
		current = &UserRewards{
			UserID: userID,
			Level:  DefaultUserLevel,
		}
	} else if scanErr != nil {
		return nil, fmt.Errorf("read current rewards: %w", scanErr)
	}

	// Cooldown check — the first claim always goes through because
	// LastDailyBonusAt is nil for brand-new users.
	if current.LastDailyBonusAt != nil {
		elapsed := now.Sub(*current.LastDailyBonusAt)
		if elapsed < minInterval {
			return nil, ErrDailyBonusUnavailable
		}
	}

	current.BonusPoints += bonusAmount
	current.Points += bonusAmount
	claimedAt := now
	current.LastDailyBonusAt = &claimedAt
	current.UpdatedAt = now

	lastBonus := sql.NullTime{Time: claimedAt, Valid: true}
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO user_rewards (user_id, coins, points, level, bonus_points, last_daily_bonus_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   coins = excluded.coins,
		   points = excluded.points,
		   level = excluded.level,
		   bonus_points = excluded.bonus_points,
		   last_daily_bonus_at = excluded.last_daily_bonus_at,
		   updated_at = excluded.updated_at`,
		current.UserID, current.Coins, current.Points, current.Level,
		current.BonusPoints, lastBonus, now,
	); err != nil {
		return nil, fmt.Errorf("claim daily bonus: %w", err)
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return nil, fmt.Errorf("commit immediate tx: %w", err)
	}
	committed = true
	return current, nil
}

// --- User Token Usage methods (follow-up to issue #6011) --------------------
//
// These mirror the UserRewards methods (GetUserRewards / UpdateUserRewards /
// IncrementUserCoins) but for the token-usage widget state. The table stores
// an aggregate TotalTokens plus a JSON-encoded per-category breakdown so the
// frontend can hydrate its byCategory Map on mount without a separate call.

// scanUserTokenUsageRow decodes a single user_token_usage row into a
// *UserTokenUsage. A JSON decode failure on tokens_by_category is treated as
// a corrupted row and returned as an error so callers surface it rather than
// silently dropping the breakdown.
func scanUserTokenUsageRow(row interface {
	Scan(dest ...any) error
}) (*UserTokenUsage, error) {
	var u UserTokenUsage
	var categoriesJSON string
	if err := row.Scan(&u.UserID, &u.TotalTokens, &categoriesJSON, &u.LastAgentSessionID, &u.UpdatedAt); err != nil {
		return nil, err
	}
	if categoriesJSON == "" {
		u.TokensByCategory = map[string]int64{}
	} else {
		if err := json.Unmarshal([]byte(categoriesJSON), &u.TokensByCategory); err != nil {
			return nil, fmt.Errorf("decode tokens_by_category: %w", err)
		}
		if u.TokensByCategory == nil {
			u.TokensByCategory = map[string]int64{}
		}
	}
	return &u, nil
}

// GetUserTokenUsage returns the persisted token-usage row for userID, or a
// zero-value struct (UserID set, TotalTokens=0, empty category map, empty
// session marker) when no row exists yet. A missing row is NOT an error —
// every authenticated user is implicitly at 0/0 until they accumulate
// their first delta.
func (s *SQLiteStore) GetUserTokenUsage(userID string) (*UserTokenUsage, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	row := s.db.QueryRow(
		`SELECT user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at
		 FROM user_token_usage WHERE user_id = ?`, userID,
	)
	u, err := scanUserTokenUsageRow(row)
	if err == sql.ErrNoRows {
		return &UserTokenUsage{
			UserID:           userID,
			TokensByCategory: map[string]int64{},
			UpdatedAt:        time.Now(),
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user token usage: %w", err)
	}
	return u, nil
}

// UpdateUserTokenUsage upserts the full token-usage row. Callers pass the
// desired end-state; the stored updated_at timestamp is always rewritten to
// now. Negative totals are clamped to zero (no magic-number literal — 0 is
// the floor for both TotalTokens and every per-category counter).
func (s *SQLiteStore) UpdateUserTokenUsage(usage *UserTokenUsage) error {
	if usage == nil || usage.UserID == "" {
		return errors.New("usage.UserID is required")
	}
	if usage.TotalTokens < 0 {
		usage.TotalTokens = 0
	}
	// Defensive copy + clamp per-category counters. We never mutate the
	// caller's map in place because the hook shares a singleton reference.
	cleanCategories := make(map[string]int64, len(usage.TokensByCategory))
	for k, v := range usage.TokensByCategory {
		if v < 0 {
			v = 0
		}
		cleanCategories[k] = v
	}
	categoriesJSON, err := json.Marshal(cleanCategories)
	if err != nil {
		return fmt.Errorf("encode tokens_by_category: %w", err)
	}
	now := time.Now()
	usage.TokensByCategory = cleanCategories
	usage.UpdatedAt = now

	_, err = s.db.Exec(
		`INSERT INTO user_token_usage (user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   total_tokens = excluded.total_tokens,
		   tokens_by_category = excluded.tokens_by_category,
		   last_agent_session_id = excluded.last_agent_session_id,
		   updated_at = excluded.updated_at`,
		usage.UserID, usage.TotalTokens, string(categoriesJSON), usage.LastAgentSessionID, now,
	)
	if err != nil {
		return fmt.Errorf("upsert user token usage: %w", err)
	}
	return nil
}

// AddUserTokenDelta atomically adds delta to the user's TotalTokens and to
// the named category bucket inside a single transaction so concurrent writers
// cannot produce torn updates. Restart handling: when agentSessionID is
// non-empty AND differs from the stored LastAgentSessionID, the server
// treats this call as the first delta of a new session — it rewrites the
// stored session marker but does NOT add the delta (the client already
// rebased its baseline for the same reason). The returned *UserTokenUsage
// reflects the post-write state in both branches.
func (s *SQLiteStore) AddUserTokenDelta(ctx context.Context, userID string, category string, delta int64, agentSessionID string) (*UserTokenUsage, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if category == "" {
		return nil, errors.New("category is required")
	}
	if delta < 0 {
		return nil, errors.New("delta must be non-negative")
	}
	// #6613: see IncrementUserCoins.
	if ctx == nil {
		ctx = context.Background()
	}

	// We need a write-locked transaction so the read-merge-write sequence
	// is atomic. modernc/sqlite does NOT translate sql.LevelSerializable
	// to BEGIN IMMEDIATE; under WAL mode the default deferred transaction
	// only acquires the write lock at the first INSERT, which lets two
	// concurrent goroutines both read a stale count and produce torn
	// updates. Workaround: pin a single connection from the pool and
	// issue BEGIN IMMEDIATE / COMMIT manually so the lock is held from
	// the start of the SELECT through the upsert.
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Close() //nolint:errcheck // best-effort release back to pool

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return nil, fmt.Errorf("begin immediate: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			rollbackConn(conn)
		}
	}()

	row := conn.QueryRowContext(ctx,
		`SELECT user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at
		 FROM user_token_usage WHERE user_id = ?`, userID,
	)
	current, scanErr := scanUserTokenUsageRow(row)
	if scanErr == sql.ErrNoRows {
		current = &UserTokenUsage{
			UserID:           userID,
			TokensByCategory: map[string]int64{},
		}
	} else if scanErr != nil {
		return nil, fmt.Errorf("read current token usage: %w", scanErr)
	}

	// Restart detection (mirrors #6020 frontend): if the incoming session
	// marker differs from the one we last stored, treat the current totals
	// as a fresh baseline for the new session and skip the delta add.
	sessionChanged := agentSessionID != "" && current.LastAgentSessionID != "" && agentSessionID != current.LastAgentSessionID
	if !sessionChanged {
		current.TotalTokens += delta
		if current.TokensByCategory == nil {
			current.TokensByCategory = map[string]int64{}
		}
		current.TokensByCategory[category] += delta
	}
	// Always update the stored session marker to whatever the caller sent
	// (empty incoming value is retained as-is on purpose — demo and unauth
	// flows never carry a session id).
	if agentSessionID != "" {
		current.LastAgentSessionID = agentSessionID
	}

	categoriesJSON, err := json.Marshal(current.TokensByCategory)
	if err != nil {
		return nil, fmt.Errorf("encode tokens_by_category: %w", err)
	}
	now := time.Now()
	current.UpdatedAt = now

	if _, err := conn.ExecContext(ctx,
		`INSERT INTO user_token_usage (user_id, total_tokens, tokens_by_category, last_agent_session_id, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   total_tokens = excluded.total_tokens,
		   tokens_by_category = excluded.tokens_by_category,
		   last_agent_session_id = excluded.last_agent_session_id,
		   updated_at = excluded.updated_at`,
		current.UserID, current.TotalTokens, string(categoriesJSON), current.LastAgentSessionID, now,
	); err != nil {
		return nil, fmt.Errorf("upsert user token usage delta: %w", err)
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return nil, fmt.Errorf("commit immediate tx: %w", err)
	}
	committed = true
	return current, nil
}

// OAuth State methods — persist OAuth state tokens so in-flight logins survive
// a backend restart between /auth/login and /auth/callback (issue #6028).

// StoreOAuthState persists an OAuth state token with the given time-to-live.
// The state is a single-use CSRF token; ConsumeOAuthState must be called once
// to validate and delete it on the callback.
func (s *SQLiteStore) StoreOAuthState(state string, ttl time.Duration) error {
	now := time.Now()
	expiresAt := now.Add(ttl)
	_, err := s.db.Exec(
		`INSERT INTO oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)`,
		state, now, expiresAt,
	)
	return err
}

// ConsumeOAuthState atomically looks up and deletes an OAuth state token in a
// single transaction. It returns true only when the state exists, has not
// expired, and was successfully deleted — ensuring single-use semantics.
//
// Expired states are also deleted to keep the table lean, but the call still
// returns false for them so the caller treats the flow as invalid.
//
// Concurrency: WAL-mode SQLite default-deferred transactions allow two
// readers to both pass the SELECT before either DELETE runs, which without
// the rows-affected check below would let both calls report success on the
// same single-use token. We use a pinned connection with BEGIN IMMEDIATE
// (same pattern as AddUserTokenDelta / IncrementUserCoins) so the
// read-modify-write happens under a single write lock, AND we cross-check
// `RowsAffected()` so a duplicate consume is reported as not-found rather
// than success.
func (s *SQLiteStore) ConsumeOAuthState(ctx context.Context, state string) (bool, error) {
	// #6613: see IncrementUserCoins.
	if ctx == nil {
		ctx = context.Background()
	}
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return false, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Close() //nolint:errcheck // best-effort release back to pool

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return false, fmt.Errorf("begin immediate: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			rollbackConn(conn)
		}
	}()

	var expiresAt time.Time
	err = conn.QueryRowContext(ctx,
		`SELECT expires_at FROM oauth_states WHERE state = ?`, state,
	).Scan(&expiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	// Delete unconditionally — whether the state is valid or expired, it
	// should not be reusable after this call. RowsAffected guards against
	// the race where another caller already consumed the same state in the
	// window between our SELECT and DELETE: that caller will have removed
	// the row, our DELETE affects 0 rows, and we report not-found.
	res, err := conn.ExecContext(ctx, `DELETE FROM oauth_states WHERE state = ?`, state)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return false, fmt.Errorf("commit immediate tx: %w", err)
	}
	committed = true

	if affected == 0 {
		// Lost the race to a concurrent consumer of the same state.
		return false, nil
	}
	return time.Now().Before(expiresAt), nil
}

// CleanupExpiredOAuthStates removes OAuth state rows whose expires_at has
// passed. Returns the number of rows deleted.
func (s *SQLiteStore) CleanupExpiredOAuthStates() (int64, error) {
	result, err := s.db.Exec(
		`DELETE FROM oauth_states WHERE expires_at < ?`, time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// SaveClusterGroup upserts a cluster group definition (#7013).
func (s *SQLiteStore) SaveClusterGroup(name string, data []byte) error {
	_, err := s.db.Exec(
		`INSERT INTO cluster_groups (name, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
		name, data,
	)
	return err
}

// DeleteClusterGroup removes a cluster group definition (#7013).
func (s *SQLiteStore) DeleteClusterGroup(name string) error {
	_, err := s.db.Exec(`DELETE FROM cluster_groups WHERE name = ?`, name)
	return err
}

// maxClusterGroups is the upper bound on cluster groups returned (#7734).
const maxClusterGroups = 200

// ListClusterGroups returns all persisted cluster group definitions (#7013).
func (s *SQLiteStore) ListClusterGroups() (map[string][]byte, error) {
	rows, err := s.db.Query(`SELECT name, data FROM cluster_groups LIMIT ?`, maxClusterGroups)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make(map[string][]byte)
	for rows.Next() {
		var name string
		var data []byte
		if err := rows.Scan(&name, &data); err != nil {
			return nil, err
		}
		groups[name] = data
	}
	return groups, rows.Err()
}

// ---------------------------------------------------------------------------
// Audit Log (#8670 Phase 3)
// ---------------------------------------------------------------------------

// maxAuditQueryLimit is the upper bound on rows returned by QueryAuditLogs
// to prevent unbounded reads from large audit tables.
const maxAuditQueryLimit = 200

// defaultAuditQueryLimit is used when the caller passes 0 for limit.
const defaultAuditQueryLimit = 50

// InsertAuditLog appends an audit entry to the audit_log table.
func (s *SQLiteStore) InsertAuditLog(ctx context.Context, userID, action, detail string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO audit_log (timestamp, user_id, action, detail) VALUES (?, ?, ?, ?)`,
		time.Now().UTC().Format(time.RFC3339), userID, action, detail,
	)
	return err
}

// QueryAuditLogs returns recent audit entries, newest first. Empty userID or
// action strings disable the corresponding filter. Limit is clamped to
// maxAuditQueryLimit.
func (s *SQLiteStore) QueryAuditLogs(ctx context.Context, limit int, userID, action string) ([]AuditEntry, error) {
	if limit <= 0 {
		limit = defaultAuditQueryLimit
	}
	if limit > maxAuditQueryLimit {
		limit = maxAuditQueryLimit
	}

	query := `SELECT id, timestamp, user_id, action, COALESCE(detail, '') FROM audit_log`
	args := make([]interface{}, 0)
	clauses := make([]string, 0)

	if userID != "" {
		clauses = append(clauses, "user_id = ?")
		args = append(args, userID)
	}
	if action != "" {
		clauses = append(clauses, "action = ?")
		args = append(args, action)
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]AuditEntry, 0)
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.UserID, &e.Action, &e.Detail); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
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

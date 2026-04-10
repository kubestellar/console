package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/kubestellar/console/pkg/models"
)

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

// parseUUID parses a UUID string, logging a warning if malformed instead of
// silently returning the zero UUID. This prevents data misattribution when
// the database contains corrupted UUID strings.
func parseUUID(s string, field string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		slog.Warn("[Store] malformed UUID in database — using zero UUID", "field", field, "value", s, "error", err)
	}
	return id
}

// maxSQLLimit is the maximum allowed value for SQL LIMIT parameters.
// This provides defense-in-depth against unbounded queries from internal callers.
const maxSQLLimit = 1000

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
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

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
	CREATE INDEX IF NOT EXISTS idx_pending_swaps_due ON pending_swaps(swap_at, status);

	-- Feature requests from users (bugs/features submitted via console)
	CREATE TABLE IF NOT EXISTS feature_requests (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		request_type TEXT NOT NULL,
		github_issue_number INTEGER,
		github_issue_url TEXT,
		status TEXT DEFAULT 'submitted',
		pr_number INTEGER,
		pr_url TEXT,
		copilot_session_url TEXT,
		netlify_preview_url TEXT,
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
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_feature_requests_user ON feature_requests(user_id);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
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
	}
	for _, migration := range migrations {
		// Ignore errors - column may already exist
		s.db.Exec(migration)
	}

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

// ListUsers returns all users
func (s *SQLiteStore) ListUsers() ([]models.User, error) {
	rows, err := s.db.Query(`SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users ORDER BY created_at DESC`)
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

// CountUsersByRole returns the count of users by role
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
		default:
			viewers += count
		}
	}
	return admins, editors, viewers, rows.Err()
}

// Onboarding methods

func (s *SQLiteStore) SaveOnboardingResponse(response *models.OnboardingResponse) error {
	if response.ID == uuid.Nil {
		response.ID = uuid.New()
	}
	response.CreatedAt = time.Now()

	_, err := s.db.Exec(`INSERT OR REPLACE INTO onboarding_responses (id, user_id, question_key, answer, created_at) VALUES (?, ?, ?, ?, ?)`,
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

func (s *SQLiteStore) GetUserDashboards(userID uuid.UUID) ([]models.Dashboard, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE user_id = ? ORDER BY is_default DESC, created_at`, userID.String())
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

func (s *SQLiteStore) GetDashboardCards(dashboardID uuid.UUID) ([]models.Card, error) {
	rows, err := s.db.Query(`SELECT id, dashboard_id, card_type, config, position, last_summary, last_focus, created_at FROM cards WHERE dashboard_id = ? ORDER BY created_at`, dashboardID.String())
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

	_, err = s.db.Exec(`UPDATE cards SET card_type = ?, config = ?, position = ? WHERE id = ?`,
		string(card.CardType), configStr, string(positionJSON), card.ID.String())
	return err
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

func (s *SQLiteStore) GetUserPendingSwaps(userID uuid.UUID) ([]models.PendingSwap, error) {
	rows, err := s.db.Query(`SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE user_id = ? AND status = 'pending' ORDER BY swap_at`, userID.String())
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

func (s *SQLiteStore) GetDueSwaps() ([]models.PendingSwap, error) {
	rows, err := s.db.Query(`SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE status = 'pending' AND swap_at <= ?`, time.Now())
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
	_, err := s.db.Exec(`UPDATE pending_swaps SET swap_at = ?, status = 'snoozed' WHERE id = ?`, newSwapAt, id.String())
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

func (s *SQLiteStore) GetRecentEvents(userID uuid.UUID, since time.Duration) ([]models.UserEvent, error) {
	cutoff := time.Now().Add(-since)
	rows, err := s.db.Query(`SELECT id, user_id, event_type, card_id, metadata, created_at FROM user_events WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`, userID.String(), cutoff)
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
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE id = ?`, id.String())
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE github_issue_number = ?`, issueNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE pr_number = ?`, prNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetUserFeatureRequests(userID uuid.UUID) ([]models.FeatureRequest, error) {
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE user_id = ? ORDER BY created_at DESC`, userID.String())
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

func (s *SQLiteStore) GetAllFeatureRequests() ([]models.FeatureRequest, error) {
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests ORDER BY created_at DESC`)
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
	var prURL, copilotSessionURL, previewURL sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := row.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &r.CreatedAt, &updatedAt)
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
	var prURL, copilotSessionURL, previewURL sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &r.CreatedAt, &updatedAt)
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

func (s *SQLiteStore) GetPRFeedback(featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	rows, err := s.db.Query(`SELECT id, feature_request_id, user_id, feedback_type, comment, created_at FROM pr_feedback WHERE feature_request_id = ? ORDER BY created_at DESC`, featureRequestID.String())
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

	_, err := s.db.Exec(`INSERT INTO notifications (id, user_id, feature_request_id, notification_type, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		notification.ID.String(), notification.UserID.String(), featureRequestID,
		string(notification.NotificationType), notification.Title, notification.Message,
		boolToInt(notification.Read), notification.CreatedAt)
	return err
}

func (s *SQLiteStore) GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error) {
	rows, err := s.db.Query(`SELECT id, user_id, feature_request_id, notification_type, title, message, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, userID.String(), limit)
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

		if err := rows.Scan(&idStr, &userIDStr, &featureRequestID, &notificationType, &n.Title, &n.Message, &read, &n.CreatedAt); err != nil {
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

func (s *SQLiteStore) CreateGPUReservation(reservation *models.GPUReservation) error {
	if reservation.ID == uuid.Nil {
		reservation.ID = uuid.New()
	}
	reservation.CreatedAt = time.Now()
	if reservation.Status == "" {
		reservation.Status = models.ReservationStatusPending
	}

	_, err := s.db.Exec(`INSERT INTO gpu_reservations (id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		reservation.ID.String(), reservation.UserID.String(), reservation.UserName,
		reservation.Title, reservation.Description, reservation.Cluster, reservation.Namespace,
		reservation.GPUCount, reservation.GPUType, reservation.StartDate, reservation.DurationHours,
		reservation.Notes, string(reservation.Status), reservation.QuotaName,
		boolToInt(reservation.QuotaEnforced), reservation.CreatedAt)
	return err
}

func (s *SQLiteStore) GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error) {
	row := s.db.QueryRow(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE id = ?`, id.String())
	return s.scanGPUReservation(row)
}

func (s *SQLiteStore) ListGPUReservations() ([]models.GPUReservation, error) {
	rows, err := s.db.Query(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations ORDER BY start_date DESC`)
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
	rows, err := s.db.Query(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE user_id = ? ORDER BY start_date DESC`, userID.String())
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

	_, err := s.db.Exec(`UPDATE gpu_reservations SET user_name = ?, title = ?, description = ?, cluster = ?, namespace = ?, gpu_count = ?, gpu_type = ?, start_date = ?, duration_hours = ?, notes = ?, status = ?, quota_name = ?, quota_enforced = ?, updated_at = ? WHERE id = ?`,
		reservation.UserName, reservation.Title, reservation.Description,
		reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.GPUType,
		reservation.StartDate, reservation.DurationHours, reservation.Notes,
		string(reservation.Status), reservation.QuotaName, boolToInt(reservation.QuotaEnforced),
		reservation.UpdatedAt, reservation.ID.String())
	return err
}

func (s *SQLiteStore) DeleteGPUReservation(id uuid.UUID) error {
	_, err := s.db.Exec(`DELETE FROM gpu_reservations WHERE id = ?`, id.String())
	return err
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

	err := row.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &r.StartDate,
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
	return &r, nil
}

func (s *SQLiteStore) scanGPUReservationRow(rows *sql.Rows) (*models.GPUReservation, error) {
	var r models.GPUReservation
	var idStr, userIDStr, status string
	var quotaEnforced int
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &r.StartDate,
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
	return &r, nil
}

// --- GPU Utilization Snapshots ---

func (s *SQLiteStore) InsertUtilizationSnapshot(snapshot *models.GPUUtilizationSnapshot) error {
	_, err := s.db.Exec(
		`INSERT INTO gpu_utilization_snapshots (id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		snapshot.ID, snapshot.ReservationID, snapshot.Timestamp,
		snapshot.GPUUtilizationPct, snapshot.MemoryUtilizationPct,
		snapshot.ActiveGPUCount, snapshot.TotalGPUCount,
	)
	return err
}

func (s *SQLiteStore) GetUtilizationSnapshots(reservationID string) ([]models.GPUUtilizationSnapshot, error) {
	rows, err := s.db.Query(
		`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count FROM gpu_utilization_snapshots WHERE reservation_id = ? ORDER BY timestamp ASC`,
		reservationID,
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

func (s *SQLiteStore) GetBulkUtilizationSnapshots(reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error) {
	result := make(map[string][]models.GPUUtilizationSnapshot)
	if len(reservationIDs) == 0 {
		return result, nil
	}

	// Build parameterized query with placeholders
	placeholders := ""
	args := make([]interface{}, len(reservationIDs))
	for i, id := range reservationIDs {
		if i > 0 {
			placeholders += ", "
		}
		placeholders += "?"
		args[i] = id
	}

	rows, err := s.db.Query(
		fmt.Sprintf(`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count FROM gpu_utilization_snapshots WHERE reservation_id IN (%s) ORDER BY timestamp ASC`, placeholders),
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var snap models.GPUUtilizationSnapshot
		if err := rows.Scan(&snap.ID, &snap.ReservationID, &snap.Timestamp,
			&snap.GPUUtilizationPct, &snap.MemoryUtilizationPct,
			&snap.ActiveGPUCount, &snap.TotalGPUCount); err != nil {
			return nil, err
		}
		result[snap.ReservationID] = append(result[snap.ReservationID], snap)
	}
	return result, rows.Err()
}

func (s *SQLiteStore) DeleteOldUtilizationSnapshots(before time.Time) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM gpu_utilization_snapshots WHERE timestamp < ?`, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) ListActiveGPUReservations() ([]models.GPUReservation, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE status IN ('active', 'pending') ORDER BY start_date DESC`,
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
func (s *SQLiteStore) RevokeToken(jti string, expiresAt time.Time) error {
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)`,
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
func (s *SQLiteStore) IncrementUserCoins(userID string, delta int) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // best-effort rollback on error paths

	row := tx.QueryRow(
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

	if _, err := tx.Exec(
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

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return current, nil
}

// ClaimDailyBonus atomically awards bonusAmount to the user only if at least
// minInterval has elapsed since LastDailyBonusAt. When the cooldown has not
// expired, returns (nil, ErrDailyBonusUnavailable). The caller-provided now
// allows tests to exercise the cooldown deterministically without sleeping.
func (s *SQLiteStore) ClaimDailyBonus(userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if bonusAmount < 0 {
		return nil, errors.New("bonusAmount must be non-negative")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // best-effort rollback on error paths

	row := tx.QueryRow(
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
	if _, err := tx.Exec(
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

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
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
func (s *SQLiteStore) AddUserTokenDelta(userID string, category string, delta int64, agentSessionID string) (*UserTokenUsage, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if category == "" {
		return nil, errors.New("category is required")
	}
	if delta < 0 {
		return nil, errors.New("delta must be non-negative")
	}

	// We need a write-locked transaction so the read-merge-write sequence
	// is atomic. modernc/sqlite does NOT translate sql.LevelSerializable
	// to BEGIN IMMEDIATE; under WAL mode the default deferred transaction
	// only acquires the write lock at the first INSERT, which lets two
	// concurrent goroutines both read a stale count and produce torn
	// updates. Workaround: pin a single connection from the pool and
	// issue BEGIN IMMEDIATE / COMMIT manually so the lock is held from
	// the start of the SELECT through the upsert.
	ctx := context.Background()
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
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
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

package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/kubestellar/console/pkg/models"
)

// SQLiteStore implements Store using SQLite
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite store
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

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

	u.ID, _ = uuid.Parse(idStr)
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
		u.Role = role.String
	} else {
		u.Role = "viewer" // default role
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
		user.Role = "viewer" // default role
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

		u.ID, _ = uuid.Parse(idStr)
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
			u.Role = role.String
		} else {
			u.Role = "viewer"
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

// UpdateUserRole updates only the user's role
func (s *SQLiteStore) UpdateUserRole(userID uuid.UUID, role string) error {
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
		r.ID, _ = uuid.Parse(idStr)
		r.UserID, _ = uuid.Parse(userIDStr)
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

	d.ID, _ = uuid.Parse(idStr)
	d.UserID, _ = uuid.Parse(userIDStr)
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

	d.ID, _ = uuid.Parse(idStr)
	d.UserID, _ = uuid.Parse(userIDStr)
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

	c.ID, _ = uuid.Parse(idStr)
	c.DashboardID, _ = uuid.Parse(dashboardIDStr)
	c.CardType = models.CardType(cardType)
	if config.Valid {
		c.Config = json.RawMessage(config.String)
	}
	json.Unmarshal([]byte(positionStr), &c.Position)
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

	c.ID, _ = uuid.Parse(idStr)
	c.DashboardID, _ = uuid.Parse(dashboardIDStr)
	c.CardType = models.CardType(cardType)
	if config.Valid {
		c.Config = json.RawMessage(config.String)
	}
	json.Unmarshal([]byte(positionStr), &c.Position)
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

	positionJSON, _ := json.Marshal(card.Position)
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	_, err := s.db.Exec(`INSERT INTO cards (id, dashboard_id, card_type, config, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		card.ID.String(), card.DashboardID.String(), string(card.CardType), configStr, string(positionJSON), card.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateCard(card *models.Card) error {
	positionJSON, _ := json.Marshal(card.Position)
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	_, err := s.db.Exec(`UPDATE cards SET card_type = ?, config = ?, position = ? WHERE id = ?`,
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

		h.ID, _ = uuid.Parse(idStr)
		h.UserID, _ = uuid.Parse(userIDStr)
		h.CardType = models.CardType(cardType)
		if origCardID.Valid {
			id, _ := uuid.Parse(origCardID.String)
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

	swap.ID, _ = uuid.Parse(idStr)
	swap.UserID, _ = uuid.Parse(userIDStr)
	swap.CardID, _ = uuid.Parse(cardIDStr)
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

	swap.ID, _ = uuid.Parse(idStr)
	swap.UserID, _ = uuid.Parse(userIDStr)
	swap.CardID, _ = uuid.Parse(cardIDStr)
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

		e.ID, _ = uuid.Parse(idStr)
		e.UserID, _ = uuid.Parse(userIDStr)
		e.EventType = models.EventType(eventType)
		if cardID.Valid {
			id, _ := uuid.Parse(cardID.String)
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

	_, err := s.db.Exec(`INSERT INTO feature_requests (id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		request.ID.String(), request.UserID.String(), request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, nullString(request.GitHubIssueURL), string(request.Status),
		request.PRNumber, nullString(request.PRURL), nullString(request.CopilotSessionURL), nullString(request.NetlifyPreviewURL), request.CreatedAt)
	return err
}

func (s *SQLiteStore) GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE id = ?`, id.String())
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE github_issue_number = ?`, issueNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRow(`SELECT id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE pr_number = ?`, prNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetUserFeatureRequests(userID uuid.UUID) ([]models.FeatureRequest, error) {
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests WHERE user_id = ? ORDER BY created_at DESC`, userID.String())
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
	rows, err := s.db.Query(`SELECT id, user_id, title, description, request_type, github_issue_number, github_issue_url, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, created_at, updated_at FROM feature_requests ORDER BY created_at DESC`)
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
	var issueURL, prURL, copilotSessionURL, previewURL sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := row.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &issueURL, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &r.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.ID, _ = uuid.Parse(idStr)
	r.UserID, _ = uuid.Parse(userIDStr)
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if issueURL.Valid {
		r.GitHubIssueURL = issueURL.String
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
	var issueURL, prURL, copilotSessionURL, previewURL sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &issueURL, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &r.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	r.ID, _ = uuid.Parse(idStr)
	r.UserID, _ = uuid.Parse(userIDStr)
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if issueURL.Valid {
		r.GitHubIssueURL = issueURL.String
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

	_, err := s.db.Exec(`UPDATE feature_requests SET title = ?, description = ?, request_type = ?, github_issue_number = ?, github_issue_url = ?, status = ?, pr_number = ?, pr_url = ?, copilot_session_url = ?, netlify_preview_url = ?, updated_at = ? WHERE id = ?`,
		request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, nullString(request.GitHubIssueURL), string(request.Status),
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

		f.ID, _ = uuid.Parse(idStr)
		f.FeatureRequestID, _ = uuid.Parse(requestIDStr)
		f.UserID, _ = uuid.Parse(userIDStr)
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

		n.ID, _ = uuid.Parse(idStr)
		n.UserID, _ = uuid.Parse(userIDStr)
		n.NotificationType = models.NotificationType(notificationType)
		n.Read = read == 1
		if featureRequestID.Valid {
			id, _ := uuid.Parse(featureRequestID.String)
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

	r.ID, _ = uuid.Parse(idStr)
	r.UserID, _ = uuid.Parse(userIDStr)
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

	r.ID, _ = uuid.Parse(idStr)
	r.UserID, _ = uuid.Parse(userIDStr)
	r.Status = models.ReservationStatus(status)
	r.QuotaEnforced = quotaEnforced == 1
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	return &r, nil
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

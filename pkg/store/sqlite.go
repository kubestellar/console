package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"

	"github.com/kubestellar/console/pkg/models"
)

// SQLiteStore implements Store using SQLite
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite store
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
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
		avatar_url TEXT,
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
	`
	_, err := s.db.Exec(schema)
	return err
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// User methods

func (s *SQLiteStore) GetUser(id uuid.UUID) (*models.User, error) {
	row := s.db.QueryRow(`SELECT id, github_id, github_login, email, avatar_url, onboarded, created_at, last_login FROM users WHERE id = ?`, id.String())
	return s.scanUser(row)
}

func (s *SQLiteStore) GetUserByGitHubID(githubID string) (*models.User, error) {
	row := s.db.QueryRow(`SELECT id, github_id, github_login, email, avatar_url, onboarded, created_at, last_login FROM users WHERE github_id = ?`, githubID)
	return s.scanUser(row)
}

func (s *SQLiteStore) scanUser(row *sql.Row) (*models.User, error) {
	var u models.User
	var idStr string
	var onboarded int
	var email, avatar sql.NullString
	var lastLogin sql.NullTime

	err := row.Scan(&idStr, &u.GitHubID, &u.GitHubLogin, &email, &avatar, &onboarded, &u.CreatedAt, &lastLogin)
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
	if avatar.Valid {
		u.AvatarURL = avatar.String
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

	_, err := s.db.Exec(`INSERT INTO users (id, github_id, github_login, email, avatar_url, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		user.ID.String(), user.GitHubID, user.GitHubLogin, nullString(user.Email), nullString(user.AvatarURL), boolToInt(user.Onboarded), user.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateUser(user *models.User) error {
	_, err := s.db.Exec(`UPDATE users SET github_login = ?, email = ?, avatar_url = ?, onboarded = ? WHERE id = ?`,
		user.GitHubLogin, nullString(user.Email), nullString(user.AvatarURL), boolToInt(user.Onboarded), user.ID.String())
	return err
}

func (s *SQLiteStore) UpdateLastLogin(userID uuid.UUID) error {
	_, err := s.db.Exec(`UPDATE users SET last_login = ? WHERE id = ?`, time.Now(), userID.String())
	return err
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

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// Dashboard methods

func (s *SQLiteStore) GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE id = ?`, id.String())
	return s.scanDashboard(row)
}

// CountUserDashboards returns the total number of dashboards owned by a user.
// Used to enforce the per-user dashboard limit (#7010).
func (s *SQLiteStore) CountUserDashboards(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dashboards WHERE user_id = ?`, userID.String()).Scan(&count)
	return count, err
}

// GetUserDashboards returns a page of a user's dashboards, default dashboard
// first, then oldest-first within each group.
// #6596: limit/offset are required to prevent an unbounded per-user read if a
// user ever accumulates a pathological number of dashboards. Pass 0 for limit
// to use the store default. ORDER BY includes an id ASC tie-breaker so rows
// that share created_at paginate deterministically.
func (s *SQLiteStore) GetUserDashboards(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.Dashboard, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE user_id = ? ORDER BY is_default DESC, created_at ASC, id ASC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dashboards []models.Dashboard
	for rows.Next() {
		d, err := s.scanDashboardRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		dashboards = append(dashboards, *d)
	}
	return dashboards, rows.Err()
}

func (s *SQLiteStore) GetDefaultDashboard(ctx context.Context, userID uuid.UUID) (*models.Dashboard, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, name, layout, is_default, created_at, updated_at FROM dashboards WHERE user_id = ? AND is_default = 1`, userID.String())
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

func (s *SQLiteStore) scanDashboardRow(ctx context.Context, rows *sql.Rows) (*models.Dashboard, error) {
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

func (s *SQLiteStore) CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	if dashboard.ID == uuid.Nil {
		dashboard.ID = uuid.New()
	}
	dashboard.CreatedAt = time.Now()

	var layoutStr *string
	if dashboard.Layout != nil {
		str := string(dashboard.Layout)
		layoutStr = &str
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO dashboards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		dashboard.ID.String(), dashboard.UserID.String(), dashboard.Name, layoutStr, boolToInt(dashboard.IsDefault), dashboard.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	now := time.Now()
	dashboard.UpdatedAt = &now

	var layoutStr *string
	if dashboard.Layout != nil {
		str := string(dashboard.Layout)
		layoutStr = &str
	}

	_, err := s.db.ExecContext(ctx, `UPDATE dashboards SET name = ?, layout = ?, is_default = ?, updated_at = ? WHERE id = ?`,
		dashboard.Name, layoutStr, boolToInt(dashboard.IsDefault), dashboard.UpdatedAt, dashboard.ID.String())
	return err
}

func (s *SQLiteStore) DeleteDashboard(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM dashboards WHERE id = ?`, id.String())
	return err
}

// Card methods

func (s *SQLiteStore) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, dashboard_id, card_type, config, position, last_summary, last_focus, created_at FROM cards WHERE id = ?`, id.String())
	return s.scanCard(ctx, row)
}

// maxDashboardCards is the upper bound on cards returned per dashboard (#7733).
const maxDashboardCards = 500

func (s *SQLiteStore) GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, dashboard_id, card_type, config, position, last_summary, last_focus, created_at FROM cards WHERE dashboard_id = ? ORDER BY created_at LIMIT ?`, dashboardID.String(), maxDashboardCards)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []models.Card
	for rows.Next() {
		c, err := s.scanCardRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		cards = append(cards, *c)
	}
	return cards, rows.Err()
}

func (s *SQLiteStore) scanCard(ctx context.Context, row *sql.Row) (*models.Card, error) {
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

func (s *SQLiteStore) scanCardRow(ctx context.Context, rows *sql.Rows) (*models.Card, error) {
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

func (s *SQLiteStore) CreateCard(ctx context.Context, card *models.Card) error {
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

	_, err = s.db.ExecContext(ctx, `INSERT INTO cards (id, dashboard_id, card_type, config, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
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
func (s *SQLiteStore) CreateCardWithLimit(ctx context.Context, card *models.Card, maxCards int) error {
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
	result, err := s.db.ExecContext(ctx,
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
func (s *SQLiteStore) UpdateCard(ctx context.Context, card *models.Card) error {
	positionJSON, err := json.Marshal(card.Position)
	if err != nil {
		return fmt.Errorf("failed to marshal card position: %w", err)
	}
	var configStr *string
	if card.Config != nil {
		str := string(card.Config)
		configStr = &str
	}

	res, err := s.db.ExecContext(ctx, `UPDATE cards SET dashboard_id = ?, card_type = ?, config = ?, position = ? WHERE id = ?`,
		card.DashboardID.String(), string(card.CardType), configStr, string(positionJSON), card.ID.String())
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

// MoveCardWithLimit atomically moves a card to a different dashboard,
// enforcing the per-dashboard card limit. The count check and the update
// happen in a single SQL statement so that SQLite's write lock serializes
// concurrent moves the same way CreateCardWithLimit serializes creates.
// Returns ErrDashboardCardLimitReached when the target dashboard already
// has maxCards cards (the card that is being moved is excluded from the
// count because it still belongs to the source dashboard at check time).
func (s *SQLiteStore) MoveCardWithLimit(ctx context.Context, cardID uuid.UUID, targetDashboardID uuid.UUID, maxCards int) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE cards SET dashboard_id = ?
		 WHERE id = ?
		 AND (SELECT COUNT(*) FROM cards WHERE dashboard_id = ?) < ?`,
		targetDashboardID.String(), cardID.String(),
		targetDashboardID.String(), maxCards,
	)
	if err != nil {
		return fmt.Errorf("failed to move card: %w", err)
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to read rows affected: %w", err)
	}
	if rowsAffected == 0 {
		// Could be either: card doesn't exist, or limit reached.
		// Check if card exists to distinguish.
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM cards WHERE id = ?`, cardID.String()).Scan(&exists); err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to check card existence: %w", err)
		}
		if exists == 1 {
			return ErrDashboardCardLimitReached
		}
		return sql.ErrNoRows
	}
	return nil
}

func (s *SQLiteStore) DeleteCard(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM cards WHERE id = ?`, id.String())
	return err
}

func (s *SQLiteStore) UpdateCardFocus(ctx context.Context, cardID uuid.UUID, summary string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE cards SET last_focus = ?, last_summary = ? WHERE id = ?`, time.Now(), summary, cardID.String())
	return err
}

// Card History methods

func (s *SQLiteStore) AddCardHistory(ctx context.Context, history *models.CardHistory) error {
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

	_, err := s.db.ExecContext(ctx, `INSERT INTO card_history (id, user_id, original_card_id, card_type, config, swapped_out_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		history.ID.String(), history.UserID.String(), origCardID, string(history.CardType), configStr, history.SwappedOutAt, history.Reason)
	return err
}

func (s *SQLiteStore) GetUserCardHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.CardHistory, error) {
	limit = clampLimit(limit)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, original_card_id, card_type, config, swapped_out_at, reason FROM card_history WHERE user_id = ? ORDER BY swapped_out_at DESC LIMIT ?`, userID.String(), limit)
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

func (s *SQLiteStore) GetPendingSwap(ctx context.Context, id uuid.UUID) (*models.PendingSwap, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE id = ?`, id.String())
	return s.scanPendingSwap(row)
}

// GetUserPendingSwaps returns a page of a user's pending swaps, oldest
// swap_at first.
// #6597: limit/offset are required so a user with a large backlog of pending
// swaps cannot force an unbounded read. Pass 0 for limit to use the store
// default. ORDER BY includes an id ASC tie-breaker so rows that share
// swap_at paginate deterministically.
func (s *SQLiteStore) GetUserPendingSwaps(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE user_id = ? AND status = 'pending' ORDER BY swap_at ASC, id ASC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var swaps []models.PendingSwap
	for rows.Next() {
		swap, err := s.scanPendingSwapRow(ctx, rows)
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
func (s *SQLiteStore) GetDueSwaps(ctx context.Context, limit, offset int) ([]models.PendingSwap, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	// #6621: id ASC tie-breaker ensures pages are stable when multiple swaps
	// share the same swap_at (common after batch scheduling). Without it,
	// OFFSET paging could skip or duplicate rows as SQLite picks arbitrary
	// tie-break order between calls.
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at FROM pending_swaps WHERE status = 'pending' AND swap_at <= ? ORDER BY swap_at ASC, id ASC LIMIT ? OFFSET ?`, time.Now(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var swaps []models.PendingSwap
	for rows.Next() {
		swap, err := s.scanPendingSwapRow(ctx, rows)
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

func (s *SQLiteStore) scanPendingSwapRow(ctx context.Context, rows *sql.Rows) (*models.PendingSwap, error) {
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

func (s *SQLiteStore) CreatePendingSwap(ctx context.Context, swap *models.PendingSwap) error {
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

	_, err := s.db.ExecContext(ctx, `INSERT INTO pending_swaps (id, user_id, card_id, new_card_type, new_card_config, reason, swap_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		swap.ID.String(), swap.UserID.String(), swap.CardID.String(), string(swap.NewCardType), configStr, swap.Reason, swap.SwapAt, string(swap.Status), swap.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateSwapStatus(ctx context.Context, id uuid.UUID, status models.SwapStatus) error {
	_, err := s.db.ExecContext(ctx, `UPDATE pending_swaps SET status = ? WHERE id = ?`, string(status), id.String())
	return err
}

func (s *SQLiteStore) SnoozeSwap(ctx context.Context, id uuid.UUID, newSwapAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE pending_swaps SET swap_at = ?, status = ? WHERE id = ?`, newSwapAt, string(models.SwapStatusSnoozed), id.String())
	return err
}

// User Event methods

func (s *SQLiteStore) RecordEvent(ctx context.Context, event *models.UserEvent) error {
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

	_, err := s.db.ExecContext(ctx, `INSERT INTO user_events (id, user_id, event_type, card_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		event.ID.String(), event.UserID.String(), string(event.EventType), cardID, metadataStr, event.CreatedAt)
	return err
}

// GetRecentEvents returns a user's events within the given window, newest first.
// #6599: LIMIT/OFFSET bound the read so a chatty client cannot force an
// unbounded scan of user_events.
func (s *SQLiteStore) GetRecentEvents(ctx context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error) {
	cutoff := time.Now().Add(-since)
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	// #6621: id DESC tie-breaker ensures pages are stable when many events
	// share the same created_at (common when clients burst-record events in
	// the same millisecond). Without it, OFFSET paging could skip rows.
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, event_type, card_id, metadata, created_at FROM user_events WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, userID.String(), cutoff, lim, off)
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

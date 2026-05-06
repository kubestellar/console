package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

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
func (s *SQLiteStore) GetUserRewards(ctx context.Context, userID string) (*UserRewards, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	row := s.db.QueryRowContext(ctx,
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
func (s *SQLiteStore) UpdateUserRewards(ctx context.Context, rewards *UserRewards) error {
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

	_, err := s.db.ExecContext(ctx,
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

func isSameUTCDay(a, b time.Time) bool {
	aYear, aMonth, aDay := a.UTC().Date()
	bYear, bMonth, bDay := b.UTC().Date()
	return aYear == bYear && aMonth == bMonth && aDay == bDay
}

func normalizeCurrentDayTokenUsage(u *UserTokenUsage, now time.Time) *UserTokenUsage {
	if u == nil {
		return nil
	}
	if u.TokensByCategory == nil {
		u.TokensByCategory = map[string]int64{}
	}
	if u.UpdatedAt.IsZero() || isSameUTCDay(u.UpdatedAt, now) {
		return u
	}
	return &UserTokenUsage{
		UserID:             u.UserID,
		TokensByCategory:   map[string]int64{},
		LastAgentSessionID: u.LastAgentSessionID,
		UpdatedAt:          now,
	}
}

// GetUserTokenUsage returns the persisted token-usage row for userID, or a
// zero-value struct (UserID set, TotalTokens=0, empty category map, empty
// session marker) when no row exists yet. A missing row is NOT an error —
// every authenticated user is implicitly at 0/0 until they accumulate
// their first delta.
func (s *SQLiteStore) GetUserTokenUsage(ctx context.Context, userID string) (*UserTokenUsage, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	row := s.db.QueryRowContext(ctx,
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
	return normalizeCurrentDayTokenUsage(u, time.Now()), nil
}

// UpdateUserTokenUsage upserts the full token-usage row. Callers pass the
// desired end-state; the stored updated_at timestamp is always rewritten to
// now. Negative totals are clamped to zero (no magic-number literal — 0 is
// the floor for both TotalTokens and every per-category counter).
func (s *SQLiteStore) UpdateUserTokenUsage(ctx context.Context, usage *UserTokenUsage) error {
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

	_, err = s.db.ExecContext(ctx,
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

	now := time.Now()
	current = normalizeCurrentDayTokenUsage(current, now)
	if current == nil {
		current = &UserTokenUsage{
			UserID:           userID,
			TokensByCategory: map[string]int64{},
		}
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

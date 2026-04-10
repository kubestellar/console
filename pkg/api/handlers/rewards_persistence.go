package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// --- Rewards persistence constants (issue #6011) -----------------------------
//
// These values are extracted as named constants to keep the API behavior
// explicit and to comply with the repo-wide "no magic numbers" rule. They
// control daily-bonus cadence, the maximum coin delta a single POST can
// apply, and the payload size ceilings accepted on the PUT endpoint.

const (
	// dailyBonusIntervalHours is how long users must wait between
	// /api/rewards/daily-bonus claims. 24h mirrors the frontend copy.
	dailyBonusIntervalHours = 24
	// dailyBonusPoints is the default bonus amount awarded when the user
	// successfully claims their daily bonus. Kept on the server so the
	// reward scale is not client-controlled.
	dailyBonusPoints = 50
	// maxCoinDeltaPerRequest caps how many coins a single POST /coins call
	// can add or subtract. This is defense-in-depth against a buggy or
	// compromised client trying to mint an unbounded balance in one shot;
	// the legitimate frontend values are in the tens.
	maxCoinDeltaPerRequest = 10_000
	// maxRewardFieldValue is the upper bound enforced on coins/points/level
	// /bonus_points in the PUT endpoint payload. Any sensible balance is
	// far below this.
	maxRewardFieldValue = 100_000_000
)

// RewardsPersistenceHandler serves the per-user reward balance endpoints
// backing issue #6011. Unlike RewardsHandler (which proxies GitHub activity),
// this handler owns mutable server-side state that survives cache clears.
type RewardsPersistenceHandler struct {
	store store.Store
}

// NewRewardsPersistenceHandler wires the handler up to the backing store.
func NewRewardsPersistenceHandler(s store.Store) *RewardsPersistenceHandler {
	return &RewardsPersistenceHandler{store: s}
}

// userRewardsResponse is the JSON shape returned to the frontend. We use
// snake_case fields to match other API responses in this package and omit
// the LastDailyBonusAt field entirely when the user has never claimed.
type userRewardsResponse struct {
	UserID           string `json:"user_id"`
	Coins            int    `json:"coins"`
	Points           int    `json:"points"`
	Level            int    `json:"level"`
	BonusPoints      int    `json:"bonus_points"`
	LastDailyBonusAt string `json:"last_daily_bonus_at,omitempty"`
	UpdatedAt        string `json:"updated_at"`
}

func toResponse(r *store.UserRewards) userRewardsResponse {
	resp := userRewardsResponse{
		UserID:      r.UserID,
		Coins:       r.Coins,
		Points:      r.Points,
		Level:       r.Level,
		BonusPoints: r.BonusPoints,
		UpdatedAt:   r.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if r.LastDailyBonusAt != nil {
		resp.LastDailyBonusAt = r.LastDailyBonusAt.UTC().Format(time.RFC3339)
	}
	return resp
}

// resolveRewardsUserID returns the stable reward key for the current request.
// We prefer the user's UUID; if the UUID is the zero value (e.g. demo-mode
// sessions where no DB user row exists) we fall back to the GitHub login.
// An empty return means the request is unauthenticated and the handler
// should respond with 401.
func resolveRewardsUserID(c *fiber.Ctx) string {
	if id := middleware.GetUserID(c); id.String() != "00000000-0000-0000-0000-000000000000" {
		return id.String()
	}
	if login := middleware.GetGitHubLogin(c); login != "" {
		return login
	}
	return ""
}

// GetUserRewards returns the current user's persisted reward balance.
// GET /api/rewards/me
//
// Zero-value responses are intentional for brand-new users — clients should
// treat the absence of a stored row as "start at 0" without needing an
// error-handling branch.
func (h *RewardsPersistenceHandler) GetUserRewards(c *fiber.Ctx) error {
	userID := resolveRewardsUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	rewards, err := h.store.GetUserRewards(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load rewards"})
	}
	return c.JSON(toResponse(rewards))
}

// putUserRewardsRequest is the request body for PUT /api/rewards/me. All
// fields are optional; missing fields default to zero so clients can use
// this endpoint to replace partial state without re-sending the whole row.
type putUserRewardsRequest struct {
	Coins       int `json:"coins"`
	Points      int `json:"points"`
	Level       int `json:"level"`
	BonusPoints int `json:"bonus_points"`
}

// UpdateUserRewards upserts the entire reward row for the current user.
// PUT /api/rewards/me
//
// Idempotent — callers send their full desired state (typically mirrored
// from their local hydrated state) and the server replaces the row.
func (h *RewardsPersistenceHandler) UpdateUserRewards(c *fiber.Ctx) error {
	userID := resolveRewardsUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body putUserRewardsRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}

	// Input validation — clamp to sane ranges so a misbehaving client cannot
	// poison the DB with absurd balances.
	if body.Coins < store.MinCoinBalance || body.Coins > maxRewardFieldValue {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "coins out of range"})
	}
	if body.Points < 0 || body.Points > maxRewardFieldValue {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "points out of range"})
	}
	if body.Level < store.DefaultUserLevel || body.Level > maxRewardFieldValue {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "level out of range"})
	}
	if body.BonusPoints < 0 || body.BonusPoints > maxRewardFieldValue {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "bonus_points out of range"})
	}

	// Preserve LastDailyBonusAt from the existing row so this endpoint does
	// NOT become a way to reset the daily-bonus cooldown.
	existing, err := h.store.GetUserRewards(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load rewards"})
	}

	rewards := &store.UserRewards{
		UserID:           userID,
		Coins:            body.Coins,
		Points:           body.Points,
		Level:            body.Level,
		BonusPoints:      body.BonusPoints,
		LastDailyBonusAt: existing.LastDailyBonusAt,
	}
	if err := h.store.UpdateUserRewards(rewards); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save rewards"})
	}

	// Re-read to return canonical server-side state (including the fresh
	// updated_at timestamp the store assigned).
	fresh, err := h.store.GetUserRewards(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload rewards"})
	}
	return c.JSON(toResponse(fresh))
}

// postCoinsRequest is the body for POST /api/rewards/coins. Delta is a
// signed 32-bit-fits integer — clients can subtract by sending a negative
// value, subject to the MinCoinBalance clamp.
type postCoinsRequest struct {
	Delta int `json:"delta"`
}

// IncrementCoins atomically applies a delta to the current user's coin
// balance. POST /api/rewards/coins
func (h *RewardsPersistenceHandler) IncrementCoins(c *fiber.Ctx) error {
	userID := resolveRewardsUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body postCoinsRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	if body.Delta == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "delta must be non-zero"})
	}
	if body.Delta > maxCoinDeltaPerRequest || body.Delta < -maxCoinDeltaPerRequest {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "delta exceeds per-request limit"})
	}

	updated, err := h.store.IncrementUserCoins(userID, body.Delta)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to increment coins"})
	}
	return c.JSON(toResponse(updated))
}

// ClaimDailyBonus awards the daily bonus if the cooldown has elapsed.
// POST /api/rewards/daily-bonus
//
// Returns 429 with a structured error when the bonus is on cooldown so the
// frontend can render a "next claim available in X" message without a
// second round-trip.
func (h *RewardsPersistenceHandler) ClaimDailyBonus(c *fiber.Ctx) error {
	userID := resolveRewardsUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	interval := time.Duration(dailyBonusIntervalHours) * time.Hour
	updated, err := h.store.ClaimDailyBonus(userID, dailyBonusPoints, interval, time.Now())
	if err != nil {
		if errors.Is(err, store.ErrDailyBonusUnavailable) {
			// Surface the current state so the UI can still render the
			// existing balances and the timestamp of the last claim.
			current, getErr := h.store.GetUserRewards(userID)
			if getErr == nil {
				resp := toResponse(current)
				return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
					"error":   "daily bonus already claimed",
					"rewards": resp,
				})
			}
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "daily bonus already claimed"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to claim daily bonus"})
	}

	return c.JSON(fiber.Map{
		"rewards":      toResponse(updated),
		"bonus_amount": dailyBonusPoints,
	})
}

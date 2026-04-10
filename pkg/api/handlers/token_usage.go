package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// zeroTokenUserUUID is the all-zeros UUID that middleware.GetUserID returns
// when no DB user row exists (demo-mode / unauth sessions). Declared here
// rather than shared with rewards_persistence.go so the two handler files
// can evolve independently without a cross-file constant dependency.
const zeroTokenUserUUID = "00000000-0000-0000-0000-000000000000"

// --- Token usage persistence constants --------------------------------------
//
// Folded into PR #6032 as a follow-up to #6011: the rewards widget keeps
// its coin/point state in a server-side table, and this handler gives the
// token-budget widget the same treatment. Every literal here is a named
// constant per the repo-wide "no magic numbers" rule.

const (
	// maxTokenDeltaPerRequest caps how many tokens a single POST /delta
	// call can add in one shot. The legitimate frontend delta per-poll is
	// on the order of thousands; 1M is defense-in-depth against a buggy
	// or compromised client trying to inflate a user's usage in one call.
	maxTokenDeltaPerRequest int64 = 1_000_000
	// maxTokenUsageFieldValue is the upper bound on the TotalTokens field
	// of the PUT endpoint payload. 10 billion tokens is orders of
	// magnitude larger than any realistic monthly budget and acts as a
	// sanity ceiling so a corrupted client cannot poison the DB.
	maxTokenUsageFieldValue int64 = 10_000_000_000
	// maxTokenCategories is the ceiling on how many distinct category
	// keys a single PUT payload may carry. The frontend currently knows
	// about 5 categories (missions, diagnose, insights, predictions,
	// other); 32 leaves plenty of room for growth without letting a
	// malicious client create arbitrary string keys.
	maxTokenCategories = 32
)

// TokenUsageHandler serves the per-user token-usage endpoints backing the
// token-budget widget. Each user can read and mutate only their own row —
// there is no cross-user RBAC gate because every query is scoped by the
// JWT-resolved user id.
type TokenUsageHandler struct {
	store store.Store
}

// NewTokenUsageHandler wires the handler up to the backing store.
func NewTokenUsageHandler(s store.Store) *TokenUsageHandler {
	return &TokenUsageHandler{store: s}
}

// userTokenUsageResponse is the JSON shape returned to the frontend. snake_
// case fields match the rest of the API surface in this package.
type userTokenUsageResponse struct {
	UserID             string           `json:"user_id"`
	TotalTokens        int64            `json:"total_tokens"`
	TokensByCategory   map[string]int64 `json:"tokens_by_category"`
	LastAgentSessionID string           `json:"last_agent_session_id"`
	UpdatedAt          string           `json:"updated_at"`
}

func toTokenUsageResponse(u *store.UserTokenUsage) userTokenUsageResponse {
	// Always materialize a non-nil map so the frontend can treat the
	// response as a JS object without a null-check dance.
	cats := u.TokensByCategory
	if cats == nil {
		cats = map[string]int64{}
	}
	return userTokenUsageResponse{
		UserID:             u.UserID,
		TotalTokens:        u.TotalTokens,
		TokensByCategory:   cats,
		LastAgentSessionID: u.LastAgentSessionID,
		UpdatedAt:          u.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// resolveTokenUsageUserID mirrors resolveRewardsUserID (in
// rewards_persistence.go) — prefer the user's UUID, fall back to the GitHub
// login for demo-mode sessions where no DB user row exists. An empty return
// means the request is unauthenticated and the handler should answer 401.
func resolveTokenUsageUserID(c *fiber.Ctx) string {
	if id := middleware.GetUserID(c); id.String() != zeroTokenUserUUID {
		return id.String()
	}
	if login := middleware.GetGitHubLogin(c); login != "" {
		return login
	}
	return ""
}

// GetUserTokenUsage returns the current user's persisted token-usage row.
// GET /api/token-usage/me
func (h *TokenUsageHandler) GetUserTokenUsage(c *fiber.Ctx) error {
	userID := resolveTokenUsageUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	usage, err := h.store.GetUserTokenUsage(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load token usage"})
	}
	return c.JSON(toTokenUsageResponse(usage))
}

// putUserTokenUsageRequest is the request body for POST /api/token-usage/me.
// Clients send their full desired state — typically mirrored from their
// locally-hydrated totals — and the server replaces the row.
type putUserTokenUsageRequest struct {
	TotalTokens        int64            `json:"total_tokens"`
	TokensByCategory   map[string]int64 `json:"tokens_by_category"`
	LastAgentSessionID string           `json:"last_agent_session_id"`
}

// UpdateUserTokenUsage upserts the entire token-usage row for the current
// user. POST /api/token-usage/me (semantic: full upsert, idempotent).
func (h *TokenUsageHandler) UpdateUserTokenUsage(c *fiber.Ctx) error {
	userID := resolveTokenUsageUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body putUserTokenUsageRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}

	if body.TotalTokens < 0 || body.TotalTokens > maxTokenUsageFieldValue {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "total_tokens out of range"})
	}
	if len(body.TokensByCategory) > maxTokenCategories {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "too many category keys"})
	}
	for _, v := range body.TokensByCategory {
		if v < 0 || v > maxTokenUsageFieldValue {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "per-category value out of range"})
		}
	}

	usage := &store.UserTokenUsage{
		UserID:             userID,
		TotalTokens:        body.TotalTokens,
		TokensByCategory:   body.TokensByCategory,
		LastAgentSessionID: body.LastAgentSessionID,
	}
	if err := h.store.UpdateUserTokenUsage(usage); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save token usage"})
	}

	fresh, err := h.store.GetUserTokenUsage(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload token usage"})
	}
	return c.JSON(toTokenUsageResponse(fresh))
}

// postTokenDeltaRequest is the body for POST /api/token-usage/delta. The
// delta field is always non-negative — subtraction is not a legitimate
// operation for usage counters (a "rollback" on error is handled client-
// side by withholding the attribution, not by sending a negative number).
type postTokenDeltaRequest struct {
	Category       string `json:"category"`
	Delta          int64  `json:"delta"`
	AgentSessionID string `json:"agent_session_id"`
}

// AddTokenDelta atomically adds a delta to the current user's total and
// per-category counters. POST /api/token-usage/delta
//
// Restart semantics: if agent_session_id is non-empty and differs from the
// stored marker, the server treats the delta as the first of a new session
// and does NOT add it to the totals — mirroring the frontend's existing
// restart-detection logic so both sides stay in agreement.
func (h *TokenUsageHandler) AddTokenDelta(c *fiber.Ctx) error {
	userID := resolveTokenUsageUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body postTokenDeltaRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	if body.Category == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "category is required"})
	}
	if body.Delta < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "delta must be non-negative"})
	}
	if body.Delta > maxTokenDeltaPerRequest {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "delta exceeds per-request limit"})
	}

	updated, err := h.store.AddUserTokenDelta(userID, body.Category, body.Delta, body.AgentSessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to add token delta"})
	}
	return c.JSON(toTokenUsageResponse(updated))
}

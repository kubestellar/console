package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// maxOnboardingResponses is the maximum number of responses accepted in a
	// single SaveResponses call. Prevents a caller from posting unbounded data
	// that would exhaust connection pools with individual writes (#7005).
	maxOnboardingResponses = 50

	// maxQuestionKeyLength is the maximum length of a QuestionKey field in an
	// onboarding response (#7005).
	maxQuestionKeyLength = 128

	// maxAnswerLength is the maximum length of an Answer field in an onboarding
	// response (#7005).
	maxAnswerLength = 1024
)

// OnboardingHandler handles onboarding operations
type OnboardingHandler struct {
	store store.Store
}

// NewOnboardingHandler creates a new onboarding handler
func NewOnboardingHandler(s store.Store) *OnboardingHandler {
	return &OnboardingHandler{store: s}
}

// GetQuestions returns the onboarding questions
func (h *OnboardingHandler) GetQuestions(c *fiber.Ctx) error {
	return c.JSON(models.GetOnboardingQuestions())
}

// SaveResponses saves onboarding responses
func (h *OnboardingHandler) SaveResponses(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var responses []struct {
		QuestionKey string `json:"question_key"`
		Answer      string `json:"answer"`
	}
	if err := c.BodyParser(&responses); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Cap the number of responses to prevent unbounded writes (#7005).
	if len(responses) > maxOnboardingResponses {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("Too many responses (%d), maximum is %d", len(responses), maxOnboardingResponses))
	}

	// Validate field lengths before persisting anything (#7005).
	for i, r := range responses {
		if r.QuestionKey == "" {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("response[%d]: question_key is required", i))
		}
		if len(r.QuestionKey) > maxQuestionKeyLength {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("response[%d]: question_key exceeds %d characters", i, maxQuestionKeyLength))
		}
		if len(r.Answer) > maxAnswerLength {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("response[%d]: answer exceeds %d characters", i, maxAnswerLength))
		}
	}

	for _, r := range responses {
		response := &models.OnboardingResponse{
			UserID:      userID,
			QuestionKey: r.QuestionKey,
			Answer:      r.Answer,
		}
		if err := h.store.SaveOnboardingResponse(c.UserContext(), response); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to save response")
		}
	}

	return c.JSON(fiber.Map{"status": "ok", "saved": len(responses)})
}

// CompleteOnboarding marks onboarding as complete and creates default dashboard
func (h *OnboardingHandler) CompleteOnboarding(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	// Get user's responses
	responses, err := h.store.GetOnboardingResponses(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get responses")
	}

	// Generate default dashboard based on responses
	cards := generateDefaultCards(responses)

	// Create default dashboard
	dashboard := &models.Dashboard{
		UserID:    userID,
		Name:      "My Dashboard",
		IsDefault: true,
	}
	if err := h.store.CreateDashboard(c.UserContext(), dashboard); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create dashboard")
	}

	// Create cards
	for i, card := range cards {
		card.DashboardID = dashboard.ID
		card.Position = models.CardPosition{
			X: (i % 3) * 4,
			Y: (i / 3) * 3,
			W: 4,
			H: 3,
		}
		if err := h.store.CreateCard(c.UserContext(), &card); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to create card")
		}
	}

	// Mark user as onboarded
	if err := h.store.SetUserOnboarded(c.UserContext(), userID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to complete onboarding")
	}

	return c.JSON(fiber.Map{
		"status":       "completed",
		"dashboard_id": dashboard.ID,
	})
}

// generateDefaultCards creates initial cards based on onboarding responses
func generateDefaultCards(responses []models.OnboardingResponse) []models.Card {
	// Build a map of responses
	respMap := make(map[string]string)
	for _, r := range responses {
		respMap[r.QuestionKey] = r.Answer
	}

	cards := make([]models.Card, 0)

	// Always include cluster health
	cards = append(cards, models.Card{
		ID:       uuid.New(),
		CardType: models.CardTypeClusterHealth,
	})

	// Based on role
	switch respMap["role"] {
	case "SRE", "DevOps":
		cards = append(cards,
			models.Card{ID: uuid.New(), CardType: models.CardTypePodIssues},
			models.Card{ID: uuid.New(), CardType: models.CardTypeEventStream},
		)
	case "Platform Engineer":
		cards = append(cards,
			models.Card{ID: uuid.New(), CardType: models.CardTypeDeploymentIssues},
			models.Card{ID: uuid.New(), CardType: models.CardTypeUpgradeStatus},
		)
	case "Developer":
		cards = append(cards,
			models.Card{ID: uuid.New(), CardType: models.CardTypeAppStatus},
			models.Card{ID: uuid.New(), CardType: models.CardTypeDeploymentProgress},
		)
	}

	// Based on focus layer
	switch respMap["focus_layer"] {
	case "Application":
		cards = append(cards, models.Card{ID: uuid.New(), CardType: models.CardTypeAppStatus})
	case "Infrastructure (nodes, storage)":
		cards = append(cards, models.Card{ID: uuid.New(), CardType: models.CardTypeResourceCapacity})
	}

	// GitOps users
	if respMap["gitops"] == "Yes, heavily" || respMap["gitops"] == "Sometimes" {
		cards = append(cards, models.Card{ID: uuid.New(), CardType: models.CardTypeGitOpsDrift})
	}

	// Security focus — check both singular (legacy) and plural (ranked-choice) keys
	monitoringPriority := respMap["monitoring_priority"]
	if monitoringPriority == "" {
		monitoringPriority = respMap["monitoring_priorities"]
	}
	if monitoringPriority == "Security" || strings.Contains(monitoringPriority, "Security") {
		cards = append(cards,
			models.Card{ID: uuid.New(), CardType: models.CardTypeSecurityIssues},
			models.Card{ID: uuid.New(), CardType: models.CardTypePolicyViolations},
		)
	}

	// GPU workloads
	if respMap["gpu_workloads"] == "Yes" {
		// Add config for GPU filtering
		gpuConfig, err := json.Marshal(map[string]string{"resource_type": "gpu"})
		if err != nil {
			slog.Error("[Onboarding] failed to marshal GPU config", "error", err)
			gpuConfig = []byte(`{"resource_type":"gpu"}`)
		}
		cards = append(cards, models.Card{
			ID:       uuid.New(),
			CardType: models.CardTypeResourceCapacity,
			Config:   gpuConfig,
		})
	}

	// Regulated environment
	if respMap["regulated"] == "Yes (compliance important)" {
		cards = append(cards,
			models.Card{ID: uuid.New(), CardType: models.CardTypeRBACOverview},
			models.Card{ID: uuid.New(), CardType: models.CardTypePolicyViolations},
		)
	}

	// Deduplicate cards by type
	seen := make(map[models.CardType]bool)
	unique := make([]models.Card, 0)
	for _, card := range cards {
		if !seen[card.CardType] {
			seen[card.CardType] = true
			unique = append(unique, card)
		}
	}

	// Limit to 9 cards for a 3x3 grid
	if len(unique) > 9 {
		unique = unique[:9]
	}

	return unique
}

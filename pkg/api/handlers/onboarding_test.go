package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupOnboardingTest creates a Fiber app with an OnboardingHandler backed by a MockStore.
// A middleware injects the given userID into Fiber locals so middleware.GetUserID works.
func setupOnboardingTest(userID uuid.UUID) (*fiber.App, *test.MockStore, *OnboardingHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewOnboardingHandler(mockStore)

	// Inject userID into context (simulates auth middleware)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	return app, mockStore, handler
}

// ---------- GetQuestions ----------

func TestGetQuestions_ReturnsNonEmpty(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupOnboardingTest(userID)
	app.Get("/api/onboarding/questions", handler.GetQuestions)

	req, err := http.NewRequest("GET", "/api/onboarding/questions", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var questions []models.OnboardingQuestion
	require.NoError(t, json.Unmarshal(body, &questions))
	assert.Greater(t, len(questions), 0, "Expected at least one onboarding question")

	// Verify structure of first question
	assert.NotEmpty(t, questions[0].Key)
	assert.NotEmpty(t, questions[0].Question)
	assert.Greater(t, len(questions[0].Options), 0, "Expected at least one option per question")
}

// ---------- SaveResponses ----------

func TestSaveResponses_Success(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupOnboardingTest(userID)
	app.Post("/api/onboarding/responses", handler.SaveResponses)

	payload := `[{"question_key":"role","answer":"SRE"},{"question_key":"focus_layer","answer":"Application"}]`
	req, err := http.NewRequest("POST", "/api/onboarding/responses", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Equal(t, "ok", result["status"])

	// expectedSavedCount is the number of responses in the request payload.
	const expectedSavedCount = 2
	assert.Equal(t, float64(expectedSavedCount), result["saved"])
}

func TestSaveResponses_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupOnboardingTest(userID)
	app.Post("/api/onboarding/responses", handler.SaveResponses)

	req, err := http.NewRequest("POST", "/api/onboarding/responses", strings.NewReader("not-json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- CompleteOnboarding ----------

func TestCompleteOnboarding_Success(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupOnboardingTest(userID)
	app.Post("/api/onboarding/complete", handler.CompleteOnboarding)

	// MockStore stubs return nil/nil for GetOnboardingResponses, CreateDashboard,
	// CreateCard, SetUserOnboarded — all succeed silently with default behavior.
	req, err := http.NewRequest("POST", "/api/onboarding/complete", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Equal(t, "completed", result["status"])
	assert.NotEmpty(t, result["dashboard_id"])
}

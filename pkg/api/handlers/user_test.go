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

// setupUserTest creates a Fiber app with a UserHandler backed by a MockStore.
// A middleware injects the given userID into Fiber locals so middleware.GetUserID works.
func setupUserTest(userID uuid.UUID) (*fiber.App, *test.MockStore, *UserHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewUserHandler(mockStore)

	// Inject userID into context (simulates auth middleware)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	return app, mockStore, handler
}

// ---------- GetCurrentUser ----------

func TestGetCurrentUser_Success(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Get("/api/user", handler.GetCurrentUser)

	expectedUser := &models.User{
		ID:          userID,
		GitHubID:    "gh-123",
		GitHubLogin: "testuser",
		Email:       "test@example.com",
		Role:        "editor",
		Onboarded:   true,
	}
	mockStore.On("GetUser", userID).Return(expectedUser, nil).Once()

	req, err := http.NewRequest("GET", "/api/user", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var user models.User
	require.NoError(t, json.Unmarshal(body, &user))
	assert.Equal(t, userID, user.ID)
	assert.Equal(t, "testuser", user.GitHubLogin)
	assert.Equal(t, "test@example.com", user.Email)
}

func TestGetCurrentUser_NotFound(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Get("/api/user", handler.GetCurrentUser)

	mockStore.On("GetUser", userID).Return(nil, nil).Once()

	req, err := http.NewRequest("GET", "/api/user", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- UpdateCurrentUser ----------

func TestUpdateCurrentUser_Success(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Put("/api/user", handler.UpdateCurrentUser)

	existingUser := &models.User{
		ID:          userID,
		GitHubLogin: "testuser",
		Email:       "old@example.com",
	}
	mockStore.On("GetUser", userID).Return(existingUser, nil).Once()
	mockStore.On("UpdateUser", existingUser).Return(nil).Once()

	payload := `{"email":"new@example.com","slackId":"U12345"}`
	req, err := http.NewRequest("PUT", "/api/user", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var user models.User
	require.NoError(t, json.Unmarshal(body, &user))
	assert.Equal(t, "new@example.com", user.Email)
	assert.Equal(t, "U12345", user.SlackID)
}

func TestUpdateCurrentUser_NotFound(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Put("/api/user", handler.UpdateCurrentUser)

	mockStore.On("GetUser", userID).Return(nil, nil).Once()

	payload := `{"email":"new@example.com"}`
	req, err := http.NewRequest("PUT", "/api/user", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestUpdateCurrentUser_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Put("/api/user", handler.UpdateCurrentUser)

	existingUser := &models.User{
		ID:          userID,
		GitHubLogin: "testuser",
	}
	mockStore.On("GetUser", userID).Return(existingUser, nil).Once()

	req, err := http.NewRequest("PUT", "/api/user", strings.NewReader("not-json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestUpdateCurrentUser_InvalidEmail verifies that a missing "@" in the email
// payload returns 400 and does NOT call UpdateUser on the store (#7855 / #7815).
func TestUpdateCurrentUser_InvalidEmail(t *testing.T) {
	userID := uuid.New()
	app, mockStore, handler := setupUserTest(userID)
	app.Put("/api/user", handler.UpdateCurrentUser)

	existingUser := &models.User{
		ID:          userID,
		GitHubLogin: "testuser",
		Email:       "old@example.com",
	}
	mockStore.On("GetUser", userID).Return(existingUser, nil).Once()
	// Deliberately do NOT register a UpdateUser expectation — the handler
	// must bail out before calling the store.

	payload := `{"email":"not-an-email"}`
	req, err := http.NewRequest("PUT", "/api/user", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	// AssertExpectations fails the test if any unexpected call (e.g. UpdateUser)
	// was made, which is exactly what we want to verify.
	mockStore.AssertExpectations(t)
	mockStore.AssertNotCalled(t, "UpdateUser")
}

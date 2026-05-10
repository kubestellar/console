package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestListFeatureRequests(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{})

	userID := uuid.New()
	app.Get("/api/feedback/requests", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return handler.ListFeatureRequests(c)
	})

	t.Run("Success", func(t *testing.T) {
		mockRequests := []models.FeatureRequest{
			{ID: uuid.New(), Title: "Triaged Request", Status: models.RequestStatusTriageAccepted},
			{ID: uuid.New(), Title: "Untriaged Request", Status: models.RequestStatusOpen},
		}
		mockStore.On("GetUserFeatureRequests", userID, 0, 0).Return(mockRequests, nil)
		mockStore.On("CountUserPendingFeatureRequests", userID).Return(1, nil)

		req := httptest.NewRequest("GET", "/api/feedback/requests", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result struct {
			Items         []models.FeatureRequest `json:"items"`
			Total         int                     `json:"total"`
			PendingReview int                     `json:"pending_review"`
		}
		json.NewDecoder(resp.Body).Decode(&result)

		// Should only return triaged requests
		assert.Len(t, result.Items, 1)
		assert.Equal(t, "Triaged Request", result.Items[0].Title)
		assert.Equal(t, 2, result.Total)
		assert.Equal(t, 1, result.PendingReview)
	})
}

func TestCheckPreviewStatus(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	// Set a token so it doesn't return "unavailable"
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "token"})

	app.Get("/api/feedback/requests/preview/:pr_number", handler.CheckPreviewStatus)

	t.Run("InvalidPRNumber", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/feedback/requests/preview/abc", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}

func TestGetIssueLinkCapabilities(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://ghe.example.com")

	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "token", RepoOwner: "kubestellar", RepoName: "console"})
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		assert.Equal(t, "Bearer user-client-token", req.Header.Get("Authorization"))
		assert.Equal(t, "https://ghe.example.com/api/v3/repos/kubestellar/console", req.URL.String())
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":true}}`)),
			Header:     make(http.Header),
		}
	})}

	app.Get("/api/feedback/issue-link-capabilities", func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return handler.GetIssueLinkCapabilities(c)
	})

	req := httptest.NewRequest("GET", "/api/feedback/issue-link-capabilities?target_repo=console", nil)
	req.Header.Set("X-KC-Client-Auth", "user-client-token")
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result struct {
		CanLinkParent bool `json:"can_link_parent"`
	}
	assert.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.True(t, result.CanLinkParent)
}

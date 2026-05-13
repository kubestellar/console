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

func TestListAllFeatureRequestsPreservesResolvedGitHubStatus(t *testing.T) {
	const issueNumber = 13486
	const issueResponse = `[
		{
			"number": 13486,
			"title": "Closed issue should stay resolved",
			"body": "Resolved on GitHub but stale in DB",
			"state": "open",
			"html_url": "https://github.com/kubestellar/console/issues/13486",
			"created_at": "2025-01-01T00:00:00Z",
			"updated_at": "2025-01-02T00:00:00Z",
			"user": {"login": "reporter", "id": 42},
			"labels": [{"name": "fix-complete"}]
		}
	]`

	cases := []struct {
		name         string
		storedStatus models.RequestStatus
		closedByUser bool
		wantStatus   string
	}{
		{
			name:         "keeps fix complete when stored status is open",
			storedStatus: models.RequestStatusOpen,
			wantStatus:   string(models.RequestStatusFixComplete),
		},
		{
			name:         "keeps fix complete when stored status needs triage",
			storedStatus: models.RequestStatusNeedsTriage,
			wantStatus:   string(models.RequestStatusFixComplete),
		},
		{
			name:         "shows closed when reporter verified fix",
			storedStatus: models.RequestStatusClosed,
			closedByUser: true,
			wantStatus:   string(models.RequestStatusClosed),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "token", RepoOwner: "kubestellar", RepoName: "console"})
			handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				switch {
				case req.URL.Path == "/repos/kubestellar/console/issues":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(issueResponse)),
						Header:     make(http.Header),
					}
				case req.URL.Path == "/repos/kubestellar/docs/issues":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`[]`)),
						Header:     make(http.Header),
					}
				case req.URL.Path == "/repos/kubestellar/console/pulls":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`[]`)),
						Header:     make(http.Header),
					}
				default:
					t.Fatalf("unexpected GitHub request: %s", req.URL.String())
					return &http.Response{
						StatusCode: http.StatusInternalServerError,
						Body:       io.NopCloser(strings.NewReader(`{}`)),
						Header:     make(http.Header),
					}
				}
			})}

			userID := uuid.New()
			storedRequest := models.FeatureRequest{
				ID:                uuid.New(),
				UserID:            userID,
				TargetRepo:        models.TargetRepoConsole,
				GitHubIssueNumber: func() *int { n := issueNumber; return &n }(),
				Status:            tc.storedStatus,
				ClosedByUser:      tc.closedByUser,
			}
			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, GitHubLogin: "reporter"}, nil).Once()
			mockStore.On("GetUserFeatureRequests", userID, 0, 0).Return([]models.FeatureRequest{storedRequest}, nil).Once()

			app.Get("/api/feedback/queue", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return handler.ListAllFeatureRequests(c)
			})

			req := httptest.NewRequest("GET", "/api/feedback/queue", nil)
			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, http.StatusOK, resp.StatusCode)

			var result []QueueItem
			assert.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
			assert.Len(t, result, 1)
			assert.Equal(t, storedRequest.ID.String(), result[0].ID)
			assert.Equal(t, tc.wantStatus, result[0].Status)
			assert.Equal(t, tc.closedByUser, result[0].ClosedByUser)
			mockStore.AssertExpectations(t)
		})
	}
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

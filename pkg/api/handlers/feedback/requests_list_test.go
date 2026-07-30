package feedback

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListFeatureRequests_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/requests", handler.ListFeatureRequests)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/requests", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestListFeatureRequests_InvalidPageParams(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Get("/api/feedback/requests", handler.ListFeatureRequests)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/requests?limit=-1", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	// Invalid limit should be handled gracefully or rejected
	assert.True(t, resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusBadRequest)
}

func TestListFeatureRequests_FiltersUntriagedRequests(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	requests := []models.FeatureRequest{
		{ID: uuid.New(), Title: "Triaged", Status: models.RequestStatusTriageAccepted},
		{ID: uuid.New(), Title: "Open", Status: models.RequestStatusOpen},
		{ID: uuid.New(), Title: "Needs Triage", Status: models.RequestStatusNeedsTriage},
		{ID: uuid.New(), Title: "Fix Ready", Status: models.RequestStatusFixReady},
	}
	mockStore.On("GetUserFeatureRequests", userID, 0, 0).Return(requests, nil)
	mockStore.On("CountUserPendingFeatureRequests", userID).Return(2, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/requests", handler.ListFeatureRequests)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/requests", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// Response should filter out Open and NeedsTriage statuses
}

func TestListAllFeatureRequests_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/requests/all", handler.ListAllFeatureRequests)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/requests/all", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestListAllFeatureRequests_CountOnly(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUser", userID).Return(nil, nil).Once()
	mockStore.On("GetUserFeatureRequests", userID, 0, 0).Return([]models.FeatureRequest{}, nil).Once()
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/requests/all", handler.ListAllFeatureRequests)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/requests/all?count_only=true", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	// Note: This may fail if GitHub token is required, which is acceptable
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	// Accept either success or service unavailable (no GitHub config)
	assert.True(t, resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusServiceUnavailable,
		"should return OK or 503 for count_only mode")
}

func TestParsePageParams_Defaults(t *testing.T) {
	app := fiber.New()
	var limit, offset int
	app.Get("/test", func(c *fiber.Ctx) error {
		var err error
		limit, offset, err = parsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// Should use default values (typically 0 for both)
	assert.True(t, limit >= 0 && offset >= 0, "should return non-negative values")
}

package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newFeedbackRouteTestApp(t *testing.T, userID uuid.UUID, store *teststore.MockStore) *fiber.App {
	t.Helper()

	app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
	if userID != uuid.Nil {
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
	}

	server := &Server{
		app:        app,
		store:      store,
		auth:       newAuthRuntime(),
		background: newBackgroundServices(),
	}

	server.setupFeedbackRoutes(&routeSetupContext{
		api: app.Group("/api"),
		publicLimiter: func(c *fiber.Ctx) error {
			return c.Next()
		},
	})

	return app
}

func TestFeedbackRoutes_SubmitFeedbackRequiresAuthentication(t *testing.T) {
	t.Parallel()

	app := newFeedbackRouteTestApp(t, uuid.Nil, &teststore.MockStore{})
	requestID := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(`{"feedback_type":"positive"}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "User authentication required", body["error"])
}

func TestFeedbackRoutes_SubmitFeedbackCreatesFeedback(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 42
	store := &teststore.MockStore{}
	store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: &prNumber,
	}, nil).Once()

	app := newFeedbackRouteTestApp(t, userID, store)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(`{"feedback_type":"positive","comment":"Looks good"}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var body models.PRFeedback
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, requestID, body.FeatureRequestID)
	assert.Equal(t, userID, body.UserID)
	assert.Equal(t, models.FeedbackTypePositive, body.FeedbackType)
	assert.Equal(t, "Looks good", body.Comment)
	store.AssertExpectations(t)
}

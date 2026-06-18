package feedback

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type syncFeedbackStoreStub struct {
	*feedbackStoreStub
	createPRFeedbackErr  error
	capturedCreatePRBody *models.PRFeedback
}

var unauthenticatedUserID = uuid.Nil

func (s *syncFeedbackStoreStub) CreatePRFeedback(_ context.Context, feedback *models.PRFeedback) error {
	s.capturedCreatePRBody = feedback
	return s.createPRFeedbackErr
}

func setupFeedbackTestWithSyncStore(t *testing.T, userID uuid.UUID, store *syncFeedbackStoreStub) (*fiber.App, *FeedbackHandler) {
	t.Helper()
	app := fiber.New()
	handler := NewFeedbackHandler(store, FeedbackConfig{})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	return app, handler
}

func TestSyncHandlers_CloseRequest_GitHubID_NoGitHubLoginForbidden(t *testing.T) {
	userID := uuid.New()
	store := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, handler := setupFeedbackTest(t, userID, "", store)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/gh-42/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "GitHub login not available")
}

func TestSyncHandlers_CloseRequest_UUID_HappyPath(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	initial := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusFixComplete}
	updated := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusClosed, ClosedByUser: true}

	store := &feedbackStoreStub{MockStore: &test.MockStore{}}
	store.On("GetFeatureRequest", requestID).Return(initial, nil).Once()
	store.On("CloseFeatureRequest", requestID, true).Return(nil).Once()
	store.On("GetFeatureRequest", requestID).Return(updated, nil).Once()

	app, handler := setupFeedbackTest(t, userID, "", store)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", strings.NewReader(`{"user_verified":true}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, models.RequestStatusClosed, body.Status)
	assert.True(t, body.ClosedByUser)
	store.AssertExpectations(t)
}

func TestSyncHandlers_ReopenRequest_ValidationAndAuthorization(t *testing.T) {
	longComment := strings.Repeat("x", maxVerificationCommentChars+1)
	requestID := uuid.New()

	tests := []struct {
		name        string
		userID      uuid.UUID
		githubLogin string
		id          string
		body        string
		storeSetup  func(*feedbackStoreStub)
		wantStatus  int
		wantText    string
	}{
		{
			name:       "unauthenticated",
			userID:     unauthenticatedUserID,
			id:         requestID.String(),
			body:       `{"comment":"still broken"}`,
			wantStatus: http.StatusUnauthorized,
			wantText:   "User authentication required",
		},
		{
			name:       "empty comment",
			userID:     uuid.New(),
			id:         requestID.String(),
			body:       `{"comment":"   "}`,
			wantStatus: http.StatusBadRequest,
			wantText:   "Comment is required",
		},
		{
			name:       "too long comment",
			userID:     uuid.New(),
			id:         requestID.String(),
			body:       `{"comment":"` + longComment + `"}`,
			wantStatus: http.StatusBadRequest,
			wantText:   "Comment is too long",
		},
		{
			name:       "github id without github login",
			userID:     uuid.New(),
			id:         "gh-88",
			body:       `{"comment":"still broken"}`,
			wantStatus: http.StatusForbidden,
			wantText:   "GitHub login not available",
		},
		{
			name:   "other user request",
			userID: uuid.New(),
			id:     requestID.String(),
			body:   `{"comment":"still broken"}`,
			storeSetup: func(store *feedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: uuid.New()}, nil).Once()
			},
			wantStatus: http.StatusForbidden,
			wantText:   "Access denied",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &feedbackStoreStub{MockStore: &test.MockStore{}}
			if tt.storeSetup != nil {
				tt.storeSetup(store)
			}
			app, handler := setupFeedbackTest(t, tt.userID, tt.githubLogin, store)
			app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

			req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+tt.id+"/reopen", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			assert.Contains(t, readBody(t, resp), tt.wantText)
			store.AssertExpectations(t)
		})
	}
}

func TestSyncHandlers_ReopenRequest_UUID_HappyPath(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	initial := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusFixComplete}
	updated := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusTriageAccepted, LatestComment: "still broken"}

	store := &feedbackStoreStub{MockStore: &test.MockStore{}}
	store.On("GetFeatureRequest", requestID).Return(initial, nil).Once()
	store.On("UpdateFeatureRequestLatestComment", requestID, "still broken").Return(nil).Once()
	store.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil).Once()
	store.On("GetFeatureRequest", requestID).Return(updated, nil).Once()

	app, handler := setupFeedbackTest(t, userID, "", store)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(`{"comment":"still broken"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, models.RequestStatusTriageAccepted, body.Status)
	assert.Equal(t, "still broken", body.LatestComment)
	store.AssertExpectations(t)
}

func TestSyncHandlers_RequestUpdate_UUIDFlow(t *testing.T) {
	requestID := uuid.New()
	ownerID := uuid.New()
	ownerRequest := &models.FeatureRequest{ID: requestID, UserID: ownerID}

	tests := []struct {
		name       string
		userID     uuid.UUID
		id         string
		storeSetup func(*feedbackStoreStub)
		wantStatus int
		wantText   string
	}{
		{
			name:       "unauthenticated uuid",
			userID:     unauthenticatedUserID,
			id:         requestID.String(),
			wantStatus: http.StatusUnauthorized,
			wantText:   "User authentication required",
		},
		{
			name:       "invalid uuid",
			userID:     uuid.New(),
			id:         "not-a-uuid",
			wantStatus: http.StatusBadRequest,
			wantText:   "Invalid request ID",
		},
		{
			name:   "other users request",
			userID: uuid.New(),
			id:     requestID.String(),
			storeSetup: func(store *feedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(ownerRequest, nil).Once()
			},
			wantStatus: http.StatusForbidden,
			wantText:   "Access denied",
		},
		{
			name:   "happy path",
			userID: ownerID,
			id:     requestID.String(),
			storeSetup: func(store *feedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(ownerRequest, nil).Once()
			},
			wantStatus: http.StatusOK,
			wantText:   requestID.String(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &feedbackStoreStub{MockStore: &test.MockStore{}}
			if tt.storeSetup != nil {
				tt.storeSetup(store)
			}
			app, handler := setupFeedbackTest(t, tt.userID, "", store)
			app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

			req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+tt.id+"/update", nil)
			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			assert.Contains(t, readBody(t, resp), tt.wantText)
			store.AssertExpectations(t)
		})
	}
}

func TestSyncHandlers_SubmitFeedback_ValidationAuthorizationAndHappyPath(t *testing.T) {
	requestID := uuid.New()
	ownerID := uuid.New()
	otherID := uuid.New()
	prNumber := 123

	tests := []struct {
		name       string
		userID     uuid.UUID
		id         string
		body       string
		store      *syncFeedbackStoreStub
		storeSetup func(*syncFeedbackStoreStub)
		wantStatus int
		wantText   string
	}{
		{
			name:       "unauthenticated",
			userID:     unauthenticatedUserID,
			id:         requestID.String(),
			body:       `{"feedback_type":"positive"}`,
			store:      &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			wantStatus: http.StatusUnauthorized,
			wantText:   "User authentication required",
		},
		{
			name:       "invalid request id",
			userID:     ownerID,
			id:         "not-a-uuid",
			body:       `{"feedback_type":"positive"}`,
			store:      &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			wantStatus: http.StatusBadRequest,
			wantText:   "Invalid request ID",
		},
		{
			name:       "invalid feedback type",
			userID:     ownerID,
			id:         requestID.String(),
			body:       `{"feedback_type":"maybe"}`,
			store:      &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			wantStatus: http.StatusBadRequest,
			wantText:   "Feedback type must be 'positive' or 'negative'",
		},
		{
			name:   "request not found",
			userID: ownerID,
			id:     requestID.String(),
			body:   `{"feedback_type":"positive"}`,
			store:  &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			storeSetup: func(store *syncFeedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(nil, nil).Once()
			},
			wantStatus: http.StatusNotFound,
			wantText:   "Feature request not found",
		},
		{
			name:   "other users request",
			userID: ownerID,
			id:     requestID.String(),
			body:   `{"feedback_type":"negative"}`,
			store:  &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			storeSetup: func(store *syncFeedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: otherID, PRNumber: &prNumber}, nil).Once()
			},
			wantStatus: http.StatusForbidden,
			wantText:   "Access denied",
		},
		{
			name:   "missing pr number",
			userID: ownerID,
			id:     requestID.String(),
			body:   `{"feedback_type":"negative"}`,
			store:  &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			storeSetup: func(store *syncFeedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: ownerID}, nil).Once()
			},
			wantStatus: http.StatusBadRequest,
			wantText:   "No PR available for feedback",
		},
		{
			name:   "store create feedback error",
			userID: ownerID,
			id:     requestID.String(),
			body:   `{"feedback_type":"positive","comment":"still broken"}`,
			store: &syncFeedbackStoreStub{
				feedbackStoreStub:   &feedbackStoreStub{MockStore: &test.MockStore{}},
				createPRFeedbackErr: assert.AnError,
			},
			storeSetup: func(store *syncFeedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: ownerID, PRNumber: &prNumber}, nil).Once()
			},
			wantStatus: http.StatusInternalServerError,
			wantText:   "Failed to submit feedback",
		},
		{
			name:   "happy path",
			userID: ownerID,
			id:     requestID.String(),
			body:   `{"feedback_type":"positive","comment":"works now"}`,
			store:  &syncFeedbackStoreStub{feedbackStoreStub: &feedbackStoreStub{MockStore: &test.MockStore{}}},
			storeSetup: func(store *syncFeedbackStoreStub) {
				store.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: ownerID, PRNumber: &prNumber}, nil).Once()
			},
			wantStatus: http.StatusCreated,
			wantText:   "works now",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.storeSetup != nil {
				tt.storeSetup(tt.store)
			}
			app, handler := setupFeedbackTestWithSyncStore(t, tt.userID, tt.store)
			app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

			req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+tt.id+"/feedback", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			assert.Contains(t, readBody(t, resp), tt.wantText)
			if tt.wantStatus == http.StatusCreated {
				require.NotNil(t, tt.store.capturedCreatePRBody)
				assert.Equal(t, requestID, tt.store.capturedCreatePRBody.FeatureRequestID)
				assert.Equal(t, ownerID, tt.store.capturedCreatePRBody.UserID)
				assert.Equal(t, models.FeedbackTypePositive, tt.store.capturedCreatePRBody.FeedbackType)
				assert.Equal(t, "works now", tt.store.capturedCreatePRBody.Comment)
			}
			tt.store.AssertExpectations(t)
		})
	}
}

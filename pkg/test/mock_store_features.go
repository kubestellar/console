package test

import (
	"context"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (m *MockStore) CreateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error {
	args := m.Called(request)
	return args.Error(0)
}
func (m *MockStore) GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.FeatureRequest), args.Error(1)
}
func (m *MockStore) GetFeatureRequestByIssueNumber(ctx context.Context, issueNumber int) (*models.FeatureRequest, error) {
	args := m.Called(issueNumber)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.FeatureRequest), args.Error(1)
}
func (m *MockStore) GetFeatureRequestsByIssueNumbers(ctx context.Context, issueNumbers []int) ([]*models.FeatureRequest, error) {
	args := m.Called(issueNumbers)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.FeatureRequest), args.Error(1)
}
func (m *MockStore) GetFeatureRequestByPRNumber(ctx context.Context, prNumber int) (*models.FeatureRequest, error) {
	args := m.Called(prNumber)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.FeatureRequest), args.Error(1)
}
func (m *MockStore) GetUserFeatureRequests(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error) {
	args := m.Called(userID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.FeatureRequest), args.Error(1)
}
func (m *MockStore) CountUserPendingFeatureRequests(ctx context.Context, userID uuid.UUID) (int, error) {
	args := m.Called(userID)
	return args.Int(0), args.Error(1)
}
func (m *MockStore) GetAllFeatureRequests(ctx context.Context, limit, offset int) ([]models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) UpdateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error {
	return nil
}
func (m *MockStore) UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error {
	args := m.Called(id, status)
	return args.Error(0)
}
func (m *MockStore) CloseFeatureRequest(ctx context.Context, id uuid.UUID, closedByUser bool) error {
	args := m.Called(id, closedByUser)
	return args.Error(0)
}
func (m *MockStore) UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error {
	args := m.Called(id, prNumber, prURL)
	return args.Error(0)
}
func (m *MockStore) UpdateFeatureRequestPreview(ctx context.Context, id uuid.UUID, previewURL string) error {
	args := m.Called(id, previewURL)
	return args.Error(0)
}
func (m *MockStore) UpdateFeatureRequestLatestComment(ctx context.Context, id uuid.UUID, comment string) error {
	args := m.Called(id, comment)
	return args.Error(0)
}

func (m *MockStore) CreatePRFeedback(ctx context.Context, feedback *models.PRFeedback) error {
	return nil
}
func (m *MockStore) GetPRFeedback(ctx context.Context, featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	return nil, nil
}

func (m *MockStore) CreateNotification(ctx context.Context, notification *models.Notification) error {
	args := m.Called(notification)
	return args.Error(0)
}
func (m *MockStore) GetUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error) {
	return nil, nil
}
func (m *MockStore) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	return 0, nil
}
func (m *MockStore) MarkNotificationReadByUser(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}
func (m *MockStore) MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error { return nil }

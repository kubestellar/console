package test

import (
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/mock"
)

// MockStore is a mock implementation of store.Store
type MockStore struct {
	mock.Mock
}

func (m *MockStore) GetUser(id uuid.UUID) (*models.User, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) GetUserByGitHubID(githubID string) (*models.User, error) {
	args := m.Called(githubID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) CreateUser(user *models.User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateUser(user *models.User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateLastLogin(userID uuid.UUID) error {
	args := m.Called(userID)
	return args.Error(0)
}

// Implement other methods as needed or with empty mocks

func (m *MockStore) ListUsers() ([]models.User, error)                  { return nil, nil }
func (m *MockStore) DeleteUser(id uuid.UUID) error                      { return nil }
func (m *MockStore) UpdateUserRole(userID uuid.UUID, role string) error { return nil }
func (m *MockStore) CountUsersByRole() (int, int, int, error)           { return 0, 0, 0, nil }

func (m *MockStore) SaveOnboardingResponse(response *models.OnboardingResponse) error { return nil }
func (m *MockStore) GetOnboardingResponses(userID uuid.UUID) ([]models.OnboardingResponse, error) {
	return nil, nil
}
func (m *MockStore) SetUserOnboarded(userID uuid.UUID) error { return nil }

func (m *MockStore) GetDashboard(id uuid.UUID) (*models.Dashboard, error)            { return nil, nil }
func (m *MockStore) GetUserDashboards(userID uuid.UUID) ([]models.Dashboard, error)  { return nil, nil }
func (m *MockStore) GetDefaultDashboard(userID uuid.UUID) (*models.Dashboard, error) { return nil, nil }
func (m *MockStore) CreateDashboard(dashboard *models.Dashboard) error               { return nil }
func (m *MockStore) UpdateDashboard(dashboard *models.Dashboard) error               { return nil }
func (m *MockStore) DeleteDashboard(id uuid.UUID) error                              { return nil }

func (m *MockStore) GetCard(id uuid.UUID) (*models.Card, error)                     { return nil, nil }
func (m *MockStore) GetDashboardCards(dashboardID uuid.UUID) ([]models.Card, error) { return nil, nil }
func (m *MockStore) CreateCard(card *models.Card) error                             { return nil }
func (m *MockStore) UpdateCard(card *models.Card) error                             { return nil }
func (m *MockStore) DeleteCard(id uuid.UUID) error                                  { return nil }
func (m *MockStore) UpdateCardFocus(cardID uuid.UUID, summary string) error         { return nil }

func (m *MockStore) AddCardHistory(history *models.CardHistory) error { return nil }
func (m *MockStore) GetUserCardHistory(userID uuid.UUID, limit int) ([]models.CardHistory, error) {
	return nil, nil
}

func (m *MockStore) GetPendingSwap(id uuid.UUID) (*models.PendingSwap, error) { return nil, nil }
func (m *MockStore) GetUserPendingSwaps(userID uuid.UUID) ([]models.PendingSwap, error) {
	return nil, nil
}
func (m *MockStore) GetDueSwaps() ([]models.PendingSwap, error)                    { return nil, nil }
func (m *MockStore) CreatePendingSwap(swap *models.PendingSwap) error              { return nil }
func (m *MockStore) UpdateSwapStatus(id uuid.UUID, status models.SwapStatus) error { return nil }
func (m *MockStore) SnoozeSwap(id uuid.UUID, newSwapAt time.Time) error            { return nil }

func (m *MockStore) RecordEvent(event *models.UserEvent) error { return nil }
func (m *MockStore) GetRecentEvents(userID uuid.UUID, since time.Duration) ([]models.UserEvent, error) {
	return nil, nil
}

func (m *MockStore) CreateFeatureRequest(request *models.FeatureRequest) error      { return nil }
func (m *MockStore) GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error) { return nil, nil }
func (m *MockStore) GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) GetUserFeatureRequests(userID uuid.UUID) ([]models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) GetAllFeatureRequests() ([]models.FeatureRequest, error)   { return nil, nil }
func (m *MockStore) UpdateFeatureRequest(request *models.FeatureRequest) error { return nil }
func (m *MockStore) UpdateFeatureRequestStatus(id uuid.UUID, status models.RequestStatus) error {
	return nil
}
func (m *MockStore) CloseFeatureRequest(id uuid.UUID, closedByUser bool) error { return nil }
func (m *MockStore) UpdateFeatureRequestPR(id uuid.UUID, prNumber int, prURL string) error {
	return nil
}
func (m *MockStore) UpdateFeatureRequestPreview(id uuid.UUID, previewURL string) error    { return nil }
func (m *MockStore) UpdateFeatureRequestLatestComment(id uuid.UUID, comment string) error { return nil }

func (m *MockStore) CreatePRFeedback(feedback *models.PRFeedback) error { return nil }
func (m *MockStore) GetPRFeedback(featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	return nil, nil
}

func (m *MockStore) CreateNotification(notification *models.Notification) error { return nil }
func (m *MockStore) GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error) {
	return nil, nil
}
func (m *MockStore) GetUnreadNotificationCount(userID uuid.UUID) (int, error) { return 0, nil }
func (m *MockStore) MarkNotificationRead(id uuid.UUID) error                  { return nil }
func (m *MockStore) MarkAllNotificationsRead(userID uuid.UUID) error          { return nil }

func (m *MockStore) CreateGPUReservation(reservation *models.GPUReservation) error  { return nil }
func (m *MockStore) GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error) { return nil, nil }
func (m *MockStore) ListGPUReservations() ([]models.GPUReservation, error)          { return nil, nil }
func (m *MockStore) ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) UpdateGPUReservation(reservation *models.GPUReservation) error { return nil }
func (m *MockStore) DeleteGPUReservation(id uuid.UUID) error                       { return nil }
func (m *MockStore) GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error) {
	return 0, nil
}

func (m *MockStore) Close() error { return nil }

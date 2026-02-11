package store

import (
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// Store defines the interface for data persistence
type Store interface {
	// Users
	GetUser(id uuid.UUID) (*models.User, error)
	GetUserByGitHubID(githubID string) (*models.User, error)
	CreateUser(user *models.User) error
	UpdateUser(user *models.User) error
	UpdateLastLogin(userID uuid.UUID) error
	ListUsers() ([]models.User, error)
	DeleteUser(id uuid.UUID) error
	UpdateUserRole(userID uuid.UUID, role string) error
	CountUsersByRole() (admins, editors, viewers int, err error)

	// Onboarding
	SaveOnboardingResponse(response *models.OnboardingResponse) error
	GetOnboardingResponses(userID uuid.UUID) ([]models.OnboardingResponse, error)
	SetUserOnboarded(userID uuid.UUID) error

	// Dashboards
	GetDashboard(id uuid.UUID) (*models.Dashboard, error)
	GetUserDashboards(userID uuid.UUID) ([]models.Dashboard, error)
	GetDefaultDashboard(userID uuid.UUID) (*models.Dashboard, error)
	CreateDashboard(dashboard *models.Dashboard) error
	UpdateDashboard(dashboard *models.Dashboard) error
	DeleteDashboard(id uuid.UUID) error

	// Cards
	GetCard(id uuid.UUID) (*models.Card, error)
	GetDashboardCards(dashboardID uuid.UUID) ([]models.Card, error)
	CreateCard(card *models.Card) error
	UpdateCard(card *models.Card) error
	DeleteCard(id uuid.UUID) error
	UpdateCardFocus(cardID uuid.UUID, summary string) error

	// Card History
	AddCardHistory(history *models.CardHistory) error
	GetUserCardHistory(userID uuid.UUID, limit int) ([]models.CardHistory, error)

	// Pending Swaps
	GetPendingSwap(id uuid.UUID) (*models.PendingSwap, error)
	GetUserPendingSwaps(userID uuid.UUID) ([]models.PendingSwap, error)
	GetDueSwaps() ([]models.PendingSwap, error)
	CreatePendingSwap(swap *models.PendingSwap) error
	UpdateSwapStatus(id uuid.UUID, status models.SwapStatus) error
	SnoozeSwap(id uuid.UUID, newSwapAt time.Time) error

	// User Events
	RecordEvent(event *models.UserEvent) error
	GetRecentEvents(userID uuid.UUID, since time.Duration) ([]models.UserEvent, error)

	// Feature Requests
	CreateFeatureRequest(request *models.FeatureRequest) error
	GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error)
	GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error)
	GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error)
	GetUserFeatureRequests(userID uuid.UUID) ([]models.FeatureRequest, error)
	GetAllFeatureRequests() ([]models.FeatureRequest, error)
	UpdateFeatureRequest(request *models.FeatureRequest) error
	UpdateFeatureRequestStatus(id uuid.UUID, status models.RequestStatus) error
	CloseFeatureRequest(id uuid.UUID, closedByUser bool) error
	UpdateFeatureRequestPR(id uuid.UUID, prNumber int, prURL string) error
	UpdateFeatureRequestPreview(id uuid.UUID, previewURL string) error
	UpdateFeatureRequestLatestComment(id uuid.UUID, comment string) error

	// PR Feedback
	CreatePRFeedback(feedback *models.PRFeedback) error
	GetPRFeedback(featureRequestID uuid.UUID) ([]models.PRFeedback, error)

	// Notifications
	CreateNotification(notification *models.Notification) error
	GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error)
	GetUnreadNotificationCount(userID uuid.UUID) (int, error)
	MarkNotificationRead(id uuid.UUID) error
	MarkAllNotificationsRead(userID uuid.UUID) error

	// GPU Reservations
	CreateGPUReservation(reservation *models.GPUReservation) error
	GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error)
	ListGPUReservations() ([]models.GPUReservation, error)
	ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error)
	UpdateGPUReservation(reservation *models.GPUReservation) error
	DeleteGPUReservation(id uuid.UUID) error
	GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error)

	// Lifecycle
	Close() error
}

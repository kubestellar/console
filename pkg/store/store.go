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

	// Lifecycle
	Close() error
}

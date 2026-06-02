package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// UserStore manages user accounts.
type UserStore interface {
	GetUser(ctx context.Context, id uuid.UUID) (*models.User, error)
	GetUserByGitHubID(ctx context.Context, githubID string) (*models.User, error)
	GetUserByGitHubLogin(ctx context.Context, login string) (*models.User, error)
	CreateUser(ctx context.Context, user *models.User) error
	UpdateUser(ctx context.Context, user *models.User) error
	UpdateLastLogin(ctx context.Context, userID uuid.UUID) error
	ListUsers(ctx context.Context, limit, offset int) ([]models.User, error)
	DeleteUser(ctx context.Context, id uuid.UUID) error
	UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error
	CountUsersByRole(ctx context.Context) (admins, editors, viewers int, err error)
}

// OnboardingStore manages persisted onboarding responses.
type OnboardingStore interface {
	SaveOnboardingResponse(ctx context.Context, response *models.OnboardingResponse) error
	GetOnboardingResponses(ctx context.Context, userID uuid.UUID) ([]models.OnboardingResponse, error)
	SetUserOnboarded(ctx context.Context, userID uuid.UUID) error
}

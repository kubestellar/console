package test

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (m *MockStore) GetUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) GetUserByGitHubID(ctx context.Context, githubID string) (*models.User, error) {
	if !m.hasExpectation("GetUserByGitHubID") {
		return nil, nil
	}
	args := m.Called(githubID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) GetUserByGitHubLogin(ctx context.Context, login string) (*models.User, error) {
	args := m.Called(login)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) CreateUser(ctx context.Context, user *models.User) error {
	if !m.hasExpectation("CreateUser") {
		return nil
	}
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateUser(ctx context.Context, user *models.User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	if !m.hasExpectation("UpdateLastLogin") {
		return nil
	}
	args := m.Called(userID)
	return args.Error(0)
}

// Implement other methods as needed or with empty mocks

func (m *MockStore) ListUsers(ctx context.Context, limit, offset int) ([]models.User, error) {
	return nil, nil
}
func (m *MockStore) DeleteUser(ctx context.Context, id uuid.UUID) error { return nil }
func (m *MockStore) UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error {
	return nil
}
func (m *MockStore) CountUsersByRole(ctx context.Context) (int, int, int, error) {
	for _, call := range m.ExpectedCalls {
		if call.Method == "CountUsersByRole" {
			args := m.Called()
			return args.Int(0), args.Int(1), args.Int(2), args.Error(3)
		}
	}
	return 1, 0, 0, nil
}

func (m *MockStore) SaveOnboardingResponse(ctx context.Context, response *models.OnboardingResponse) error {
	return nil
}
func (m *MockStore) SaveOnboardingResponseTx(ctx context.Context, tx *sql.Tx, response *models.OnboardingResponse) error {
	return nil
}
func (m *MockStore) GetOnboardingResponses(ctx context.Context, userID uuid.UUID) ([]models.OnboardingResponse, error) {
	return nil, nil
}
func (m *MockStore) SetUserOnboarded(ctx context.Context, userID uuid.UUID) error { return nil }
func (m *MockStore) SetUserOnboardedTx(ctx context.Context, tx *sql.Tx, userID uuid.UUID) error {
	return nil
}

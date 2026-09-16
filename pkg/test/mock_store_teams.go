package test

import (
	"context"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (m *MockStore) CreateTeam(ctx context.Context, team *models.Team, memberIDs []uuid.UUID) error {
	args := m.Called(ctx, team, memberIDs)
	return args.Error(0)
}

func (m *MockStore) UpdateTeam(ctx context.Context, team *models.Team) error {
	args := m.Called(ctx, team)
	return args.Error(0)
}

func (m *MockStore) AddTeamMember(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	args := m.Called(ctx, teamID, userID, role)
	return args.Error(0)
}

func (m *MockStore) DeleteTeam(ctx context.Context, teamID uuid.UUID) error {
	args := m.Called(ctx, teamID)
	return args.Error(0)
}
func (m *MockStore) GetTeamWithMembers(ctx context.Context, teamID uuid.UUID) (*models.TeamWithMembers, error) {
	args := m.Called(ctx, teamID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.TeamWithMembers), args.Error(1)
}

// Add these to pkg/store/test/mock.go
func (m *MockStore) GetTeam(ctx context.Context, teamID uuid.UUID) (*models.Team, error) {
	args := m.Called(ctx, teamID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Team), args.Error(1)
}

func (m *MockStore) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Team), args.Error(1)
}

func (m *MockStore) ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	args := m.Called(ctx, teamID)

	if args.Get(0) == nil {
		return nil, args.Error(1)
	}

	return args.Get(0).([]models.TeamMemberInfo), args.Error(1)
}
func (m *MockStore) ListTeams(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	args := m.Called(ctx, userID, limit, offset)

	if args.Get(0) == nil {
		return nil, args.Error(1)
	}

	return args.Get(0).([]models.Team), args.Error(1)
}
func (m *MockStore) RemoveTeamMember(ctx context.Context, teamID, userID uuid.UUID) error {
	args := m.Called(ctx, teamID, userID)
	return args.Error(0)
}
func (m *MockStore) UpdateTeamMemberRole(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	args := m.Called(ctx, teamID, userID, role)
	return args.Error(0)
}

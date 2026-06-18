package team

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// mockTeamStore implements store.TeamStore for testing
type mockTeamStore struct {
	mock.Mock
}

func (m *mockTeamStore) CreateTeam(ctx context.Context, team *models.Team, memberIDs []uuid.UUID) error {
	args := m.Called(ctx, team, memberIDs)
	return args.Error(0)
}

func (m *mockTeamStore) GetTeam(ctx context.Context, id uuid.UUID) (*models.Team, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Team), args.Error(1)
}

func (m *mockTeamStore) GetTeamWithMembers(ctx context.Context, id uuid.UUID) (*models.TeamWithMembers, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.TeamWithMembers), args.Error(1)
}

func (m *mockTeamStore) UpdateTeam(ctx context.Context, team *models.Team) error {
	args := m.Called(ctx, team)
	return args.Error(0)
}

func (m *mockTeamStore) DeleteTeam(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockTeamStore) ListTeams(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	args := m.Called(ctx, userID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Team), args.Error(1)
}

func (m *mockTeamStore) AddTeamMember(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	args := m.Called(ctx, teamID, userID, role)
	return args.Error(0)
}

func (m *mockTeamStore) RemoveTeamMember(ctx context.Context, teamID, userID uuid.UUID) error {
	args := m.Called(ctx, teamID, userID)
	return args.Error(0)
}

func (m *mockTeamStore) UpdateTeamMemberRole(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	args := m.Called(ctx, teamID, userID, role)
	return args.Error(0)
}

func (m *mockTeamStore) ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	args := m.Called(ctx, teamID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.TeamMemberInfo), args.Error(1)
}

func (m *mockTeamStore) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Team), args.Error(1)
}

// newTestService creates a service with a mock team store and nil user store
// (the user store is not used by any current service methods).
func newTestService() (Service, *mockTeamStore) {
	teams := new(mockTeamStore)
	svc := New(teams, nil)
	return svc, teams
}

func TestCreate_Success(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	userID := uuid.New()
	req := models.CreateTeamRequest{Name: "platform", Description: "Platform team"}

	teams.On("CreateTeam", ctx, mock.AnythingOfType("*models.Team"), mock.AnythingOfType("[]uuid.UUID")).
		Return(nil)

	team, err := svc.Create(ctx, userID, req)
	require.NoError(t, err)
	require.NotNil(t, team)
	assert.Equal(t, "platform", team.Name)
	assert.Equal(t, "Platform team", team.Description)
	assert.Equal(t, userID, team.CreatedBy)
	assert.Equal(t, 1, team.MemberCount, "creator should be counted as member")
	teams.AssertExpectations(t)
}

func TestCreate_DeduplicatesMemberIDs(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	userID := uuid.New()
	otherID := uuid.New()
	// Include creator in members list + duplicate otherID
	req := models.CreateTeamRequest{
		Name:      "dedup-test",
		MemberIDs: []string{userID.String(), otherID.String(), otherID.String()},
	}

	var capturedMemberIDs []uuid.UUID
	teams.On("CreateTeam", ctx, mock.AnythingOfType("*models.Team"), mock.AnythingOfType("[]uuid.UUID")).
		Run(func(args mock.Arguments) {
			capturedMemberIDs = args.Get(2).([]uuid.UUID)
		}).
		Return(nil)

	team, err := svc.Create(ctx, userID, req)
	require.NoError(t, err)
	// Should have exactly 2 unique IDs: userID and otherID
	assert.Equal(t, 2, len(capturedMemberIDs))
	assert.Equal(t, 2, team.MemberCount)
	teams.AssertExpectations(t)
}

func TestCreate_EmptyName(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Create(ctx, uuid.New(), models.CreateTeamRequest{Name: ""})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "team name is required")
}

func TestCreate_InvalidMemberID(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	req := models.CreateTeamRequest{
		Name:      "bad-member",
		MemberIDs: []string{"not-a-uuid"},
	}

	_, err := svc.Create(ctx, uuid.New(), req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid member ID")
}

func TestGet_Success(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	teamID := uuid.New()
	expected := &models.TeamWithMembers{
		Team:    models.Team{ID: teamID, Name: "platform"},
		Members: []models.TeamMemberInfo{},
	}
	teams.On("GetTeamWithMembers", ctx, teamID).Return(expected, nil)

	result, err := svc.Get(ctx, teamID)
	require.NoError(t, err)
	assert.Equal(t, expected, result)
	teams.AssertExpectations(t)
}

func TestGet_NotFound(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	teamID := uuid.New()
	teams.On("GetTeamWithMembers", ctx, teamID).Return(nil, nil)

	_, err := svc.Get(ctx, teamID)
	require.ErrorIs(t, err, ErrNotFound)
	teams.AssertExpectations(t)
}

func TestDelete_AsCreator(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	userID := uuid.New()
	teamID := uuid.New()
	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: userID}, nil)
	teams.On("DeleteTeam", ctx, teamID).Return(nil)

	err := svc.Delete(ctx, teamID, userID)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestDelete_AsAdmin(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	adminID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: adminID, Role: models.TeamRoleAdmin},
	}, nil)
	teams.On("DeleteTeam", ctx, teamID).Return(nil)

	err := svc.Delete(ctx, teamID, adminID)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestDelete_NoPermission(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	randomID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: randomID, Role: models.TeamRoleMember}, // member, not admin
	}, nil)

	err := svc.Delete(ctx, teamID, randomID)
	require.ErrorIs(t, err, ErrNoPermission)
	teams.AssertExpectations(t)
}

func TestDelete_NotFound(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	teamID := uuid.New()
	teams.On("GetTeam", ctx, teamID).Return(nil, nil)

	err := svc.Delete(ctx, teamID, uuid.New())
	require.ErrorIs(t, err, ErrNotFound)
	teams.AssertExpectations(t)
}

func TestRemoveMember_AsCreator(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	actorID := uuid.New()
	memberID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: actorID}, nil)
	teams.On("RemoveTeamMember", ctx, teamID, memberID).Return(nil)

	err := svc.RemoveMember(ctx, teamID, memberID, actorID)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestRemoveMember_SelfRemove(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	memberID := uuid.New()
	creatorID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("RemoveTeamMember", ctx, teamID, memberID).Return(nil)

	// Member removing themselves — allowed
	err := svc.RemoveMember(ctx, teamID, memberID, memberID)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestRemoveMember_NoPermission(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	memberID := uuid.New()
	actorID := uuid.New() // not creator, not the member, not admin
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: actorID, Role: models.TeamRoleMember},
	}, nil)

	err := svc.RemoveMember(ctx, teamID, memberID, actorID)
	require.ErrorIs(t, err, ErrNoPermission)
	teams.AssertExpectations(t)
}

func TestAddMember_AsCreator(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	newMemberID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("AddTeamMember", ctx, teamID, newMemberID, models.TeamRoleMember).Return(nil)

	err := svc.AddMember(ctx, teamID, newMemberID, creatorID, models.TeamRoleMember)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestAddMember_AsAdmin(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	adminID := uuid.New()
	newMemberID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: adminID, Role: models.TeamRoleAdmin},
	}, nil)
	teams.On("AddTeamMember", ctx, teamID, newMemberID, models.TeamRoleMember).Return(nil)

	err := svc.AddMember(ctx, teamID, newMemberID, adminID, models.TeamRoleMember)
	require.NoError(t, err)
	teams.AssertExpectations(t)
}

func TestAddMember_NoPermission(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	actorID := uuid.New()
	newMemberID := uuid.New()
	teamID := uuid.New()

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: actorID, Role: models.TeamRoleMember},
	}, nil)

	err := svc.AddMember(ctx, teamID, newMemberID, actorID, models.TeamRoleMember)
	require.ErrorIs(t, err, ErrNoPermission)
	teams.AssertExpectations(t)
}

func TestUpdate_AsCreator(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	teamID := uuid.New()
	newName := "new-name"
	req := models.UpdateTeamRequest{Name: &newName}

	existingTeam := &models.Team{ID: teamID, Name: "old-name", CreatedBy: creatorID}
	teams.On("GetTeam", ctx, teamID).Return(existingTeam, nil)
	teams.On("UpdateTeam", ctx, mock.AnythingOfType("*models.Team")).Return(nil)

	result, err := svc.Update(ctx, teamID, creatorID, req)
	require.NoError(t, err)
	assert.Equal(t, "new-name", result.Name)
	teams.AssertExpectations(t)
}

func TestUpdate_NoPermission(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	creatorID := uuid.New()
	actorID := uuid.New()
	teamID := uuid.New()
	newName := "hacked"
	req := models.UpdateTeamRequest{Name: &newName}

	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID, CreatedBy: creatorID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return([]models.TeamMemberInfo{
		{UserID: actorID, Role: models.TeamRoleMember},
	}, nil)

	_, err := svc.Update(ctx, teamID, actorID, req)
	require.ErrorIs(t, err, ErrNoPermission)
	teams.AssertExpectations(t)
}

func TestListMembers_Success(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	teamID := uuid.New()
	expected := []models.TeamMemberInfo{
		{UserID: uuid.New(), Role: models.TeamRoleMember},
		{UserID: uuid.New(), Role: models.TeamRoleAdmin},
	}
	teams.On("GetTeam", ctx, teamID).Return(&models.Team{ID: teamID}, nil)
	teams.On("ListTeamMembers", ctx, teamID).Return(expected, nil)

	result, err := svc.ListMembers(ctx, teamID)
	require.NoError(t, err)
	assert.Equal(t, expected, result)
	teams.AssertExpectations(t)
}

func TestListMembers_NotFound(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	teamID := uuid.New()
	teams.On("GetTeam", ctx, teamID).Return(nil, nil)

	_, err := svc.ListMembers(ctx, teamID)
	require.ErrorIs(t, err, ErrNotFound)
	teams.AssertExpectations(t)
}

func TestList_DelegatesToStore(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	userID := uuid.New()
	expected := []models.Team{{ID: uuid.New(), Name: "team-a"}}
	teams.On("ListTeams", ctx, &userID, 10, 0).Return(expected, nil)

	result, err := svc.List(ctx, &userID, 10, 0)
	require.NoError(t, err)
	assert.Equal(t, expected, result)
	teams.AssertExpectations(t)
}

func TestGetUserTeams_DelegatesToStore(t *testing.T) {
	svc, teams := newTestService()
	ctx := context.Background()

	userID := uuid.New()
	expected := []models.Team{{ID: uuid.New(), Name: "my-team"}}
	teams.On("GetUserTeams", ctx, userID).Return(expected, nil)

	result, err := svc.GetUserTeams(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, expected, result)
	teams.AssertExpectations(t)
}

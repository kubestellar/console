package team

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// mockTeamStore is a minimal mock that satisfies store.TeamStore for the
// methods used by Service. Unused interface methods panic if called.
type mockTeamStore struct {
	team              *models.Team
	teamWithMembers   *models.TeamWithMembers
	teams             []models.Team
	members           []models.TeamMemberInfo
	userTeams         []models.Team
	createErr         error
	getErr            error
	getWithMembersErr error
	updateErr         error
	deleteErr         error
	listErr           error
	addMemberErr      error
	removeMemberErr   error
	updateMemberErr   error
	listMembersErr    error
	getUserTeamsErr   error
	createdTeam       *models.Team
	createdMemberIDs  []uuid.UUID
	updatedTeam       *models.Team
	deletedTeamID     uuid.UUID
	addedTeamID       uuid.UUID
	addedUserID       uuid.UUID
	addedRole         models.TeamRole
	removedTeamID     uuid.UUID
	removedUserID     uuid.UUID
}

func (m *mockTeamStore) CreateTeam(_ context.Context, team *models.Team, memberIDs []uuid.UUID) error {
	m.createdTeam = team
	m.createdMemberIDs = memberIDs
	return m.createErr
}

func (m *mockTeamStore) GetTeam(_ context.Context, _ uuid.UUID) (*models.Team, error) {
	return m.team, m.getErr
}

func (m *mockTeamStore) GetTeamWithMembers(_ context.Context, _ uuid.UUID) (*models.TeamWithMembers, error) {
	return m.teamWithMembers, m.getWithMembersErr
}

func (m *mockTeamStore) UpdateTeam(_ context.Context, team *models.Team) error {
	m.updatedTeam = team
	return m.updateErr
}

func (m *mockTeamStore) DeleteTeam(_ context.Context, id uuid.UUID) error {
	m.deletedTeamID = id
	return m.deleteErr
}

func (m *mockTeamStore) ListTeams(_ context.Context, _ *uuid.UUID, _, _ int) ([]models.Team, error) {
	return m.teams, m.listErr
}

func (m *mockTeamStore) AddTeamMember(_ context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	m.addedTeamID = teamID
	m.addedUserID = userID
	m.addedRole = role
	return m.addMemberErr
}

func (m *mockTeamStore) RemoveTeamMember(_ context.Context, teamID, userID uuid.UUID) error {
	m.removedTeamID = teamID
	m.removedUserID = userID
	return m.removeMemberErr
}

func (m *mockTeamStore) UpdateTeamMemberRole(_ context.Context, _, _ uuid.UUID, _ models.TeamRole) error {
	return m.updateMemberErr
}

func (m *mockTeamStore) ListTeamMembers(_ context.Context, _ uuid.UUID) ([]models.TeamMemberInfo, error) {
	return m.members, m.listMembersErr
}

func (m *mockTeamStore) GetUserTeams(_ context.Context, _ uuid.UUID) ([]models.Team, error) {
	return m.userTeams, m.getUserTeamsErr
}

// mockUserStore is a minimal mock that satisfies store.UserStore.
type mockUserStore struct{}

func (m *mockUserStore) GetUser(context.Context, uuid.UUID) (*models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) GetUserByGitHubID(context.Context, string) (*models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) GetUserByGitHubLogin(context.Context, string) (*models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) CreateUser(context.Context, *models.User) error { panic("not implemented") }
func (m *mockUserStore) UpdateUser(context.Context, *models.User) error { panic("not implemented") }
func (m *mockUserStore) UpdateLastLogin(context.Context, uuid.UUID) error {
	panic("not implemented")
}
func (m *mockUserStore) ListUsers(context.Context, int, int) ([]models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) DeleteUser(context.Context, uuid.UUID) error { panic("not implemented") }
func (m *mockUserStore) UpdateUserRole(context.Context, uuid.UUID, string) error {
	panic("not implemented")
}
func (m *mockUserStore) CountUsersByRole(context.Context) (int, int, int, error) {
	panic("not implemented")
}

// TestCreate_EmptyName tests that Create rejects empty team names.
func TestCreate_EmptyName(t *testing.T) {
	svc := New(&mockTeamStore{}, &mockUserStore{})
	_, err := svc.Create(context.Background(), uuid.New(), models.CreateTeamRequest{Name: ""})
	if err == nil || err.Error() != "team name is required" {
		t.Fatalf("expected 'team name is required' error, got %v", err)
	}
}

// TestCreate_Success tests successful team creation.
func TestCreate_Success(t *testing.T) {
	mock := &mockTeamStore{}
	svc := New(mock, &mockUserStore{})
	userID := uuid.New()
	req := models.CreateTeamRequest{
		Name:        "Engineering",
		Description: "Engineering team",
	}

	team, err := svc.Create(context.Background(), userID, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if team.Name != "Engineering" {
		t.Fatalf("expected name 'Engineering', got %v", team.Name)
	}
	if team.CreatedBy != userID {
		t.Fatalf("expected CreatedBy %v, got %v", userID, team.CreatedBy)
	}
	if mock.createdTeam == nil {
		t.Fatal("CreateTeam was not called on store")
	}
	// Creator should be included in members
	found := false
	for _, id := range mock.createdMemberIDs {
		if id == userID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("creator not included in member list")
	}
}

// TestCreate_MemberDeduplication tests that duplicate member IDs are deduplicated.
func TestCreate_MemberDeduplication(t *testing.T) {
	mock := &mockTeamStore{}
	svc := New(mock, &mockUserStore{})
	userID := uuid.New()
	member1 := uuid.New()
	req := models.CreateTeamRequest{
		Name:      "Team",
		MemberIDs: []string{member1.String(), member1.String()}, // duplicate
	}

	_, err := svc.Create(context.Background(), userID, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should have creator + member1 (deduplicated)
	if len(mock.createdMemberIDs) != 2 {
		t.Fatalf("expected 2 unique members, got %d", len(mock.createdMemberIDs))
	}
}

// TestCreate_InvalidMemberID tests that invalid member IDs are rejected.
func TestCreate_InvalidMemberID(t *testing.T) {
	svc := New(&mockTeamStore{}, &mockUserStore{})
	req := models.CreateTeamRequest{
		Name:      "Team",
		MemberIDs: []string{"not-a-uuid"},
	}

	_, err := svc.Create(context.Background(), uuid.New(), req)
	if err == nil {
		t.Fatal("expected error for invalid member ID")
	}
}

// TestGet_NotFound tests that Get returns ErrNotFound when team doesn't exist.
func TestGet_NotFound(t *testing.T) {
	svc := New(&mockTeamStore{teamWithMembers: nil}, &mockUserStore{})
	_, err := svc.Get(context.Background(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestGet_Success tests successful team retrieval.
func TestGet_Success(t *testing.T) {
	teamID := uuid.New()
	want := &models.TeamWithMembers{
		Team: models.Team{ID: teamID, Name: "Engineering"},
	}
	svc := New(&mockTeamStore{teamWithMembers: want}, &mockUserStore{})
	got, err := svc.Get(context.Background(), teamID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != teamID {
		t.Fatalf("expected ID %v, got %v", teamID, got.ID)
	}
}

// TestDelete_NotFound tests that Delete returns ErrNotFound when team doesn't exist.
func TestDelete_NotFound(t *testing.T) {
	svc := New(&mockTeamStore{team: nil}, &mockUserStore{})
	err := svc.Delete(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestDelete_ByCreator tests that team creator can delete the team.
func TestDelete_ByCreator(t *testing.T) {
	creatorID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{team: &models.Team{ID: teamID, CreatedBy: creatorID}}
	svc := New(mock, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, creatorID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.deletedTeamID != teamID {
		t.Fatalf("expected DeleteTeam called with %v, got %v", teamID, mock.deletedTeamID)
	}
}

// TestDelete_ByAdmin tests that team admin can delete the team.
func TestDelete_ByAdmin(t *testing.T) {
	creatorID := uuid.New()
	adminID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: adminID, Role: models.TeamRoleAdmin},
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, adminID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestDelete_NoPermission tests that non-admin/non-creator cannot delete team.
func TestDelete_NoPermission(t *testing.T) {
	creatorID := uuid.New()
	regularUserID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: regularUserID, Role: models.TeamRoleMember},
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, regularUserID)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

// TestList_Success tests successful team listing.
func TestList_Success(t *testing.T) {
	teams := []models.Team{
		{ID: uuid.New(), Name: "Team1"},
		{ID: uuid.New(), Name: "Team2"},
	}
	svc := New(&mockTeamStore{teams: teams}, &mockUserStore{})

	got, err := svc.List(context.Background(), nil, 10, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 teams, got %d", len(got))
	}
}

// TestAddMember_NotFound tests that AddMember returns ErrNotFound when team doesn't exist.
func TestAddMember_NotFound(t *testing.T) {
	svc := New(&mockTeamStore{team: nil}, &mockUserStore{})
	err := svc.AddMember(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleMember)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestAddMember_ByCreator tests that team creator can add members.
func TestAddMember_ByCreator(t *testing.T) {
	creatorID := uuid.New()
	teamID := uuid.New()
	newMemberID := uuid.New()
	mock := &mockTeamStore{team: &models.Team{ID: teamID, CreatedBy: creatorID}}
	svc := New(mock, &mockUserStore{})

	err := svc.AddMember(context.Background(), teamID, newMemberID, creatorID, models.TeamRoleMember)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.addedUserID != newMemberID {
		t.Fatalf("expected AddTeamMember called with %v, got %v", newMemberID, mock.addedUserID)
	}
}

// TestAddMember_ByAdmin tests that team admin can add members.
func TestAddMember_ByAdmin(t *testing.T) {
	creatorID := uuid.New()
	adminID := uuid.New()
	teamID := uuid.New()
	newMemberID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: adminID, Role: models.TeamRoleAdmin},
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.AddMember(context.Background(), teamID, newMemberID, adminID, models.TeamRoleMember)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestAddMember_NoPermission tests that non-admin cannot add members.
func TestAddMember_NoPermission(t *testing.T) {
	creatorID := uuid.New()
	regularUserID := uuid.New()
	teamID := uuid.New()
	newMemberID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: regularUserID, Role: models.TeamRoleMember},
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.AddMember(context.Background(), teamID, newMemberID, regularUserID, models.TeamRoleMember)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

// TestRemoveMember_ByCreator tests that team creator can remove members.
func TestRemoveMember_ByCreator(t *testing.T) {
	creatorID := uuid.New()
	teamID := uuid.New()
	memberID := uuid.New()
	mock := &mockTeamStore{team: &models.Team{ID: teamID, CreatedBy: creatorID}}
	svc := New(mock, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, memberID, creatorID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.removedUserID != memberID {
		t.Fatalf("expected RemoveTeamMember called with %v, got %v", memberID, mock.removedUserID)
	}
}

// TestRemoveMember_SelfRemoval tests that a user can remove themselves.
func TestRemoveMember_SelfRemoval(t *testing.T) {
	creatorID := uuid.New()
	userID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{team: &models.Team{ID: teamID, CreatedBy: creatorID}}
	svc := New(mock, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, userID, userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestRemoveMember_NoPermission tests that non-admin cannot remove other members.
func TestRemoveMember_NoPermission(t *testing.T) {
	creatorID := uuid.New()
	regularUserID := uuid.New()
	otherMemberID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: regularUserID, Role: models.TeamRoleMember},
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, otherMemberID, regularUserID)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

// TestListMembers_NotFound tests that ListMembers returns ErrNotFound when team doesn't exist.
func TestListMembers_NotFound(t *testing.T) {
	svc := New(&mockTeamStore{team: nil}, &mockUserStore{})
	_, err := svc.ListMembers(context.Background(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestListMembers_Success tests successful member listing.
func TestListMembers_Success(t *testing.T) {
	teamID := uuid.New()
	members := []models.TeamMemberInfo{
		{UserID: uuid.New(), GitHubLogin: "user1", Role: models.TeamRoleAdmin},
		{UserID: uuid.New(), GitHubLogin: "user2", Role: models.TeamRoleMember},
	}
	mock := &mockTeamStore{
		team:    &models.Team{ID: teamID, Name: "Team"},
		members: members,
	}
	svc := New(mock, &mockUserStore{})

	got, err := svc.ListMembers(context.Background(), teamID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 members, got %d", len(got))
	}
}

// TestGetUserTeams_Success tests successful retrieval of user's teams.
func TestGetUserTeams_Success(t *testing.T) {
	userID := uuid.New()
	teams := []models.Team{
		{ID: uuid.New(), Name: "Team1"},
	}
	svc := New(&mockTeamStore{userTeams: teams}, &mockUserStore{})

	got, err := svc.GetUserTeams(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 team, got %d", len(got))
	}
}

// TestUpdate_NotFound tests that Update returns ErrNotFound when team doesn't exist.
func TestUpdate_NotFound(t *testing.T) {
	svc := New(&mockTeamStore{team: nil}, &mockUserStore{})
	name := "New Name"
	_, err := svc.Update(context.Background(), uuid.New(), uuid.New(), models.UpdateTeamRequest{Name: &name})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestUpdate_ByCreator tests that team creator can update team.
func TestUpdate_ByCreator(t *testing.T) {
	creatorID := uuid.New()
	teamID := uuid.New()
	newName := "Updated Team"
	mock := &mockTeamStore{team: &models.Team{ID: teamID, Name: "Old Name", CreatedBy: creatorID}}
	svc := New(mock, &mockUserStore{})

	got, err := svc.Update(context.Background(), teamID, creatorID, models.UpdateTeamRequest{Name: &newName})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Name != newName {
		t.Fatalf("expected name %v, got %v", newName, got.Name)
	}
	if mock.updatedTeam == nil || mock.updatedTeam.Name != newName {
		t.Fatal("UpdateTeam was not called or name not updated")
	}
}

// TestUpdate_ByAdmin tests that team admin can update team.
func TestUpdate_ByAdmin(t *testing.T) {
	creatorID := uuid.New()
	adminID := uuid.New()
	teamID := uuid.New()
	newName := "Updated Team"
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, Name: "Old Name", CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: adminID, Role: models.TeamRoleAdmin},
		},
	}
	svc := New(mock, &mockUserStore{})

	_, err := svc.Update(context.Background(), teamID, adminID, models.UpdateTeamRequest{Name: &newName})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestUpdate_NoPermission tests that non-admin cannot update team.
func TestUpdate_NoPermission(t *testing.T) {
	creatorID := uuid.New()
	regularUserID := uuid.New()
	teamID := uuid.New()
	newName := "Updated Team"
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, Name: "Old Name", CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: regularUserID, Role: models.TeamRoleMember},
		},
	}
	svc := New(mock, &mockUserStore{})

	_, err := svc.Update(context.Background(), teamID, regularUserID, models.UpdateTeamRequest{Name: &newName})
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

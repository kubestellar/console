package team

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// --- Mock stores ---

type mockTeamStore struct {
	team           *models.Team
	teamWithMbrs   *models.TeamWithMembers
	teams          []models.Team
	members        []models.TeamMemberInfo
	createErr      error
	getErr         error
	getWithMbrsErr error
	updateErr      error
	deleteErr      error
	listErr        error
	addMemberErr   error
	removeMbrErr   error
	updateRoleErr  error
	listMbrsErr    error
	getUserTmsErr  error
	// Track calls
	createdTeam    *models.Team
	createdMbrIDs  []uuid.UUID
	deletedID      uuid.UUID
	addedMbrTeamID uuid.UUID
	addedMbrUserID uuid.UUID
	addedMbrRole   models.TeamRole
	removedTeamID  uuid.UUID
	removedUserID  uuid.UUID
	updatedTeam    *models.Team
}

func (m *mockTeamStore) CreateTeam(_ context.Context, team *models.Team, memberIDs []uuid.UUID) error {
	m.createdTeam = team
	m.createdMbrIDs = memberIDs
	return m.createErr
}

func (m *mockTeamStore) GetTeam(_ context.Context, _ uuid.UUID) (*models.Team, error) {
	return m.team, m.getErr
}

func (m *mockTeamStore) GetTeamWithMembers(_ context.Context, _ uuid.UUID) (*models.TeamWithMembers, error) {
	return m.teamWithMbrs, m.getWithMbrsErr
}

func (m *mockTeamStore) UpdateTeam(_ context.Context, team *models.Team) error {
	m.updatedTeam = team
	return m.updateErr
}

func (m *mockTeamStore) DeleteTeam(_ context.Context, id uuid.UUID) error {
	m.deletedID = id
	return m.deleteErr
}

func (m *mockTeamStore) ListTeams(_ context.Context, _ *uuid.UUID, _, _ int) ([]models.Team, error) {
	return m.teams, m.listErr
}

func (m *mockTeamStore) AddTeamMember(_ context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	m.addedMbrTeamID = teamID
	m.addedMbrUserID = userID
	m.addedMbrRole = role
	return m.addMemberErr
}

func (m *mockTeamStore) RemoveTeamMember(_ context.Context, teamID, userID uuid.UUID) error {
	m.removedTeamID = teamID
	m.removedUserID = userID
	return m.removeMbrErr
}

func (m *mockTeamStore) UpdateTeamMemberRole(_ context.Context, _, _ uuid.UUID, _ models.TeamRole) error {
	return m.updateRoleErr
}

func (m *mockTeamStore) ListTeamMembers(_ context.Context, _ uuid.UUID) ([]models.TeamMemberInfo, error) {
	return m.members, m.listMbrsErr
}

func (m *mockTeamStore) GetUserTeams(_ context.Context, _ uuid.UUID) ([]models.Team, error) {
	return m.teams, m.getUserTmsErr
}

// mockUserStore satisfies store.UserStore (unused methods panic).
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
func (m *mockUserStore) CreateUser(context.Context, *models.User) error  { panic("not implemented") }
func (m *mockUserStore) UpdateUser(context.Context, *models.User) error  { panic("not implemented") }
func (m *mockUserStore) UpdateLastLogin(context.Context, uuid.UUID) error { panic("not implemented") }
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

// --- Tests ---

func TestCreate_Success(t *testing.T) {
	ts := &mockTeamStore{}
	svc := New(ts, &mockUserStore{})
	userID := uuid.New()

	got, err := svc.Create(context.Background(), userID, models.CreateTeamRequest{
		Name:        "alpha-team",
		Description: "First team",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Name != "alpha-team" {
		t.Fatalf("got name %q, want %q", got.Name, "alpha-team")
	}
	if got.CreatedBy != userID {
		t.Fatalf("CreatedBy mismatch")
	}
	if got.MemberCount != 1 {
		t.Fatalf("expected MemberCount=1 (creator), got %d", got.MemberCount)
	}
}

func TestCreate_EmptyName(t *testing.T) {
	svc := New(&mockTeamStore{}, &mockUserStore{})
	_, err := svc.Create(context.Background(), uuid.New(), models.CreateTeamRequest{Name: ""})
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestCreate_DeduplicatesMembers(t *testing.T) {
	ts := &mockTeamStore{}
	svc := New(ts, &mockUserStore{})
	creatorID := uuid.New()
	memberID := uuid.New()

	_, err := svc.Create(context.Background(), creatorID, models.CreateTeamRequest{
		Name:      "dedup-team",
		MemberIDs: []string{memberID.String(), memberID.String(), creatorID.String()},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should deduplicate: creator + one extra member = 2
	if len(ts.createdMbrIDs) != 2 {
		t.Fatalf("expected 2 unique member IDs, got %d", len(ts.createdMbrIDs))
	}
}

func TestCreate_InvalidMemberID(t *testing.T) {
	svc := New(&mockTeamStore{}, &mockUserStore{})
	_, err := svc.Create(context.Background(), uuid.New(), models.CreateTeamRequest{
		Name:      "bad-member",
		MemberIDs: []string{"not-a-uuid"},
	})
	if err == nil {
		t.Fatal("expected error for invalid member ID")
	}
}

func TestCreate_StoreError(t *testing.T) {
	ts := &mockTeamStore{createErr: errors.New("db error")}
	svc := New(ts, &mockUserStore{})
	_, err := svc.Create(context.Background(), uuid.New(), models.CreateTeamRequest{Name: "fail"})
	if err == nil {
		t.Fatal("expected store error to propagate")
	}
}

func TestGet_Success(t *testing.T) {
	teamID := uuid.New()
	want := &models.TeamWithMembers{
		Team:    models.Team{ID: teamID, Name: "my-team"},
		Members: []models.TeamMemberInfo{{UserID: uuid.New(), Role: models.TeamRoleMember}},
	}
	ts := &mockTeamStore{teamWithMbrs: want}
	svc := New(ts, &mockUserStore{})

	got, err := svc.Get(context.Background(), teamID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != teamID {
		t.Fatalf("ID mismatch")
	}
}

func TestGet_NotFound(t *testing.T) {
	ts := &mockTeamStore{teamWithMbrs: nil}
	svc := New(ts, &mockUserStore{})
	_, err := svc.Get(context.Background(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDelete_ByCreator(t *testing.T) {
	creatorID := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{team: &models.Team{ID: teamID, CreatedBy: creatorID}}
	svc := New(ts, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, creatorID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts.deletedID != teamID {
		t.Fatalf("wrong team deleted")
	}
}

func TestDelete_ByAdmin(t *testing.T) {
	creatorID := uuid.New()
	adminID := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: adminID, Role: models.TeamRoleAdmin},
		},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, adminID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDelete_PermissionDenied(t *testing.T) {
	creatorID := uuid.New()
	randomUser := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: randomUser, Role: models.TeamRoleMember},
		},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.Delete(context.Background(), teamID, randomUser)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

func TestDelete_NotFound(t *testing.T) {
	ts := &mockTeamStore{team: nil}
	svc := New(ts, &mockUserStore{})
	err := svc.Delete(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestList_Success(t *testing.T) {
	want := []models.Team{{ID: uuid.New(), Name: "t1"}, {ID: uuid.New(), Name: "t2"}}
	ts := &mockTeamStore{teams: want}
	svc := New(ts, &mockUserStore{})

	got, err := svc.List(context.Background(), nil, 10, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 teams, got %d", len(got))
	}
}

func TestAddMember_AdminCanAdd(t *testing.T) {
	adminID := uuid.New()
	teamID := uuid.New()
	newUser := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: adminID},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.AddMember(context.Background(), teamID, newUser, adminID, models.TeamRoleMember)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts.addedMbrUserID != newUser {
		t.Fatal("wrong user added")
	}
	if ts.addedMbrRole != models.TeamRoleMember {
		t.Fatal("wrong role")
	}
}

func TestAddMember_NonAdminDenied(t *testing.T) {
	creatorID := uuid.New()
	memberID := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: memberID, Role: models.TeamRoleMember},
		},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.AddMember(context.Background(), teamID, uuid.New(), memberID, models.TeamRoleMember)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

func TestAddMember_TeamNotFound(t *testing.T) {
	ts := &mockTeamStore{team: nil}
	svc := New(ts, &mockUserStore{})
	err := svc.AddMember(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleMember)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRemoveMember_AdminCanRemove(t *testing.T) {
	adminID := uuid.New()
	teamID := uuid.New()
	targetUser := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: adminID},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, targetUser, adminID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts.removedUserID != targetUser {
		t.Fatal("wrong user removed")
	}
}

func TestRemoveMember_SelfRemoval(t *testing.T) {
	creatorID := uuid.New()
	memberID := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
	}
	svc := New(ts, &mockUserStore{})

	// A user can remove themselves
	err := svc.RemoveMember(context.Background(), teamID, memberID, memberID)
	if err != nil {
		t.Fatalf("unexpected error on self-removal: %v", err)
	}
}

func TestRemoveMember_PermissionDenied(t *testing.T) {
	creatorID := uuid.New()
	actorID := uuid.New()
	targetID := uuid.New()
	teamID := uuid.New()
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: actorID, Role: models.TeamRoleMember},
		},
	}
	svc := New(ts, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, targetID, actorID)
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

func TestRemoveMember_TeamNotFound(t *testing.T) {
	ts := &mockTeamStore{team: nil}
	svc := New(ts, &mockUserStore{})
	err := svc.RemoveMember(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdate_AdminCanUpdate(t *testing.T) {
	adminID := uuid.New()
	teamID := uuid.New()
	newName := "renamed-team"
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, Name: "old-name", CreatedBy: adminID},
	}
	svc := New(ts, &mockUserStore{})

	got, err := svc.Update(context.Background(), teamID, adminID, models.UpdateTeamRequest{Name: &newName})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Name != newName {
		t.Fatalf("got name %q, want %q", got.Name, newName)
	}
}

func TestUpdate_NonAdminDenied(t *testing.T) {
	creatorID := uuid.New()
	randomUser := uuid.New()
	teamID := uuid.New()
	newName := "renamed"
	ts := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: randomUser, Role: models.TeamRoleMember},
		},
	}
	svc := New(ts, &mockUserStore{})

	_, err := svc.Update(context.Background(), teamID, randomUser, models.UpdateTeamRequest{Name: &newName})
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

func TestUpdate_NotFound(t *testing.T) {
	ts := &mockTeamStore{team: nil}
	svc := New(ts, &mockUserStore{})
	name := "x"
	_, err := svc.Update(context.Background(), uuid.New(), uuid.New(), models.UpdateTeamRequest{Name: &name})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestListMembers_Success(t *testing.T) {
	teamID := uuid.New()
	want := []models.TeamMemberInfo{
		{UserID: uuid.New(), Role: models.TeamRoleAdmin},
		{UserID: uuid.New(), Role: models.TeamRoleMember},
	}
	ts := &mockTeamStore{
		team:    &models.Team{ID: teamID},
		members: want,
	}
	svc := New(ts, &mockUserStore{})

	got, err := svc.ListMembers(context.Background(), teamID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 members, got %d", len(got))
	}
}

func TestListMembers_TeamNotFound(t *testing.T) {
	ts := &mockTeamStore{team: nil}
	svc := New(ts, &mockUserStore{})
	_, err := svc.ListMembers(context.Background(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestGetUserTeams_Success(t *testing.T) {
	want := []models.Team{{ID: uuid.New(), Name: "user-team"}}
	ts := &mockTeamStore{teams: want}
	svc := New(ts, &mockUserStore{})

	got, err := svc.GetUserTeams(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].Name != "user-team" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestUpdateMemberRole_Stub(t *testing.T) {
	svc := New(&mockTeamStore{}, &mockUserStore{})
	// Current implementation is a stub that returns nil
	err := svc.UpdateMemberRole(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleAdmin)
	if err != nil {
		t.Fatalf("unexpected error from stub: %v", err)
	}
}

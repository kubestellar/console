package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/require"
)

func createTeamTestUser(t *testing.T, s *SQLiteStore, login string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	err := s.CreateUser(context.Background(), &models.User{
		ID:          id,
		GitHubID:    "gh-" + login,
		GitHubLogin: login,
		Role:        "viewer",
	})
	require.NoError(t, err)
	return id
}

func TestSQLiteTeams_CreateAndGet(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "creator")
	memberID := createTeamTestUser(t, store, "member1")

	team := &models.Team{
		Name:        "Alpha Team",
		Description: "First team",
		CreatedBy:   creatorID,
	}

	err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID})
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, team.ID)
	require.Equal(t, 2, team.MemberCount)

	got, err := store.GetTeam(ctx, team.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "Alpha Team", got.Name)
	require.Equal(t, "First team", got.Description)
	require.Equal(t, creatorID, got.CreatedBy)
	require.Equal(t, 2, got.MemberCount)
}

func TestSQLiteTeams_CreateAssignsAdminToCreator(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "admin-creator")
	memberID := createTeamTestUser(t, store, "regular-member")

	team := &models.Team{
		Name:      "Role Test Team",
		CreatedBy: creatorID,
	}

	err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID})
	require.NoError(t, err)

	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Len(t, members, 2)

	for _, m := range members {
		if m.UserID == creatorID {
			require.Equal(t, models.TeamRoleAdmin, m.Role, "creator should be admin")
		} else {
			require.Equal(t, models.TeamRoleMember, m.Role, "non-creator should be member")
		}
	}
}

func TestSQLiteTeams_GetNonExistent(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	got, err := store.GetTeam(ctx, uuid.New())
	require.NoError(t, err)
	require.Nil(t, got, "non-existent team should return nil")
}

func TestSQLiteTeams_GetWithMembers(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "wm-creator")
	memberID := createTeamTestUser(t, store, "wm-member")

	team := &models.Team{
		Name:      "Members Team",
		CreatedBy: creatorID,
	}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

	twm, err := store.GetTeamWithMembers(ctx, team.ID)
	require.NoError(t, err)
	require.NotNil(t, twm)
	require.Equal(t, "Members Team", twm.Team.Name)
	require.Len(t, twm.Members, 2)
}

func TestSQLiteTeams_GetWithMembers_NonExistent(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	twm, err := store.GetTeamWithMembers(ctx, uuid.New())
	require.NoError(t, err)
	require.Nil(t, twm)
}

func TestSQLiteTeams_Update(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "upd-creator")
	team := &models.Team{
		Name:        "Original Name",
		Description: "Original Desc",
		CreatedBy:   creatorID,
	}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))

	team.Name = "Updated Name"
	team.Description = "Updated Desc"
	err := store.UpdateTeam(ctx, team)
	require.NoError(t, err)

	got, err := store.GetTeam(ctx, team.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "Updated Name", got.Name)
	require.Equal(t, "Updated Desc", got.Description)
}

func TestSQLiteTeams_Delete(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "del-creator")
	memberID := createTeamTestUser(t, store, "del-member")
	team := &models.Team{
		Name:      "Delete Me",
		CreatedBy: creatorID,
	}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

	err := store.DeleteTeam(ctx, team.ID)
	require.NoError(t, err)

	got, err := store.GetTeam(ctx, team.ID)
	require.NoError(t, err)
	require.Nil(t, got, "deleted team should be nil")

	// Verify members were also deleted
	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Empty(t, members)
}

func TestSQLiteTeams_ListAll(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "list-creator")

	for i := 0; i < 3; i++ {
		team := &models.Team{
			Name:      "Team " + string(rune('A'+i)),
			CreatedBy: creatorID,
		}
		require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))
	}

	teams, err := store.ListTeams(ctx, nil, 0, 0)
	require.NoError(t, err)
	require.Len(t, teams, 3)
	// Verify alphabetical ordering
	require.Equal(t, "Team A", teams[0].Name)
	require.Equal(t, "Team B", teams[1].Name)
	require.Equal(t, "Team C", teams[2].Name)
}

func TestSQLiteTeams_ListByUser(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	user1 := createTeamTestUser(t, store, "filter-user1")
	user2 := createTeamTestUser(t, store, "filter-user2")

	team1 := &models.Team{Name: "User1 Team", CreatedBy: user1}
	team2 := &models.Team{Name: "User2 Team", CreatedBy: user2}
	require.NoError(t, store.CreateTeam(ctx, team1, []uuid.UUID{user1}))
	require.NoError(t, store.CreateTeam(ctx, team2, []uuid.UUID{user2}))

	teams, err := store.ListTeams(ctx, &user1, 0, 0)
	require.NoError(t, err)
	require.Len(t, teams, 1)
	require.Equal(t, "User1 Team", teams[0].Name)
}

func TestSQLiteTeams_ListPagination(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "page-creator")
	for i := 0; i < 5; i++ {
		team := &models.Team{
			Name:      "Page Team " + string(rune('A'+i)),
			CreatedBy: creatorID,
		}
		require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))
	}

	page1, err := store.ListTeams(ctx, nil, 2, 0)
	require.NoError(t, err)
	require.Len(t, page1, 2)

	page2, err := store.ListTeams(ctx, nil, 2, 2)
	require.NoError(t, err)
	require.Len(t, page2, 2)

	// Pages should not overlap
	require.NotEqual(t, page1[0].ID, page2[0].ID)
}

func TestSQLiteTeams_AddMember(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "add-creator")
	newMember := createTeamTestUser(t, store, "add-new")

	team := &models.Team{Name: "Add Member Team", CreatedBy: creatorID}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))

	err := store.AddTeamMember(ctx, team.ID, newMember, models.TeamRoleMember)
	require.NoError(t, err)

	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Len(t, members, 2)
}

func TestSQLiteTeams_RemoveMember(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "rm-creator")
	memberID := createTeamTestUser(t, store, "rm-member")

	team := &models.Team{Name: "Remove Member Team", CreatedBy: creatorID}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

	err := store.RemoveTeamMember(ctx, team.ID, memberID)
	require.NoError(t, err)

	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	require.Equal(t, creatorID, members[0].UserID)
}

func TestSQLiteTeams_UpdateMemberRole(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "role-creator")
	memberID := createTeamTestUser(t, store, "role-member")

	team := &models.Team{Name: "Role Update Team", CreatedBy: creatorID}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

	err := store.UpdateTeamMemberRole(ctx, team.ID, memberID, models.TeamRoleAdmin)
	require.NoError(t, err)

	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	for _, m := range members {
		if m.UserID == memberID {
			require.Equal(t, models.TeamRoleAdmin, m.Role)
			return
		}
	}
	t.Fatal("member not found after role update")
}

func TestSQLiteTeams_ListTeamMembers_OrderByRole(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "order-admin")
	memberID := createTeamTestUser(t, store, "order-member")

	team := &models.Team{Name: "Order Team", CreatedBy: creatorID}
	require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

	members, err := store.ListTeamMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Len(t, members, 2)
	// admin sorts before member alphabetically
	require.Equal(t, models.TeamRoleAdmin, members[0].Role)
	require.Equal(t, models.TeamRoleMember, members[1].Role)
}

func TestSQLiteTeams_GetUserTeams(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	user := createTeamTestUser(t, store, "userteams-user")
	other := createTeamTestUser(t, store, "userteams-other")

	team1 := &models.Team{Name: "UT Team 1", CreatedBy: user}
	team2 := &models.Team{Name: "UT Team 2", CreatedBy: other}
	require.NoError(t, store.CreateTeam(ctx, team1, []uuid.UUID{user}))
	require.NoError(t, store.CreateTeam(ctx, team2, []uuid.UUID{other, user}))

	teams, err := store.GetUserTeams(ctx, user)
	require.NoError(t, err)
	require.Len(t, teams, 2)
}

func TestSQLiteTeams_CreateWithEmptyMembers(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "empty-creator")
	team := &models.Team{
		Name:      "Empty Team",
		CreatedBy: creatorID,
	}

	err := store.CreateTeam(ctx, team, []uuid.UUID{})
	require.NoError(t, err)
	require.Equal(t, 0, team.MemberCount)

	got, err := store.GetTeam(ctx, team.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, 0, got.MemberCount)
}

func TestSQLiteTeams_CreateWithPresetID(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	creatorID := createTeamTestUser(t, store, "preset-creator")
	presetID := uuid.New()

	team := &models.Team{
		ID:        presetID,
		Name:      "Preset ID Team",
		CreatedBy: creatorID,
	}

	err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID})
	require.NoError(t, err)
	require.Equal(t, presetID, team.ID)
}

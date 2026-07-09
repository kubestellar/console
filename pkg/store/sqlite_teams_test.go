package store

import (
.beads/"context"
.beads/"testing"

.beads/"github.com/google/uuid"
.beads/"github.com/kubestellar/console/pkg/models"
.beads/"github.com/stretchr/testify/require"
)

func createTestUser(t *testing.T, s *SQLiteStore, login string) uuid.UUID {
.beads/t.Helper()
.beads/id := uuid.New()
.beads/err := s.CreateUser(context.Background(), &models.User{
.beads/beads.json ID:          id,
.beads/beads.json GitHubID:    "gh-" + login,
.beads/beads.json GitHubLogin: login,
.beads/beads.json Role:        "viewer",
.beads/})
.beads/require.NoError(t, err)
.beads/return id
}

func TestSQLiteTeams_CreateAndGet(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "creator")
.beads/memberID := createTestUser(t, store, "member1")

.beads/team := &models.Team{
.beads/beads.json Name:        "Alpha Team",
.beads/beads.json Description: "First team",
.beads/beads.json CreatedBy:   creatorID,
.beads/}

.beads/err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID})
.beads/require.NoError(t, err)
.beads/require.NotEqual(t, uuid.Nil, team.ID)
.beads/require.Equal(t, 2, team.MemberCount)

.beads/got, err := store.GetTeam(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.NotNil(t, got)
.beads/require.Equal(t, "Alpha Team", got.Name)
.beads/require.Equal(t, "First team", got.Description)
.beads/require.Equal(t, creatorID, got.CreatedBy)
.beads/require.Equal(t, 2, got.MemberCount)
}

func TestSQLiteTeams_CreateAssignsAdminToCreator(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "admin-creator")
.beads/memberID := createTestUser(t, store, "regular-member")

.beads/team := &models.Team{
.beads/beads.json Name:      "Role Test Team",
.beads/beads.json CreatedBy: creatorID,
.beads/}

.beads/err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID})
.beads/require.NoError(t, err)

.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Len(t, members, 2)

.beads/for _, m := range members {
.beads/beads.json if m.UserID == creatorID {
.beads/beads.json .beads/require.Equal(t, models.TeamRoleAdmin, m.Role, "creator should be admin")
.beads/beads.json } else {
.beads/beads.json .beads/require.Equal(t, models.TeamRoleMember, m.Role, "non-creator should be member")
.beads/beads.json }
.beads/}
}

func TestSQLiteTeams_GetNonExistent(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/got, err := store.GetTeam(ctx, uuid.New())
.beads/require.NoError(t, err)
.beads/require.Nil(t, got, "non-existent team should return nil")
}

func TestSQLiteTeams_GetWithMembers(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "wm-creator")
.beads/memberID := createTestUser(t, store, "wm-member")

.beads/team := &models.Team{
.beads/beads.json Name:      "Members Team",
.beads/beads.json CreatedBy: creatorID,
.beads/}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

.beads/twm, err := store.GetTeamWithMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.NotNil(t, twm)
.beads/require.Equal(t, "Members Team", twm.Team.Name)
.beads/require.Len(t, twm.Members, 2)
}

func TestSQLiteTeams_GetWithMembers_NonExistent(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/twm, err := store.GetTeamWithMembers(ctx, uuid.New())
.beads/require.NoError(t, err)
.beads/require.Nil(t, twm)
}

func TestSQLiteTeams_Update(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "upd-creator")
.beads/team := &models.Team{
.beads/beads.json Name:        "Original Name",
.beads/beads.json Description: "Original Desc",
.beads/beads.json CreatedBy:   creatorID,
.beads/}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))

.beads/team.Name = "Updated Name"
.beads/team.Description = "Updated Desc"
.beads/err := store.UpdateTeam(ctx, team)
.beads/require.NoError(t, err)

.beads/got, err := store.GetTeam(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Equal(t, "Updated Name", got.Name)
.beads/require.Equal(t, "Updated Desc", got.Description)
}

func TestSQLiteTeams_Delete(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "del-creator")
.beads/memberID := createTestUser(t, store, "del-member")
.beads/team := &models.Team{
.beads/beads.json Name:      "Delete Me",
.beads/beads.json CreatedBy: creatorID,
.beads/}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

.beads/err := store.DeleteTeam(ctx, team.ID)
.beads/require.NoError(t, err)

.beads/got, err := store.GetTeam(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Nil(t, got, "deleted team should be nil")

.beads/// Verify members were also deleted
.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Empty(t, members)
}

func TestSQLiteTeams_ListAll(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "list-creator")

.beads/for i := 0; i < 3; i++ {
.beads/beads.json team := &models.Team{
.beads/beads.json .beads/Name:      "Team " + string(rune('A'+i)),
.beads/beads.json .beads/CreatedBy: creatorID,
.beads/beads.json }
.beads/beads.json require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))
.beads/}

.beads/teams, err := store.ListTeams(ctx, nil, 0, 0)
.beads/require.NoError(t, err)
.beads/require.Len(t, teams, 3)
.beads/// Verify alphabetical ordering
.beads/require.Equal(t, "Team A", teams[0].Name)
.beads/require.Equal(t, "Team B", teams[1].Name)
.beads/require.Equal(t, "Team C", teams[2].Name)
}

func TestSQLiteTeams_ListByUser(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/user1 := createTestUser(t, store, "filter-user1")
.beads/user2 := createTestUser(t, store, "filter-user2")

.beads/team1 := &models.Team{Name: "User1 Team", CreatedBy: user1}
.beads/team2 := &models.Team{Name: "User2 Team", CreatedBy: user2}
.beads/require.NoError(t, store.CreateTeam(ctx, team1, []uuid.UUID{user1}))
.beads/require.NoError(t, store.CreateTeam(ctx, team2, []uuid.UUID{user2}))

.beads/teams, err := store.ListTeams(ctx, &user1, 0, 0)
.beads/require.NoError(t, err)
.beads/require.Len(t, teams, 1)
.beads/require.Equal(t, "User1 Team", teams[0].Name)
}

func TestSQLiteTeams_ListPagination(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "page-creator")
.beads/for i := 0; i < 5; i++ {
.beads/beads.json team := &models.Team{
.beads/beads.json .beads/Name:      "Page Team " + string(rune('A'+i)),
.beads/beads.json .beads/CreatedBy: creatorID,
.beads/beads.json }
.beads/beads.json require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))
.beads/}

.beads/page1, err := store.ListTeams(ctx, nil, 2, 0)
.beads/require.NoError(t, err)
.beads/require.Len(t, page1, 2)

.beads/page2, err := store.ListTeams(ctx, nil, 2, 2)
.beads/require.NoError(t, err)
.beads/require.Len(t, page2, 2)

.beads/// Pages should not overlap
.beads/require.NotEqual(t, page1[0].ID, page2[0].ID)
}

func TestSQLiteTeams_AddMember(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "add-creator")
.beads/newMember := createTestUser(t, store, "add-new")

.beads/team := &models.Team{Name: "Add Member Team", CreatedBy: creatorID}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID}))

.beads/err := store.AddTeamMember(ctx, team.ID, newMember, models.TeamRoleMember)
.beads/require.NoError(t, err)

.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Len(t, members, 2)
}

func TestSQLiteTeams_RemoveMember(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "rm-creator")
.beads/memberID := createTestUser(t, store, "rm-member")

.beads/team := &models.Team{Name: "Remove Member Team", CreatedBy: creatorID}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

.beads/err := store.RemoveTeamMember(ctx, team.ID, memberID)
.beads/require.NoError(t, err)

.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Len(t, members, 1)
.beads/require.Equal(t, creatorID, members[0].UserID)
}

func TestSQLiteTeams_UpdateMemberRole(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "role-creator")
.beads/memberID := createTestUser(t, store, "role-member")

.beads/team := &models.Team{Name: "Role Update Team", CreatedBy: creatorID}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

.beads/err := store.UpdateTeamMemberRole(ctx, team.ID, memberID, models.TeamRoleAdmin)
.beads/require.NoError(t, err)

.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/for _, m := range members {
.beads/beads.json if m.UserID == memberID {
.beads/beads.json .beads/require.Equal(t, models.TeamRoleAdmin, m.Role)
.beads/beads.json .beads/return
.beads/beads.json }
.beads/}
.beads/t.Fatal("member not found after role update")
}

func TestSQLiteTeams_ListTeamMembers_OrderByRole(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "order-admin")
.beads/memberID := createTestUser(t, store, "order-member")

.beads/team := &models.Team{Name: "Order Team", CreatedBy: creatorID}
.beads/require.NoError(t, store.CreateTeam(ctx, team, []uuid.UUID{creatorID, memberID}))

.beads/members, err := store.ListTeamMembers(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Len(t, members, 2)
.beads/// admin sorts before member alphabetically
.beads/require.Equal(t, models.TeamRoleAdmin, members[0].Role)
.beads/require.Equal(t, models.TeamRoleMember, members[1].Role)
}

func TestSQLiteTeams_GetUserTeams(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/user := createTestUser(t, store, "userteams-user")
.beads/other := createTestUser(t, store, "userteams-other")

.beads/team1 := &models.Team{Name: "UT Team 1", CreatedBy: user}
.beads/team2 := &models.Team{Name: "UT Team 2", CreatedBy: other}
.beads/require.NoError(t, store.CreateTeam(ctx, team1, []uuid.UUID{user}))
.beads/require.NoError(t, store.CreateTeam(ctx, team2, []uuid.UUID{other, user}))

.beads/teams, err := store.GetUserTeams(ctx, user)
.beads/require.NoError(t, err)
.beads/require.Len(t, teams, 2)
}

func TestSQLiteTeams_CreateWithEmptyMembers(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "empty-creator")
.beads/team := &models.Team{
.beads/beads.json Name:      "Empty Team",
.beads/beads.json CreatedBy: creatorID,
.beads/}

.beads/err := store.CreateTeam(ctx, team, []uuid.UUID{})
.beads/require.NoError(t, err)
.beads/require.Equal(t, 0, team.MemberCount)

.beads/got, err := store.GetTeam(ctx, team.ID)
.beads/require.NoError(t, err)
.beads/require.Equal(t, 0, got.MemberCount)
}

func TestSQLiteTeams_CreateWithPresetID(t *testing.T) {
.beads/store := OpenTestDB(t)
.beads/ctx := context.Background()

.beads/creatorID := createTestUser(t, store, "preset-creator")
.beads/presetID := uuid.New()

.beads/team := &models.Team{
.beads/beads.json ID:        presetID,
.beads/beads.json Name:      "Preset ID Team",
.beads/beads.json CreatedBy: creatorID,
.beads/}

.beads/err := store.CreateTeam(ctx, team, []uuid.UUID{creatorID})
.beads/require.NoError(t, err)
.beads/require.Equal(t, presetID, team.ID)
}

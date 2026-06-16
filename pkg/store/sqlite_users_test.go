package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- User CRUD tests ---

func TestSQLiteStore_CreateAndGetUser(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	user := &models.User{
		ID:          userID,
		GitHubID:    "gh-12345",
		GitHubLogin: "testuser",
		Email:       "test@example.com",
		AvatarURL:   "https://avatars.example.com/1",
		Role:        models.UserRoleViewer,
	}

	err := s.CreateUser(ctx, user)
	require.NoError(t, err)

	got, err := s.GetUser(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, userID, got.ID)
	assert.Equal(t, "gh-12345", got.GitHubID)
	assert.Equal(t, "testuser", got.GitHubLogin)
	assert.Equal(t, "test@example.com", got.Email)
	assert.Equal(t, "https://avatars.example.com/1", got.AvatarURL)
	assert.Equal(t, models.UserRoleViewer, got.Role)
	assert.False(t, got.Onboarded)
	assert.False(t, got.CreatedAt.IsZero())
}

func TestSQLiteStore_CreateUser_DefaultRole(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-default-role",
		GitHubLogin: "defaultrole",
	}

	err := s.CreateUser(ctx, user)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, user.ID) // auto-generated

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, models.UserRoleViewer, got.Role)
}

func TestSQLiteStore_GetUser_NotFound(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	got, err := s.GetUser(ctx, uuid.New())
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestSQLiteStore_GetUserByGitHubID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-lookup-id",
		GitHubLogin: "lookupuser",
		Role:        models.UserRoleEditor,
	}
	require.NoError(t, s.CreateUser(ctx, user))

	got, err := s.GetUserByGitHubID(ctx, "gh-lookup-id")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "lookupuser", got.GitHubLogin)
	assert.Equal(t, models.UserRoleEditor, got.Role)
}

func TestSQLiteStore_GetUserByGitHubID_NotFound(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	got, err := s.GetUserByGitHubID(ctx, "nonexistent")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestSQLiteStore_GetUserByGitHubLogin(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-login-lookup",
		GitHubLogin: "LoginUser",
		Role:        models.UserRoleAdmin,
	}
	require.NoError(t, s.CreateUser(ctx, user))

	// Case-insensitive lookup.
	got, err := s.GetUserByGitHubLogin(ctx, "loginuser")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "LoginUser", got.GitHubLogin)
	assert.Equal(t, models.UserRoleAdmin, got.Role)
}

func TestSQLiteStore_UpdateUser(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-update",
		GitHubLogin: "updateuser",
		Email:       "old@example.com",
		Role:        models.UserRoleViewer,
	}
	require.NoError(t, s.CreateUser(ctx, user))

	user.Email = "new@example.com"
	user.Role = models.UserRoleEditor
	user.Onboarded = true
	require.NoError(t, s.UpdateUser(ctx, user))

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "new@example.com", got.Email)
	assert.Equal(t, models.UserRoleEditor, got.Role)
	assert.True(t, got.Onboarded)
}

func TestSQLiteStore_DeleteUser(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-delete",
		GitHubLogin: "deleteuser",
	}
	require.NoError(t, s.CreateUser(ctx, user))

	err := s.DeleteUser(ctx, user.ID)
	require.NoError(t, err)

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestSQLiteStore_ListUsers(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	// Create 3 users.
	for i := 0; i < 3; i++ {
		require.NoError(t, s.CreateUser(ctx, &models.User{
			GitHubID:    "gh-list-" + uuid.New().String()[:8],
			GitHubLogin: "listuser-" + uuid.New().String()[:8],
		}))
	}

	users, err := s.ListUsers(ctx, 10, 0)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(users), 3)
}

func TestSQLiteStore_ListUsers_Pagination(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		require.NoError(t, s.CreateUser(ctx, &models.User{
			GitHubID:    "gh-page-" + uuid.New().String()[:8],
			GitHubLogin: "pageuser-" + uuid.New().String()[:8],
		}))
	}

	page1, err := s.ListUsers(ctx, 2, 0)
	require.NoError(t, err)
	assert.Len(t, page1, 2)

	page2, err := s.ListUsers(ctx, 2, 2)
	require.NoError(t, err)
	assert.Len(t, page2, 2)

	// Pages should have different users.
	assert.NotEqual(t, page1[0].ID, page2[0].ID)
}

func TestSQLiteStore_UpdateUserRole(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-role-update",
		GitHubLogin: "roleuser",
		Role:        models.UserRoleViewer,
	}
	require.NoError(t, s.CreateUser(ctx, user))

	// Valid role change.
	err := s.UpdateUserRole(ctx, user.ID, "admin")
	require.NoError(t, err)

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, models.UserRoleAdmin, got.Role)
}

func TestSQLiteStore_UpdateUserRole_Invalid(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-bad-role",
		GitHubLogin: "badrole",
	}
	require.NoError(t, s.CreateUser(ctx, user))

	err := s.UpdateUserRole(ctx, user.ID, "superadmin")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid role")
}

func TestSQLiteStore_UpdateLastLogin(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-login-time",
		GitHubLogin: "logintime",
	}
	require.NoError(t, s.CreateUser(ctx, user))

	err := s.UpdateLastLogin(ctx, user.ID)
	require.NoError(t, err)

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got.LastLogin)
	assert.WithinDuration(t, time.Now(), *got.LastLogin, 5*time.Second)
}

func TestSQLiteStore_CountUsersByRole(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	// Create users with different roles.
	for _, role := range []models.UserRole{models.UserRoleAdmin, models.UserRoleEditor, models.UserRoleViewer, models.UserRoleViewer} {
		require.NoError(t, s.CreateUser(ctx, &models.User{
			GitHubID:    "gh-count-" + uuid.New().String()[:8],
			GitHubLogin: "count-" + uuid.New().String()[:8],
			Role:        role,
		}))
	}

	admins, editors, viewers, err := s.CountUsersByRole(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, admins, 1)
	assert.GreaterOrEqual(t, editors, 1)
	assert.GreaterOrEqual(t, viewers, 2)
}

// --- Onboarding tests ---

func TestSQLiteStore_SetUserOnboarded(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-onboard",
		GitHubLogin: "onboarduser",
	}
	require.NoError(t, s.CreateUser(ctx, user))
	assert.False(t, user.Onboarded)

	err := s.SetUserOnboarded(ctx, user.ID)
	require.NoError(t, err)

	got, err := s.GetUser(ctx, user.ID)
	require.NoError(t, err)
	assert.True(t, got.Onboarded)
}

func TestSQLiteStore_SaveAndGetOnboardingResponses(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-responses",
		GitHubLogin: "responseuser",
	}
	require.NoError(t, s.CreateUser(ctx, user))

	resp := &models.OnboardingResponse{
		UserID:      user.ID,
		QuestionKey: "team_size",
		Answer:      "5-10",
	}
	err := s.SaveOnboardingResponse(ctx, resp)
	require.NoError(t, err)

	responses, err := s.GetOnboardingResponses(ctx, user.ID)
	require.NoError(t, err)
	require.Len(t, responses, 1)
	assert.Equal(t, "team_size", responses[0].QuestionKey)
	assert.Equal(t, "5-10", responses[0].Answer)
}

func TestSQLiteStore_SaveOnboardingResponse_Upsert(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	user := &models.User{
		GitHubID:    "gh-upsert",
		GitHubLogin: "upsertuser",
	}
	require.NoError(t, s.CreateUser(ctx, user))

	// First save.
	resp := &models.OnboardingResponse{
		UserID:      user.ID,
		QuestionKey: "role",
		Answer:      "developer",
	}
	require.NoError(t, s.SaveOnboardingResponse(ctx, resp))

	// Upsert with new answer.
	resp2 := &models.OnboardingResponse{
		UserID:      user.ID,
		QuestionKey: "role",
		Answer:      "platform-engineer",
	}
	require.NoError(t, s.SaveOnboardingResponse(ctx, resp2))

	responses, err := s.GetOnboardingResponses(ctx, user.ID)
	require.NoError(t, err)
	require.Len(t, responses, 1) // Still 1 row (upserted, not duplicated).
	assert.Equal(t, "platform-engineer", responses[0].Answer)
}

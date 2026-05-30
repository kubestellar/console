package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/require"
)

func TestUserOperations(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	t.Run("CreateUser assigns ID and timestamp", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-100",
			GitHubLogin: "alice",
			Email:       "alice@example.com",
			Role:        models.UserRoleViewer,
		}

		err := store.CreateUser(ctx, user)
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, user.ID)
		require.False(t, user.CreatedAt.IsZero())
	})

	t.Run("GetUser retrieves user by ID", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-200",
			GitHubLogin: "bob",
			Email:       "bob@example.com",
			Role:        models.UserRoleEditor,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		retrieved, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "bob", retrieved.GitHubLogin)
		require.Equal(t, models.UserRoleEditor, retrieved.Role)
	})

	t.Run("GetUserByGitHubID retrieves user", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-300",
			GitHubLogin: "carol",
			Email:       "carol@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		retrieved, err := store.GetUserByGitHubID(ctx, "gh-300")
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "carol", retrieved.GitHubLogin)
	})

	t.Run("GetUserByGitHubLogin is case-insensitive", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-400",
			GitHubLogin: "DaveUser",
			Email:       "dave@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		// Lowercase search
		retrieved, err := store.GetUserByGitHubLogin(ctx, "daveuser")
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "DaveUser", retrieved.GitHubLogin)

		// Uppercase search
		retrieved, err = store.GetUserByGitHubLogin(ctx, "DAVEUSER")
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		require.Equal(t, "DaveUser", retrieved.GitHubLogin)
	})

	t.Run("GetUser returns nil for non-existent ID", func(t *testing.T) {
		nonExistentID := uuid.New()
		retrieved, err := store.GetUser(ctx, nonExistentID)
		require.NoError(t, err)
		require.Nil(t, retrieved)
	})

	t.Run("UpdateUser modifies fields", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-500",
			GitHubLogin: "eve",
			Email:       "eve@example.com",
			Role:        models.UserRoleViewer,
			Onboarded:   false,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		user.Email = "eve.updated@example.com"
		user.Onboarded = true
		err = store.UpdateUser(ctx, user)
		require.NoError(t, err)

		retrieved, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, "eve.updated@example.com", retrieved.Email)
		require.True(t, retrieved.Onboarded)
	})

	t.Run("UpdateUserRole changes role", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-600",
			GitHubLogin: "frank",
			Email:       "frank@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		err = store.UpdateUserRole(ctx, user.ID, "admin")
		require.NoError(t, err)

		retrieved, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, models.UserRoleAdmin, retrieved.Role)
	})

	t.Run("UpdateUserRole rejects invalid role", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-700",
			GitHubLogin: "grace",
			Email:       "grace@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		err = store.UpdateUserRole(ctx, user.ID, "superadmin")
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid role")
	})

	t.Run("DeleteUser removes user", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-800",
			GitHubLogin: "heidi",
			Email:       "heidi@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		err = store.DeleteUser(ctx, user.ID)
		require.NoError(t, err)

		retrieved, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.Nil(t, retrieved)
	})

	t.Run("ListUsers returns paginated users", func(t *testing.T) {
		s := OpenTestDB(t)

		for i := 0; i < 5; i++ {
			user := &models.User{
				GitHubID:    "gh-list-" + string(rune('0'+i)),
				GitHubLogin: "user" + string(rune('a'+i)),
				Email:       "user@example.com",
				Role:        models.UserRoleViewer,
			}
			err := s.CreateUser(ctx, user)
			require.NoError(t, err)
		}

		users, err := s.ListUsers(ctx, 0, 0)
		require.NoError(t, err)
		require.Len(t, users, 5)
	})

	t.Run("CountUsersByRole returns correct counts", func(t *testing.T) {
		s := OpenTestDB(t)

		// Create admin
		admin := &models.User{
			GitHubID:    "gh-admin",
			GitHubLogin: "admin1",
			Email:       "admin@example.com",
			Role:        models.UserRoleAdmin,
		}
		err := s.CreateUser(ctx, admin)
		require.NoError(t, err)

		// Create editor
		editor := &models.User{
			GitHubID:    "gh-editor",
			GitHubLogin: "editor1",
			Email:       "editor@example.com",
			Role:        models.UserRoleEditor,
		}
		err = s.CreateUser(ctx, editor)
		require.NoError(t, err)

		// Create viewers
		for i := 0; i < 3; i++ {
			viewer := &models.User{
				GitHubID:    "gh-viewer-" + string(rune('0'+i)),
				GitHubLogin: "viewer" + string(rune('a'+i)),
				Email:       "viewer@example.com",
				Role:        models.UserRoleViewer,
			}
			err = s.CreateUser(ctx, viewer)
			require.NoError(t, err)
		}

		admins, editors, viewers, err := s.CountUsersByRole(ctx)
		require.NoError(t, err)
		require.Equal(t, 1, admins)
		require.Equal(t, 1, editors)
		require.Equal(t, 3, viewers)
	})

	t.Run("UpdateLastLogin sets timestamp", func(t *testing.T) {
		user := &models.User{
			GitHubID:    "gh-900",
			GitHubLogin: "ivan",
			Email:       "ivan@example.com",
			Role:        models.UserRoleViewer,
		}
		err := store.CreateUser(ctx, user)
		require.NoError(t, err)

		err = store.UpdateLastLogin(ctx, user.ID)
		require.NoError(t, err)

		retrieved, err := store.GetUser(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved.LastLogin)
	})
}

func TestOnboardingOperations(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	_, err := store.db.ExecContext(ctx,
		`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		userID.String(), "gh-onboard", "onboarduser", "viewer", 0,
	)
	require.NoError(t, err)

	t.Run("SaveOnboardingResponse stores answer", func(t *testing.T) {
		resp := &models.OnboardingResponse{
			UserID:      userID,
			QuestionKey: "role",
			Answer:      "SRE",
		}

		err := store.SaveOnboardingResponse(ctx, resp)
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, resp.ID)
	})

	t.Run("GetOnboardingResponses retrieves answers", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-onboard2", "onboarduser2", "viewer", 0,
		)
		require.NoError(t, err)

		// Save multiple responses
		for i, key := range []string{"role", "team", "goals"} {
			resp := &models.OnboardingResponse{
				UserID:      uid,
				QuestionKey: key,
				Answer:      "Answer " + string(rune('A'+i)),
			}
			err := s.SaveOnboardingResponse(ctx, resp)
			require.NoError(t, err)
		}

		responses, err := s.GetOnboardingResponses(ctx, uid)
		require.NoError(t, err)
		require.Len(t, responses, 3)
	})

	t.Run("SaveOnboardingResponse is upsert (updates existing)", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-onboard3", "onboarduser3", "viewer", 0,
		)
		require.NoError(t, err)

		resp := &models.OnboardingResponse{
			UserID:      uid,
			QuestionKey: "role",
			Answer:      "DevOps",
		}
		err = s.SaveOnboardingResponse(ctx, resp)
		require.NoError(t, err)

		// Update same question
		resp.Answer = "SRE"
		err = s.SaveOnboardingResponse(ctx, resp)
		require.NoError(t, err)

		responses, err := s.GetOnboardingResponses(ctx, uid)
		require.NoError(t, err)
		require.Len(t, responses, 1)
		require.Equal(t, "SRE", responses[0].Answer)
	})

	t.Run("SetUserOnboarded marks user as onboarded", func(t *testing.T) {
		s := OpenTestDB(t)
		uid := uuid.New()
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, github_id, github_login, role, onboarded, created_at)
			 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			uid.String(), "gh-onboard4", "onboarduser4", "viewer", 0,
		)
		require.NoError(t, err)

		err = s.SetUserOnboarded(ctx, uid)
		require.NoError(t, err)

		var onboarded int
		err = s.db.QueryRowContext(ctx, "SELECT onboarded FROM users WHERE id = ?", uid.String()).Scan(&onboarded)
		require.NoError(t, err)
		require.Equal(t, 1, onboarded)
	})
}

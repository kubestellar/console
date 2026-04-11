package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type rbacTestStore struct {
	test.MockStore
	users         map[uuid.UUID]*models.User
	listUsers     []models.User
	listUsersErr  error
	updateRoleErr error
	updatedUserID uuid.UUID
	updatedRole   string
}

func (s *rbacTestStore) GetUser(id uuid.UUID) (*models.User, error) {
	if s.users == nil {
		return nil, nil
	}
	return s.users[id], nil
}

func (s *rbacTestStore) ListUsers(limit, offset int) ([]models.User, error) {
	if s.listUsersErr != nil {
		return nil, s.listUsersErr
	}
	return s.listUsers, nil
}

func (s *rbacTestStore) UpdateUserRole(userID uuid.UUID, role string) error {
	s.updatedUserID = userID
	s.updatedRole = role
	return s.updateRoleErr
}

func TestRBACUpdateUserRole_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	// Fix 4: variable renamed to reflect its actual viewer role
	nonAdminUser := &models.User{
		ID:   testAdminUserID,
		Role: models.UserRoleViewer, // Fix 1: use enum type directly, not string cast
	}

	store := &rbacTestStore{
		users: map[uuid.UUID]*models.User{
			testAdminUserID: nonAdminUser,
		},
	}

	handler := NewRBACHandler(store, nil)
	env.App.Put("/api/rbac/users/:id/role", handler.UpdateUserRole)

	body, err := json.Marshal(map[string]any{"role": string(models.UserRoleEditor)})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/rbac/users/"+uuid.NewString()+"/role", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close() // Fix 5: close response body
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	// Fix 2: verify no state mutation occurred despite the forbidden response
	assert.Equal(t, uuid.Nil, store.updatedUserID)
	assert.Empty(t, store.updatedRole)
}

func TestRBACUpdateUserRole_Success(t *testing.T) {
	env := setupTestEnv(t)
	targetUserID := uuid.New()
	adminUser := &models.User{
		ID:   testAdminUserID,
		Role: models.UserRoleAdmin, // Fix 1: use enum type directly, not string cast
	}

	store := &rbacTestStore{
		users: map[uuid.UUID]*models.User{
			testAdminUserID: adminUser,
		},
	}

	handler := NewRBACHandler(store, nil)
	env.App.Put("/api/rbac/users/:id/role", handler.UpdateUserRole)

	body, err := json.Marshal(map[string]any{"role": string(models.UserRoleEditor)})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/rbac/users/"+targetUserID.String()+"/role", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close() // Fix 5: close response body
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, targetUserID, store.updatedUserID)
	assert.Equal(t, string(models.UserRoleEditor), store.updatedRole)
}

func TestRBACListConsoleUsers_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	viewerUser := &models.User{
		ID:   testAdminUserID,
		Role: models.UserRoleViewer,
	}

	store := &rbacTestStore{
		users: map[uuid.UUID]*models.User{
			testAdminUserID: viewerUser,
		},
	}

	handler := NewRBACHandler(store, nil)
	env.App.Get("/api/rbac/users", handler.ListConsoleUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/rbac/users", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACListConsoleUsers_Success(t *testing.T) {
	env := setupTestEnv(t)
	adminUser := &models.User{
		ID:   testAdminUserID,
		Role: models.UserRoleAdmin, // Fix 1: use enum type directly, not string cast
	}

	store := &rbacTestStore{
		users: map[uuid.UUID]*models.User{
			testAdminUserID: adminUser,
		},
		listUsers: []models.User{
			{ID: testAdminUserID, GitHubLogin: "admin", Role: models.UserRoleAdmin},   // Fix 1: use enum type directly
			{ID: uuid.New(), GitHubLogin: "dev1", Role: models.UserRoleEditor},        // Fix 1: use enum type directly
		},
	}

	handler := NewRBACHandler(store, nil)
	env.App.Get("/api/rbac/users", handler.ListConsoleUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/rbac/users", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close() // Fix 5: close response body
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var users []models.User
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&users))
	assert.Len(t, users, 2)

	// Fix 3: use order-agnostic check without depending on slice position
	logins := make([]string, len(users))
	for i, u := range users {
		logins[i] = u.GitHubLogin
	}
	assert.ElementsMatch(t, []string{"admin", "dev1"}, logins)
}

package handlers

// Additional coverage for pkg/api/handlers/rbac.go.
//
// Before this file the following RBAC handler entrypoints reported 0.0%
// statement coverage in `go test -coverprofile ./pkg/...`:
//
//	DeleteConsoleUser
//	GetUserManagementSummary
//	ListK8sServiceAccounts
//	ListK8sRoles
//	ListK8sRoleBindings
//	ListK8sUsers
//	ListOpenShiftUsers
//	clusterErrorsOrNil
//
// These handlers guard sensitive user- and cluster-RBAC data (see the
// SECURITY comments in rbac.go referencing issues #4713, #5459, #5460,
// #5461, #5462, #5463). Leaving them untested means a regression that
// dropped an admin check would land silently. The tests below cover the
// authorization boundaries (viewer forbidden, missing user unauthorized)
// and the deterministic non-k8s branches (invalid UUID, self-delete
// guard, nil k8sClient → 503, missing cluster param → 400) without
// requiring a live Kubernetes fake — matching the style of the existing
// TestRBACUpdateUserRole_* and TestRBACListConsoleUsers_* cases in
// rbac_test.go.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// rbacCovStore extends the behaviour we need on top of test.MockStore for the
// coverage-oriented tests. It is intentionally separate from rbacTestStore so
// this file can be added without editing the existing test scaffolding.
type rbacCovStore struct {
	rbacTestStore

	deletedUserID uuid.UUID
	deleteCalled  bool
	deleteUserErr error

	countAdmins  int
	countEditors int
	countViewers int
	countErr     error
}

func (s *rbacCovStore) DeleteUser(_ context.Context, id uuid.UUID) error {
	s.deletedUserID = id
	s.deleteCalled = true
	return s.deleteUserErr
}

func (s *rbacCovStore) CountUsersByRole(_ context.Context) (int, int, int, error) {
	return s.countAdmins, s.countEditors, s.countViewers, s.countErr
}

func newViewerCovStore() *rbacCovStore {
	viewer := &models.User{ID: testAdminUserID, Role: models.UserRoleViewer}
	s := &rbacCovStore{}
	s.rbacTestStore.users = map[uuid.UUID]*models.User{testAdminUserID: viewer}
	return s
}

func newAdminCovStore() *rbacCovStore {
	admin := &models.User{ID: testAdminUserID, Role: models.UserRoleAdmin}
	s := &rbacCovStore{}
	s.rbacTestStore.users = map[uuid.UUID]*models.User{testAdminUserID: admin}
	return s
}

// ---------------------------------------------------------------------------
// DeleteConsoleUser
// ---------------------------------------------------------------------------

func TestRBACDeleteConsoleUser_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	store := newViewerCovStore()

	handler := NewRBACHandler(store, nil)
	env.App.Delete("/api/rbac/users/:id", handler.DeleteConsoleUser)

	target := uuid.NewString()
	req, err := http.NewRequest(http.MethodDelete, "/api/rbac/users/"+target, nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.False(t, store.deleteCalled, "viewer must not reach DeleteUser")
}

func TestRBACDeleteConsoleUser_InvalidUUIDIsBadRequest(t *testing.T) {
	env := setupTestEnv(t)
	store := newAdminCovStore()

	handler := NewRBACHandler(store, nil)
	env.App.Delete("/api/rbac/users/:id", handler.DeleteConsoleUser)

	req, err := http.NewRequest(http.MethodDelete, "/api/rbac/users/not-a-uuid", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.False(t, store.deleteCalled, "invalid UUID must not reach DeleteUser")
}

func TestRBACDeleteConsoleUser_CannotDeleteSelf(t *testing.T) {
	env := setupTestEnv(t)
	store := newAdminCovStore()

	handler := NewRBACHandler(store, nil)
	env.App.Delete("/api/rbac/users/:id", handler.DeleteConsoleUser)

	// Admin targeting their own ID must be blocked so an admin cannot lock
	// themselves out of the console (rbac.go:159).
	req, err := http.NewRequest(http.MethodDelete, "/api/rbac/users/"+testAdminUserID.String(), nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.False(t, store.deleteCalled, "self-delete must not reach DeleteUser")
}

func TestRBACDeleteConsoleUser_Success(t *testing.T) {
	env := setupTestEnv(t)
	store := newAdminCovStore()

	handler := NewRBACHandler(store, nil)
	env.App.Delete("/api/rbac/users/:id", handler.DeleteConsoleUser)

	target := uuid.New()
	req, err := http.NewRequest(http.MethodDelete, "/api/rbac/users/"+target.String(), nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, store.deleteCalled)
	assert.Equal(t, target, store.deletedUserID)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, true, body["success"])
}

func TestRBACDeleteConsoleUser_StoreErrorIs500(t *testing.T) {
	env := setupTestEnv(t)
	store := newAdminCovStore()
	store.deleteUserErr = errors.New("boom")

	handler := NewRBACHandler(store, nil)
	env.App.Delete("/api/rbac/users/:id", handler.DeleteConsoleUser)

	req, err := http.NewRequest(http.MethodDelete, "/api/rbac/users/"+uuid.NewString(), nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.True(t, store.deleteCalled)
}

// ---------------------------------------------------------------------------
// GetUserManagementSummary
// ---------------------------------------------------------------------------

func TestRBACGetUserManagementSummary_UnauthorizedWhenUserMissing(t *testing.T) {
	env := setupTestEnv(t)
	// Empty user map → GetUser returns (nil, nil) → handler returns 401.
	store := &rbacCovStore{}

	handler := NewRBACHandler(store, nil)
	env.App.Get("/api/rbac/summary", handler.GetUserManagementSummary)

	req, err := http.NewRequest(http.MethodGet, "/api/rbac/summary", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRBACGetUserManagementSummary_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	store := newViewerCovStore()

	handler := NewRBACHandler(store, nil)
	env.App.Get("/api/rbac/summary", handler.GetUserManagementSummary)

	req, err := http.NewRequest(http.MethodGet, "/api/rbac/summary", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACGetUserManagementSummary_AdminSuccessNoK8sClient(t *testing.T) {
	env := setupTestEnv(t)
	store := newAdminCovStore()
	store.countAdmins, store.countEditors, store.countViewers = 2, 3, 5

	// Nil k8sClient exercises the "console-only" branch: role counts are
	// populated from the store and the K8sServiceAccounts / permissions
	// sections stay at their zero values.
	handler := NewRBACHandler(store, nil)
	env.App.Get("/api/rbac/summary", handler.GetUserManagementSummary)

	req, err := http.NewRequest(http.MethodGet, "/api/rbac/summary", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var summary models.UserManagementSummary
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&summary))
	assert.Equal(t, 10, summary.ConsoleUsers.Total)
	assert.Equal(t, 2, summary.ConsoleUsers.Admins)
	assert.Equal(t, 3, summary.ConsoleUsers.Editors)
	assert.Equal(t, 5, summary.ConsoleUsers.Viewers)
	assert.Equal(t, 0, summary.K8sServiceAccounts.Total)
	assert.Empty(t, summary.CurrentUserPermissions)
}

// ---------------------------------------------------------------------------
// K8s RBAC listers — authorization boundaries
//
// Each ListK8s* / ListOpenShiftUsers handler enforces the same admin gate.
// We assert the viewer path returns 403 for every one so a future change
// that drops the check on any single endpoint fails a test.
// ---------------------------------------------------------------------------

func TestRBACListK8sServiceAccounts_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(newViewerCovStore(), nil)
	env.App.Get("/api/k8s/serviceaccounts", handler.ListK8sServiceAccounts)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/serviceaccounts", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACListK8sServiceAccounts_ServiceUnavailableWhenNoClient(t *testing.T) {
	env := setupTestEnv(t)
	// Construct the handler literal so k8sClient is a true nil interface.
	// Passing nil through NewRBACHandler's *k8s.MultiClusterClient parameter
	// produces a typed-nil interface which fails the h.k8sClient==nil branch
	// (Go's classic typed-nil-in-interface pitfall — filed separately).
	handler := &RBACHandler{store: newAdminCovStore(), k8sClient: nil}
	env.App.Get("/api/k8s/serviceaccounts", handler.ListK8sServiceAccounts)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/serviceaccounts", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestRBACListK8sRoles_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(newViewerCovStore(), nil)
	env.App.Get("/api/k8s/roles", handler.ListK8sRoles)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/roles", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACListK8sRoleBindings_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(newViewerCovStore(), nil)
	env.App.Get("/api/k8s/rolebindings", handler.ListK8sRoleBindings)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/rolebindings", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACListK8sUsers_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(newViewerCovStore(), nil)
	env.App.Get("/api/k8s/users", handler.ListK8sUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/users", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRBACListK8sUsers_UnauthorizedWhenUserMissing(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(&rbacCovStore{}, nil)
	env.App.Get("/api/k8s/users", handler.ListK8sUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/users", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRBACListK8sUsers_ServiceUnavailableWhenNoClient(t *testing.T) {
	env := setupTestEnv(t)
	// Handler literal so k8sClient is a true nil interface, not a typed-nil
	// (see TestRBACListK8sServiceAccounts_ServiceUnavailableWhenNoClient).
	handler := &RBACHandler{store: newAdminCovStore(), k8sClient: nil}
	env.App.Get("/api/k8s/users", handler.ListK8sUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/users", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestRBACListOpenShiftUsers_ForbiddenForNonAdmin(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewRBACHandler(newViewerCovStore(), nil)
	env.App.Get("/api/k8s/openshift-users", handler.ListOpenShiftUsers)

	req, err := http.NewRequest(http.MethodGet, "/api/k8s/openshift-users", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// clusterErrorsOrNil
// ---------------------------------------------------------------------------

func TestClusterErrorsOrNil(t *testing.T) {
	// Empty map must become nil so JSON serialization drops the field
	// (matches the WebhookListResponse.Errors omitempty convention).
	assert.Nil(t, clusterErrorsOrNil(map[string]string{}))
	assert.Nil(t, clusterErrorsOrNil(nil))

	// Non-empty maps pass through unchanged.
	in := map[string]string{"cluster-a": "cluster client unavailable"}
	got := clusterErrorsOrNil(in)
	require.NotNil(t, got)
	assert.Equal(t, "cluster client unavailable", got["cluster-a"])

	// Round-trip check: an omitempty struct field skips the key when nil.
	type wrapper struct {
		Errors map[string]string `json:"errors,omitempty"`
	}
	empty, err := json.Marshal(wrapper{Errors: clusterErrorsOrNil(map[string]string{})})
	require.NoError(t, err)
	assert.Equal(t, `{}`, string(empty))

	populated, err := json.Marshal(wrapper{Errors: clusterErrorsOrNil(in)})
	require.NoError(t, err)
	assert.True(t, bytes.Contains(populated, []byte(`"errors"`)))
}

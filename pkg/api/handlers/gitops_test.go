package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func setupGitOpsTest() (*fiber.App, *GitOpsHandlers) {
	app := fiber.New()
	// Pass nil userStore — requireAdmin treats this as dev/demo and skips
	// the role check, which is what these existing tests expect.
	handler := NewGitOpsHandlers(nil, nil, nil)
	return app, handler
}

func writeFakeHelm(t *testing.T, script string) (binDir string, argsFile string) {
	t.Helper()

	binDir = t.TempDir()
	argsFile = filepath.Join(binDir, "helm_args.txt")
	helmPath := filepath.Join(binDir, "helm")

	require.NoError(t, os.WriteFile(helmPath, []byte(script), 0o755))

	originalPath := os.Getenv("PATH")
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+originalPath)
	t.Setenv("HELM_ARGS_FILE", argsFile)

	return binDir, argsFile
}

func TestGitOps_ListHelmHistory_Validation_MissingRelease(t *testing.T) {
	app, handler := setupGitOpsTest()
	app.Get("/api/gitops/helm/history", handler.ListHelmHistory)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/history?namespace=default", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	// When release is empty the handler returns 200 with an empty history
	// so callers querying before their data context hydrates get a valid response.
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string][]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Empty(t, body["history"])
}

func TestGitOps_ListHelmHistory_Validation_InvalidClusterName(t *testing.T) {
	app, handler := setupGitOpsTest()
	app.Get("/api/gitops/helm/history", handler.ListHelmHistory)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/history?release=my-release&cluster=bad;name", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "cluster contains invalid character")
}

func TestGitOps_ListHelmHistory_UsesClusterAndNamespaceFilters(t *testing.T) {
	_, argsFile := writeFakeHelm(t, "#!/bin/sh\necho \"$@\" > \"$HELM_ARGS_FILE\"\necho '[{\"revision\":1,\"updated\":\"now\",\"status\":\"deployed\",\"chart\":\"nginx\",\"app_version\":\"1.0\",\"description\":\"ok\"}]'\n")

	app, handler := setupGitOpsTest()
	app.Get("/api/gitops/helm/history", handler.ListHelmHistory)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/history?cluster=prod-east&namespace=payments&release=orders", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	argsBytes, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	args := string(argsBytes)
	assert.Contains(t, args, "history orders")
	assert.Contains(t, args, "-n payments")
	assert.Contains(t, args, "--kube-context prod-east")

	var body map[string][]HelmHistoryEntry
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Len(t, body["history"], 1)
	assert.Equal(t, 1, body["history"][0].Revision)
}

// gitopsRBACUserID is the fixed Fiber locals userID used by gitops RBAC tests.
var gitopsRBACUserID = uuid.MustParse("00000000-0000-0000-0000-000000000abc")

// newGitOpsRBACApp builds a Fiber app + GitOpsHandlers wired to a MockStore
// that returns the given role for the test user. Use this to verify that
// mutating GitOps endpoints enforce the console-admin role (#5972, #5973).
func newGitOpsRBACApp(t *testing.T, role models.UserRole) (*fiber.App, *GitOpsHandlers) {
	t.Helper()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", gitopsRBACUserID).Return(&models.User{
		ID:   gitopsRBACUserID,
		Role: role,
	}, nil)

	handler := NewGitOpsHandlers(nil, nil, mockStore)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", gitopsRBACUserID)
		return c.Next()
	})
	return app, handler
}

func TestGitOps_Sync_RequiresAdmin_ViewerForbidden(t *testing.T) {
	app, handler := newGitOpsRBACApp(t, models.UserRoleViewer)
	app.Post("/api/gitops/sync", handler.Sync)

	body := strings.NewReader(`{"repoUrl":"https://example.com/repo.git","path":"."}`)
	req, err := http.NewRequest(http.MethodPost, "/api/gitops/sync", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode,
		"viewer-role users must not be able to trigger GitOps sync (#5972)")
}

func TestGitOps_Sync_RequiresAdmin_AdminAllowed(t *testing.T) {
	app, handler := newGitOpsRBACApp(t, models.UserRoleAdmin)
	app.Post("/api/gitops/sync", handler.Sync)

	// Empty body so we don't actually shell out to kubectl — just past the
	// admin check. The handler then fails validation for missing repoUrl.
	req, err := http.NewRequest(http.MethodPost, "/api/gitops/sync", strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	// Past the admin check, the handler rejects with 400 ("repoUrl is required").
	// That's proof the admin was authorized and reached the validation step.
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"admin should pass RBAC and reach repoUrl validation")
}

func TestGitOps_DetectDrift_RequiresAdmin_ViewerForbidden(t *testing.T) {
	app, handler := newGitOpsRBACApp(t, models.UserRoleViewer)
	app.Post("/api/gitops/detect-drift", handler.DetectDrift)

	body := strings.NewReader(`{"repoUrl":"https://example.com/repo.git","path":"."}`)
	req, err := http.NewRequest(http.MethodPost, "/api/gitops/detect-drift", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode,
		"viewer-role users must not be able to trigger drift detection (#5973)")
}

func TestGitOps_DetectDrift_RequiresAdmin_AdminAllowed(t *testing.T) {
	app, handler := newGitOpsRBACApp(t, models.UserRoleAdmin)
	app.Post("/api/gitops/detect-drift", handler.DetectDrift)

	req, err := http.NewRequest(http.MethodPost, "/api/gitops/detect-drift", strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	// Past the admin check, rejects with 400 ("repoUrl is required").
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"admin should pass RBAC and reach repoUrl validation")
}

func TestGitOps_Sync_NilStore_SkipsRBAC(t *testing.T) {
	// Dev/demo mode: no user store configured → requireAdmin is a no-op.
	// This preserves existing test ergonomics and local dev behavior.
	app, handler := setupGitOpsTest()
	app.Post("/api/gitops/sync", handler.Sync)

	req, err := http.NewRequest(http.MethodPost, "/api/gitops/sync", strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	// 400 for missing repoUrl — proves we got past the (skipped) admin check.
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGitOps_ListHelmHistory_HelmErrorMapping(t *testing.T) {
	_, argsFile := writeFakeHelm(t, "#!/bin/sh\necho \"$@\" > \"$HELM_ARGS_FILE\"\necho 'helm failed on purpose' 1>&2\nexit 1\n")

	app, handler := setupGitOpsTest()
	app.Get("/api/gitops/helm/history", handler.ListHelmHistory)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/history?release=orders", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	argsBytes, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	assert.True(t, strings.Contains(string(argsBytes), "history orders"))

	var body struct {
		History []HelmHistoryEntry `json:"history"`
		Error   string             `json:"error"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.History, 0)
	assert.Contains(t, body.Error, "helm failed on purpose")
}

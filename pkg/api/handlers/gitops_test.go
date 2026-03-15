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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGitOpsTest() (*fiber.App, *GitOpsHandlers) {
	app := fiber.New()
	handler := NewGitOpsHandlers(nil, nil)
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
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "release parameter is required")
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

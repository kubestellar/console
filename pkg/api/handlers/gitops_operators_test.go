package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeFakeKubectl(t *testing.T, script string) string {
	t.Helper()
	binDir := t.TempDir()
	kubectlPath := filepath.Join(binDir, "kubectl")
	require.NoError(t, os.WriteFile(kubectlPath, []byte(script), 0o755))
	originalPath := os.Getenv("PATH")
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+originalPath)
	return binDir
}

func TestGitOpsOperators_ListOperators(t *testing.T) {
	// Mock kubectl to return CSVs
	script := `#!/bin/sh
# Look for csv in arguments
found_csv=0
for arg in "$@"; do
    if [ "$arg" = "csv" ]; then
        found_csv=1
    fi
done

if [ "$found_csv" -eq 1 ]; then
    echo '{"items": [{"metadata": {"name": "test-op", "namespace": "default"}, "spec": {"displayName": "Test Operator", "version": "1.0.0"}, "status": {"phase": "Succeeded"}}]}'
fi
`
	writeFakeKubectl(t, script)

	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	env.App.Get("/api/gitops/operators", handler.ListOperators)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/operators?cluster=test-cluster", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Operators []Operator `json:"operators"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.Operators)
	assert.Equal(t, "test-op", body.Operators[0].Name)
	assert.Equal(t, "Test Operator", body.Operators[0].DisplayName)
}

func TestGitOpsOperators_ListSubscriptions(t *testing.T) {
	// Mock kubectl to return subscriptions
	// The handler uses jsonpath and expects tab-separated values
	script := `#!/bin/sh
# Look for subscriptions in arguments
found_sub=0
for arg in "$@"; do
    if [ "$arg" = "subscriptions.operators.coreos.com" ]; then
        found_sub=1
    fi
done

if [ "$found_sub" -eq 1 ]; then
    printf "test-sub\tdefault\tstable\toperatorhub\tAutomatic\ttest-op.v1.0.0\ttest-op.v1.0.0\n"
fi
`
	writeFakeKubectl(t, script)

	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	env.App.Get("/api/gitops/subscriptions", handler.ListOperatorSubscriptions)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/subscriptions?cluster=test-cluster", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Subscriptions []OperatorSubscription `json:"subscriptions"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.Subscriptions)
	assert.Equal(t, "test-sub", body.Subscriptions[0].Name)
	assert.Equal(t, "stable", body.Subscriptions[0].Channel)
}

func TestGitOpsOperators_ListOperators_Validation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/operators", handler.ListOperators)

	// Invalid cluster name
	req, err := http.NewRequest(http.MethodGet, "/api/gitops/operators?cluster=bad;name", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

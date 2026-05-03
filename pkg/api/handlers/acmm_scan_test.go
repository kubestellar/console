package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestACMMScanHandler_Demo(t *testing.T) {
	env := setupTestEnv(t)
	// ACMMScanHandler is a top-level function in acmm_scan.go
	env.App.Get("/api/acmm/scan", ACMMScanHandler)

	req, err := http.NewRequest("GET", "/api/acmm/scan?repo=kubestellar/console", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result acmmScanResult
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &result)
	require.NoError(t, err)

	assert.Equal(t, "kubestellar/console", result.Repo)
	assert.NotEmpty(t, result.DetectedIDs)
	assert.NotEmpty(t, result.WeeklyActivity)
}

func TestACMMScanHandler_InvalidRepo(t *testing.T) {
	env := setupTestEnv(t)
	env.App.Get("/api/acmm/scan", ACMMScanHandler)

	req, err := http.NewRequest("GET", "/api/acmm/scan?repo=invalid-repo", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

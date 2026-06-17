package stellar

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

func TestListExecutions_EmptyInitially(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/executions", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items)
}

func TestListExecutions_WithFilters(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/executions?mission_id=abc&status=completed&limit=5", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(5), payload["limit"])
}

func TestGetExecution_MissingID(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/executions/%20", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "id is required", errResp["error"])
}

func TestGetExecution_NotFound(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/executions/nonexistent-id", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "execution not found", errResp["error"])
}

func TestGetExecution_Found(t *testing.T) {
	app, st := newStellarTestApp(t)
	sqlStore, ok := st.(*store.SQLiteStore)
	require.True(t, ok)

	// Get user ID from the store
	userIDs, err := sqlStore.ListStellarUserIDs(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, userIDs)
	userID := userIDs[0]

	// Create a mission first (executions reference a mission)
	mission := &store.StellarMission{
		UserID:         userID,
		Name:           "test-mission",
		Goal:           "test goal",
		TriggerType:    "manual",
		ProviderPolicy: "auto",
		MemoryScope:    "mission",
		Enabled:        true,
	}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))

	// Create an execution
	execution := &store.StellarExecution{
		UserID:    userID,
		MissionID: mission.ID,
		Status:    "running",
	}
	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), execution))

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/executions/"+execution.ID, nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, execution.ID, result["id"])
	assert.Equal(t, "running", result["status"])
}

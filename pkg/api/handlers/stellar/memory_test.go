package stellar

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListMemory_EmptyInitially(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/memory", nil)
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

func TestListMemory_WithQueryParams(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/memory?cluster=prod-a&category=observation&limit=10", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	// limit should reflect the query param
	assert.Equal(t, float64(10), payload["limit"])
}

func TestSearchMemory_Success(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"query": "pod crash",
		"limit": 5,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(5), payload["limit"])
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items) // no data seeded
}

func TestSearchMemory_EmptyQuery(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"query": "   ",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "query is required", errResp["error"])
}

func TestSearchMemory_MissingQuery(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"limit": 10,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSearchMemory_InvalidBody(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSearchMemory_DefaultLimit(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"query": "deployment failure",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(20), payload["limit"], "default limit should be 20")
}

func TestDeleteMemory_MissingID(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// URL-encoded space for the :id param
	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/memory/%20", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "id is required", errResp["error"])
}

func TestDeleteMemory_NonExistentID(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// The store's DeleteStellarMemoryEntry does not error for non-existent IDs.
	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/memory/nonexistent-id", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
}

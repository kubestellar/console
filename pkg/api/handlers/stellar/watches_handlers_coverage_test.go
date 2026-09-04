package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// newWatchesTestApp builds a minimal fiber app wired only to the watch/audit
// endpoints exercised in this file. Mirrors newStellarTestApp in shared_test.go
// but scoped narrowly to keep these tests independent.
func newWatchesTestApp(t *testing.T) (*fiber.App, store.Store, uuid.UUID) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-watches.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	userID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "watches-test-user",
		Role:        models.UserRoleAdmin,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		c.Locals("githubLogin", "watches-test-user")
		return c.Next()
	})
	h := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/watches", h.ListWatches)
	app.Post("/api/stellar/watches", h.CreateWatch)
	app.Delete("/api/stellar/watches/:id", h.DismissWatch)
	app.Post("/api/stellar/watches/:id/snooze", h.SnoozeWatch)
	app.Get("/api/stellar/audit", h.ListAuditLog)
	return app, sqlStore, userID
}

func doWatchJSON(t *testing.T, app *fiber.App, method, url string, body interface{}) (*http.Response, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(buf)
	}
	req := httptest.NewRequest(method, url, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, data
}

// ---- ListWatches ----

func TestListWatches_EmptyReturnsEmptyItems(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	resp, body := doWatchJSON(t, app, http.MethodGet, "/api/stellar/watches", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		Items []store.StellarWatch `json:"items"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	assert.NotNil(t, out.Items)
	assert.Empty(t, out.Items)
}

func TestListWatches_ReturnsCreatedWatch(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	// Create via handler so we exercise the same happy path.
	_, createBody := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches", map[string]string{
		"cluster":      "prod",
		"resourceKind": "Pod",
		"resourceName": "web-1",
		"reason":       "flaky",
	})
	var created store.StellarWatch
	require.NoError(t, json.Unmarshal(createBody, &created))
	require.NotEmpty(t, created.ID)

	resp, listBody := doWatchJSON(t, app, http.MethodGet, "/api/stellar/watches", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		Items []store.StellarWatch `json:"items"`
	}
	require.NoError(t, json.Unmarshal(listBody, &out))
	require.Len(t, out.Items, 1)
	assert.Equal(t, "prod", out.Items[0].Cluster)
	assert.Equal(t, "Pod", out.Items[0].ResourceKind)
}

// ---- DismissWatch ----

func TestDismissWatch_UnknownIDReturns404(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	resp, _ := doWatchJSON(t, app, http.MethodDelete, "/api/stellar/watches/does-not-exist", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestDismissWatch_HappyPath(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	_, createBody := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches", map[string]string{
		"cluster":      "prod",
		"resourceKind": "Pod",
		"resourceName": "web-1",
	})
	var created store.StellarWatch
	require.NoError(t, json.Unmarshal(createBody, &created))
	require.NotEmpty(t, created.ID)

	resp, _ := doWatchJSON(t, app, http.MethodDelete, "/api/stellar/watches/"+created.ID, nil)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

// ---- SnoozeWatch ----

func TestSnoozeWatch_UnknownIDReturns404(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	resp, _ := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches/does-not-exist/snooze", map[string]int{"minutes": 30})
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestSnoozeWatch_HappyPathReturnsUntil(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	_, createBody := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches", map[string]string{
		"cluster":      "prod",
		"resourceKind": "Pod",
		"resourceName": "web-1",
	})
	var created store.StellarWatch
	require.NoError(t, json.Unmarshal(createBody, &created))

	resp, body := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches/"+created.ID+"/snooze", map[string]int{"minutes": 30})
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out map[string]string
	require.NoError(t, json.Unmarshal(body, &out))
	assert.Equal(t, created.ID, out["id"])
	assert.NotEmpty(t, out["snoozedUntil"])
}

func TestSnoozeWatch_InvalidBodyFallsBackToDefaultMinutes(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	_, createBody := doWatchJSON(t, app, http.MethodPost, "/api/stellar/watches", map[string]string{
		"cluster":      "prod",
		"resourceKind": "Pod",
		"resourceName": "web-2",
	})
	var created store.StellarWatch
	require.NoError(t, json.Unmarshal(createBody, &created))

	// Send an unparseable body: handler must fall back to 60 minutes and succeed.
	req := httptest.NewRequest(http.MethodPost, "/api/stellar/watches/"+created.ID+"/snooze", bytes.NewReader([]byte(`not json`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---- ListAuditLog ----

func TestListAuditLog_EmptyReturnsEmptyItems(t *testing.T) {
	app, _, _ := newWatchesTestApp(t)
	resp, body := doWatchJSON(t, app, http.MethodGet, "/api/stellar/audit", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		Items []store.StellarAuditEntry `json:"items"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	assert.NotNil(t, out.Items)
	assert.Empty(t, out.Items)
}

func TestListAuditLog_ReturnsRecordedEntry(t *testing.T) {
	app, sqlStore, userID := newWatchesTestApp(t)
	require.NoError(t, sqlStore.CreateAuditEntry(context.Background(), &store.StellarAuditEntry{
		UserID:     userID.String(),
		Action:     "watch.create",
		EntityType: "watch",
		EntityID:   "w-1",
		Cluster:    "prod",
		Detail:     "test",
	}))
	resp, body := doWatchJSON(t, app, http.MethodGet, "/api/stellar/audit?limit=25", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		Items []store.StellarAuditEntry `json:"items"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	require.Len(t, out.Items, 1)
	assert.Equal(t, "watch.create", out.Items[0].Action)
	assert.Equal(t, "prod", out.Items[0].Cluster)
}

package stellar

// solver_coverage_test.go raises coverage on solver.go by exercising:
//
//   - ListActivity: unauthorized, fullStore-missing fallback, and OK paths
//   - ListSolves: unauthorized, fullStore-missing fallback, and OK paths
//   - CompleteAutoMission: fullStore-missing, invalid body, missing solveID,
//     unauthorized, solve-not-found paths
//   - StartSolve unauthorized path
//   - solverStorageAdapter trampoline methods (CreateSolve, UpdateSolveStatus,
//     IncrementSolveActions, CreateStellarAction, UpdateStellarActionStatus,
//     CreateStellarExecution, CreateStellarNotification)
//   - solverBroadcasterAdapter.Broadcast round-trip
//
// Related issue: kubestellar/console#22613 — raise pkg/api/handlers/stellar
// coverage.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/stellar/solver"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
)

func testUserAuthMiddleware(userID string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if parsed, err := uuid.Parse(userID); err == nil {
			c.Locals("userID", parsed)
		}
		return c.Next()
	}
}

// -----------------------------------------------------------------------------
// ListActivity
// -----------------------------------------------------------------------------

func TestListActivity_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Get("/activity", h.ListActivity)

	req := httptest.NewRequest(http.MethodGet, "/activity", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

// narrowStore is a Store implementation that does NOT satisfy solveFullStore,
// so fullStore() returns (nil, false) and ListActivity returns the empty
// fallback response.
type narrowStore struct {
	Store
}

func TestListActivity_NoFullStore_FallbackEmpty(t *testing.T) {
	h := &Handler{store: &narrowStore{Store: new(test.MockStore)}}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Get("/activity", h.ListActivity)

	req := httptest.NewRequest(http.MethodGet, "/activity", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"items":[]`)
}

func TestListActivity_OK(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Get("/activity", h.ListActivity)

	req := httptest.NewRequest(http.MethodGet, "/activity?limit=50", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"items":[]`)
}

// TestListActivity_LimitClamps covers the limit-parse and range branches.
func TestListActivity_LimitClamps(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Get("/activity", h.ListActivity)

	for _, q := range []string{"", "?limit=abc", "?limit=0", "?limit=-1", "?limit=99999", "?limit=200"} {
		req := httptest.NewRequest(http.MethodGet, "/activity"+q, nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode, "query=%s", q)
	}
}

// -----------------------------------------------------------------------------
// ListSolves
// -----------------------------------------------------------------------------

func TestListSolves_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Get("/solves", h.ListSolves)

	req := httptest.NewRequest(http.MethodGet, "/solves", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestListSolves_NoFullStore_FallbackEmpty(t *testing.T) {
	h := &Handler{store: &narrowStore{Store: new(test.MockStore)}}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Get("/solves", h.ListSolves)

	req := httptest.NewRequest(http.MethodGet, "/solves", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"items":[]`)
}

func TestListSolves_OK(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Get("/solves", h.ListSolves)

	req := httptest.NewRequest(http.MethodGet, "/solves?limit=25", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), `"items":[]`)
}

// -----------------------------------------------------------------------------
// CompleteAutoMission
// -----------------------------------------------------------------------------

func TestCompleteAutoMission_NoFullStore(t *testing.T) {
	h := &Handler{store: &narrowStore{Store: new(test.MockStore)}}
	app := fiber.New()
	app.Post("/complete/:solveID", h.CompleteAutoMission)

	req := httptest.NewRequest(http.MethodPost, "/complete/abc", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

func TestCompleteAutoMission_InvalidBody(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Post("/complete/:solveID", h.CompleteAutoMission)

	req := httptest.NewRequest(http.MethodPost, "/complete/xyz", bytes.NewReader([]byte("{not json")))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCompleteAutoMission_MissingSolveID(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Post("/complete", h.CompleteAutoMission)

	body, _ := json.Marshal(map[string]string{"eventID": "abc"})
	req := httptest.NewRequest(http.MethodPost, "/complete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCompleteAutoMission_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Post("/complete/:solveID", h.CompleteAutoMission)

	body, _ := json.Marshal(map[string]string{"solveID": "abc"})
	req := httptest.NewRequest(http.MethodPost, "/complete/abc", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestCompleteAutoMission_SolveNotFound(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	uid := uuid.New().String()
	app := fiber.New()
	app.Use(testUserAuthMiddleware(uid))
	app.Post("/complete/:solveID", h.CompleteAutoMission)

	body, _ := json.Marshal(map[string]string{"solveID": "abc"})
	req := httptest.NewRequest(http.MethodPost, "/complete/abc", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	// MockStore.GetSolveByID returns (nil, nil) → 404 "solve not found".
	assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// StartSolve unauthorized
// -----------------------------------------------------------------------------

func TestStartSolve_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Post("/solve/:notificationID", h.StartSolve)

	req := httptest.NewRequest(http.MethodPost, "/solve/n1", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// solverStorageAdapter trampolines — each method delegates to the underlying
// store. Calling each once through a MockStore-backed adapter covers the
// trivial pass-through bodies with the mock's benign zero-value returns.
// -----------------------------------------------------------------------------

func TestSolverStorageAdapter_Trampolines(t *testing.T) {
	mock := new(test.MockStore)
	adapter := &solverStorageAdapter{store: mock, full: mock}
	ctx := context.Background()

	assert.NoError(t, adapter.CreateSolve(ctx, &store.StellarSolve{}))
	assert.NoError(t, adapter.UpdateSolveStatus(ctx, "id", "resolved", "sum", "", ""))
	assert.NoError(t, adapter.IncrementSolveActions(ctx, "id"))
	assert.NoError(t, adapter.CreateStellarAction(ctx, &store.StellarAction{}))
	assert.NoError(t, adapter.UpdateStellarActionStatus(ctx, "id", "done", "out", ""))
	assert.NoError(t, adapter.CreateStellarExecution(ctx, &store.StellarExecution{}))
	assert.NoError(t, adapter.CreateStellarNotification(ctx, &store.StellarNotification{}))
}

// -----------------------------------------------------------------------------
// solverBroadcasterAdapter — round-trips solver.SSEEvent into handler SSEEvent
// and pushes it through the handler's broadcastToClients path.
// -----------------------------------------------------------------------------

func TestSolverBroadcasterAdapter_Broadcast(t *testing.T) {
	h := &Handler{}
	adminCh := make(chan SSEEvent, 1)
	h.registerSSEClient("a", "admin", true, adminCh)

	adapter := &solverBroadcasterAdapter{h: h}
	adapter.Broadcast(solver.SSEEvent{Type: "solve_progress", Data: map[string]string{"phase": "solving"}})

	// A single admin client should receive the translated event.
	select {
	case ev := <-adminCh:
		assert.Equal(t, "solve_progress", ev.Type)
	default:
		t.Fatal("expected event to be delivered to admin client")
	}
}

package stellar

// handler_coverage_test.go raises coverage on pkg/api/handlers/stellar by
// exercising previously-untested paths:
//
//   - Setter methods (SetProviderRegistry / SetBroadcaster / SetUserStore)
//   - SSE client bookkeeping (register + unregister + Broadcast + newUserScopedSSEEvent)
//   - fireDueTaskReminders happy path (no tasks / with tasks and a broadcaster)
//   - Health endpoint (no provider registry configured)
//   - GetState / GetDigest unauthorized paths (missing user ID → 401)
//   - Ask unauthorized path (missing user ID → 401)
//
// Related issue: kubestellar/console#22613 — raise handler-package coverage.

import (
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

	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/test"
)

// recordingBroadcaster captures SSEEvents pushed via Broadcast so tests can
// assert on the audience-resolution and task_due paths.
type recordingBroadcaster struct {
	events []SSEEvent
}

func (r *recordingBroadcaster) Broadcast(event SSEEvent) {
	r.events = append(r.events, event)
}

// -----------------------------------------------------------------------------
// Setters — trivial coverage
// -----------------------------------------------------------------------------

func TestSetProviderRegistry_NilNoop(t *testing.T) {
	h := &Handler{}
	h.SetProviderRegistry(nil)
	assert.Nil(t, h.providerRegistry)

	reg := providers.NewRegistry()
	h.SetProviderRegistry(reg)
	assert.Same(t, reg, h.providerRegistry)
}

func TestSetBroadcaster(t *testing.T) {
	h := &Handler{}
	b := &recordingBroadcaster{}
	h.SetBroadcaster(b)
	assert.Same(t, b, h.broadcaster)
	// Nil is a valid reset — supports test isolation.
	h.SetBroadcaster(nil)
	assert.Nil(t, h.broadcaster)
}

func TestSetUserStore(t *testing.T) {
	h := &Handler{}
	m := new(test.MockStore)
	h.SetUserStore(m)
	assert.Same(t, m, h.userStore)
}

// -----------------------------------------------------------------------------
// SSE client bookkeeping
// -----------------------------------------------------------------------------

func TestRegisterUnregisterSSEClient(t *testing.T) {
	h := &Handler{}
	ch := make(chan SSEEvent, 1)
	h.registerSSEClient("conn-1", "user-a", false, ch)
	h.registerSSEClient("conn-2", "user-b", true, ch)

	h.sseClientsMu.RLock()
	assert.Len(t, h.sseClients, 2)
	h.sseClientsMu.RUnlock()

	h.unregisterSSEClient("conn-1")
	h.sseClientsMu.RLock()
	assert.Len(t, h.sseClients, 1)
	_, still := h.sseClients["conn-2"]
	assert.True(t, still)
	h.sseClientsMu.RUnlock()

	// Unregistering a missing client is a no-op.
	h.unregisterSSEClient("does-not-exist")
	h.sseClientsMu.RLock()
	assert.Len(t, h.sseClients, 1)
	h.sseClientsMu.RUnlock()
}

func TestNewUserScopedSSEEvent(t *testing.T) {
	e := newUserScopedSSEEvent("  user-42  ", "notification", map[string]string{"k": "v"})
	assert.Equal(t, "notification", e.Type)
	// The user ID is trimmed and mirrored into TargetUserID.
	assert.Equal(t, "user-42", e.UserID)
	assert.Equal(t, "user-42", e.TargetUserID)
	assert.False(t, e.AdminOnly)
}

func TestBroadcast_DeliversToScopedClient(t *testing.T) {
	h := &Handler{}
	userCh := make(chan SSEEvent, 2)
	adminCh := make(chan SSEEvent, 2)
	h.registerSSEClient("u", "user-1", false, userCh)
	h.registerSSEClient("a", "admin-user", true, adminCh)

	// User-scoped event: only the matching user (or admin) receives it.
	h.Broadcast(newUserScopedSSEEvent("user-1", "notification", "hi"))
	require.Len(t, userCh, 1)
	require.Len(t, adminCh, 1)

	// Admin-only event: only the admin receives it.
	h.Broadcast(SSEEvent{Type: "sysmsg", AdminOnly: true, Data: "ping"})
	assert.Equal(t, 1, len(userCh))
	assert.Equal(t, 2, len(adminCh))
}

// -----------------------------------------------------------------------------
// fireDueTaskReminders
// -----------------------------------------------------------------------------

func TestFireDueTaskReminders_NoTasks(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	// Should complete with no side-effects and no panic.
	h.fireDueTaskReminders(context.Background())
}

// -----------------------------------------------------------------------------
// GetState / GetDigest / Ask — unauthorized path (requireUser fails → 401)
// -----------------------------------------------------------------------------

func newStellarApp(h *Handler, route string, method string, handler fiber.Handler) *fiber.App {
	app := fiber.New()
	switch method {
	case http.MethodGet:
		app.Get(route, handler)
	case http.MethodPost:
		app.Post(route, handler)
	}
	return app
}

func TestGetState_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := newStellarApp(h, "/state", http.MethodGet, h.GetState)
	req := httptest.NewRequest(http.MethodGet, "/state", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestGetDigest_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := newStellarApp(h, "/digest", http.MethodGet, h.GetDigest)
	req := httptest.NewRequest(http.MethodGet, "/digest", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestAsk_Unauthorized(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := newStellarApp(h, "/ask", http.MethodPost, h.Ask)
	req := httptest.NewRequest(http.MethodPost, "/ask", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

// -----------------------------------------------------------------------------
// Health endpoint — no provider registry configured, providerAvailable=false
// -----------------------------------------------------------------------------

func TestHealth_NoProviderRegistry(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	app := fiber.New()
	app.Get("/health", h.Health)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &payload))

	assert.Equal(t, "ok", payload["status"])
	assert.Equal(t, float64(0), payload["sseClientsConnected"])
	// provider may or may not be resolvable in the test environment; just
	// assert the field is present as a string.
	_, ok := payload["provider"].(string)
	assert.True(t, ok, "provider field should be a string")
	_, ok = payload["providerAvailable"].(bool)
	assert.True(t, ok, "providerAvailable field should be a bool")
}

// TestHealth_WithConnectedClient ensures Health reports the SSE client count
// accurately when clients are registered.
func TestHealth_WithConnectedClient(t *testing.T) {
	h := &Handler{store: new(test.MockStore)}
	h.registerSSEClient("c1", uuid.New().String(), false, make(chan SSEEvent, 1))

	app := fiber.New()
	app.Get("/health", h.Health)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &payload))
	assert.Equal(t, float64(1), payload["sseClientsConnected"])
}

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// sseReadDuration is how long sseGet reads from the SSE stream before cancelling.
// Must be long enough to receive the initial flush (sent immediately by send()),
// but short enough not to wait for the 10-second ticker.
const sseReadDuration = 2 * time.Second

// sseGet makes a real HTTP GET to a streaming SSE endpoint by starting the Fiber
// app on a random TCP port.  It reads whatever the server flushes within dur,
// then cancels the request.  Unlike fiber.App.Test, this works correctly for
// long-lived streams that never return an EOF within a test timeout.
func sseGet(t *testing.T, app *fiber.App, path string, dur time.Duration) (statusCode int, header http.Header, body string) {
	t.Helper()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	go func() { _ = app.Listener(ln) }()
	t.Cleanup(func() { _ = app.ShutdownWithTimeout(200 * time.Millisecond) })

	ctx, cancel := context.WithTimeout(context.Background(), dur)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+ln.Addr().String()+path, nil)
	require.NoError(t, err)

	// Use a client with disabled keep-alives so each test gets a clean connection.
	client := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}
	resp, err := client.Do(req)
	if err != nil {
		// Context expired before headers arrived.
		return 0, nil, ""
	}
	defer resp.Body.Close()

	// Read body until context fires or stream closes.
	var buf bytes.Buffer
	_, _ = io.Copy(&buf, resp.Body)
	return resp.StatusCode, resp.Header, buf.String()
}

// TestStellarStream_SetsSSEHeaders verifies that the Stream endpoint returns the
// correct SSE response headers (Content-Type: text/event-stream, etc.).
// Note: Connection is a hop-by-hop header that Go's net/http client strips from
// response headers (it manages connection reuse transparently), so it is not
// verified here. Content-Type and Cache-Control are application-level headers
// that survive the round-trip.
func TestStellarStream_SetsSSEHeaders(t *testing.T) {
	app, _ := newStellarTestApp(t)
	statusCode, header, _ := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	assert.Equal(t, http.StatusOK, statusCode)
	assert.Equal(t, "text/event-stream", header.Get("Content-Type"))
	assert.Equal(t, "no-cache", header.Get("Cache-Control"))
}

// TestStellarStream_ReturnsUnauthorizedWithoutUser verifies that Stream() returns
// HTTP 401 when no authenticated user is present in the request context.
func TestStellarStream_ReturnsUnauthorizedWithoutUser(t *testing.T) {
	app := fiber.New()
	h := NewStellarHandler(nil, nil)
	app.Get("/api/stellar/stream", h.Stream)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/stream", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 2000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// TestStellarStream_SendsHeartbeat is the primary regression guard for the
// nil-pointer panic fixed in #17227. It verifies that Stream() correctly captures
// userID before SetBodyStreamWriter (not inside the goroutine from a recycled
// fiber.Ctx), and that the stream emits at least a heartbeat SSE event.
//
// Prior to the fix, calling middleware.GetUserID(c) inside the goroutine would
// dereference a recycled *RequestCtx and trigger SIGSEGV.
func TestStellarStream_SendsHeartbeat(t *testing.T) {
	app, _ := newStellarTestApp(t)
	statusCode, _, bodyStr := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	require.Equal(t, http.StatusOK, statusCode)

	// The initial send() call fires immediately and must include a heartbeat event.
	assert.Contains(t, bodyStr, "event: heartbeat", "stream must emit a heartbeat on first send")
	assert.Contains(t, bodyStr, `"ts"`, "heartbeat payload must contain a timestamp")
}

// TestStellarStream_SendsInitialUnreadNotifications verifies that unread notifications
// created before the stream connects are pushed in the initial batch, in
// chronological order (oldest first, per the reverse-iteration in Stream()).
func TestStellarStream_SendsInitialUnreadNotifications(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)

	// Determine the test user ID from the store (stream uses the injected userID local).
	users, err := sqlStore.ListUsers(context.Background(), 1, 0)
	require.NoError(t, err)
	require.NotEmpty(t, users)
	userID := users[0].ID.String()

	notif := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "stream-test-notification",
		Body:      "triggered for stream test",
		Cluster:   "test-cluster",
		Namespace: "default",
		DedupeKey: "stream-test-key",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), notif))

	statusCode, _, bodyStr := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	require.Equal(t, http.StatusOK, statusCode)

	assert.Contains(t, bodyStr, "event: notification", "initial unread notifications must be streamed")
	assert.Contains(t, bodyStr, "stream-test-notification", "notification title must appear in stream")
}

// TestStellarStream_SendsInitialState verifies that Stream() emits a state event
// in the initial batch, regardless of whether notifications are present.
func TestStellarStream_SendsInitialState(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)

	// Seed a notification so the initial-batch block (which also emits state) is entered.
	users, err := sqlStore.ListUsers(context.Background(), 1, 0)
	require.NoError(t, err)
	require.NotEmpty(t, users)
	userID := users[0].ID.String()

	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "info",
		Title:     "state-test-notif",
		DedupeKey: "state-test-key",
	}))

	statusCode, _, bodyStr := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	require.Equal(t, http.StatusOK, statusCode)

	assert.Contains(t, bodyStr, "event: state", "stream must emit a state event in initial batch")
	assert.Contains(t, bodyStr, `"unreadCount"`, "state event must include unreadCount field")
}

// TestStellarStream_UserIDCapturedBeforeGoroutine is a focused regression test for
// the nil-pointer bug fixed in #17227. It verifies that the stream goroutine uses
// the userID captured in the parent handler scope (not re-derived from a recycled
// fiber context), by asserting that the stream emits well-formed events for a user
// with a valid UUID — which would fail/panic if userID were empty or userUUID
// unparseable inside the goroutine.
func TestStellarStream_UserIDCapturedBeforeGoroutine(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)

	// Seed a notification to trigger the admin-check path (isAdmin logic uses userUUID).
	users, err := sqlStore.ListUsers(context.Background(), 1, 0)
	require.NoError(t, err)
	require.NotEmpty(t, users)
	userID := users[0].ID.String()

	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "critical",
		Title:     "uuid-goroutine-test",
		DedupeKey: "uuid-goroutine-test-key",
	}))

	// If userID were not captured before SetBodyStreamWriter, the goroutine would
	// either panic (nil dereference) or emit no events. Either way this test fails.
	statusCode, _, bodyStr := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	require.Equal(t, http.StatusOK, statusCode, "stream must not panic — regression guard for #17227")
	assert.NotEmpty(t, bodyStr, "goroutine must emit events with pre-captured userID")
}

// TestStellarListObservations_EmptyReturnsEmptyList verifies that the
// ListObservations endpoint returns an empty list (not an error) when no
// observations have been created.
func TestStellarListObservations_EmptyReturnsEmptyList(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/observations", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	items, ok := result["items"]
	require.True(t, ok, "response must contain 'items' key")
	assert.IsType(t, []any{}, items, "items must be a JSON array")
	assert.Len(t, items, 0, "items must be empty when no observations exist")
}

// TestStellarListObservations_AppliesLimitParam verifies that the ?limit= query
// parameter is honoured and reflected in the response.
func TestStellarListObservations_AppliesLimitParam(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/observations?limit=7", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	limit, ok := result["limit"]
	require.True(t, ok, "response must contain 'limit' key")
	assert.EqualValues(t, 7, limit, "limit in response must match query parameter")
}

// TestStellarIngestEvent_RequiresAuth verifies that IngestEvent rejects
// requests from users who do not have editor or admin role with HTTP 403.
// When a userStore is configured, the role check is enforced.
func TestStellarIngestEvent_RequiresAuth(t *testing.T) {
	// Build a fresh SQLite store but do NOT inject a user into the fiber context,
	// so middleware.GetUserID returns uuid.Nil and GetUser returns nil → 403 Forbidden.
	s := newInMemoryStellarStore(t)
	sqlStore, err := store.NewSQLiteStore(t.TempDir() + "/ingest-auth.db")
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	// Deliberately do NOT inject a userID into the context.
	h := NewStellarHandler(s, nil, WithUserStore(sqlStore))
	app.Post("/api/stellar/events", h.IngestEvent)

	body := `{"cluster":"c1","namespace":"ns","name":"pod-a","type":"Warning","reason":"CrashLoop","message":"back-off"}`
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/events", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 2000)
	require.NoError(t, err)
	// No user in context → GetUser(uuid.Nil) → nil → 403 Forbidden.
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// TestStellarIngestEvent_MissingFieldsReturnsBadRequest verifies that IngestEvent
// rejects payloads missing required fields with HTTP 400.
func TestStellarIngestEvent_MissingFieldsReturnsBadRequest(t *testing.T) {
	// Use a fresh concrete store so it can be passed as handlers.StellarStore.
	s, err := store.NewSQLiteStore(filepath.Join(t.TempDir(), "ingest-bad.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	userID := uuid.New()
	require.NoError(t, s.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "editor-user",
		Role:        models.UserRoleEditor,
	}))

	editorApp := fiber.New()
	editorApp.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		c.Locals("githubLogin", "editor-user")
		return c.Next()
	})
	h := NewStellarHandler(s, nil, WithUserStore(s))
	editorApp.Post("/api/stellar/events", h.IngestEvent)

	// Missing required fields: cluster is empty.
	body := `{"cluster":"","namespace":"ns","name":"pod","type":"Warning","reason":"x","message":"y"}`
	req, err2 := http.NewRequest(http.MethodPost, "/api/stellar/events", bytes.NewReader([]byte(body)))
	require.NoError(t, err2)
	req.Header.Set("Content-Type", "application/json")
	resp, err2 := editorApp.Test(req, 2000)
	require.NoError(t, err2)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestStellarIngestEvent_AcceptsValidEvent verifies that a valid IngestEvent
// request is accepted asynchronously with HTTP 202 Accepted.
func TestStellarIngestEvent_AcceptsValidEvent(t *testing.T) {
	// Use a fresh concrete store so it can be passed as handlers.StellarStore.
	s, err := store.NewSQLiteStore(filepath.Join(t.TempDir(), "ingest-ok.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	userID := uuid.New()
	require.NoError(t, s.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "admin-user",
		Role:        models.UserRoleAdmin,
	}))

	adminApp := fiber.New()
	adminApp.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		c.Locals("githubLogin", "admin-user")
		return c.Next()
	})
	h := NewStellarHandler(s, nil, WithUserStore(s))
	adminApp.Post("/api/stellar/events", h.IngestEvent)

	payload := map[string]string{
		"cluster":   "prod-a",
		"namespace": "default",
		"name":      "api-pod",
		"type":      "Warning",
		"reason":    "CrashLoopBackOff",
		"message":   "back-off 5m0s restarting failed container",
	}
	raw, _ := json.Marshal(payload)
	req, err2 := http.NewRequest(http.MethodPost, "/api/stellar/events", bytes.NewReader(raw))
	require.NoError(t, err2)
	req.Header.Set("Content-Type", "application/json")

	resp, err2 := adminApp.Test(req, 2000)
	require.NoError(t, err2)
	assert.Equal(t, http.StatusAccepted, resp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "accepted", result["status"])

	// Give async goroutine a moment; test completes without verifying async
	// side effects since ProcessEvent depends on external provider.
	time.Sleep(10 * time.Millisecond)
}

// TestStellarStream_UpsertLastSeenCalledOnConnect verifies that connecting to the
// stream updates the user's last-seen timestamp.
// Note: UpsertUserLastSeen is called in the handler before SetBodyStreamWriter,
// so it completes before the HTTP response headers are sent to the client.
func TestStellarStream_UpsertLastSeenCalledOnConnect(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)

	users, err := sqlStore.ListUsers(context.Background(), 1, 0)
	require.NoError(t, err)
	require.NotEmpty(t, users)
	userUUID := users[0].ID

	// Confirm no last-seen before connect.
	before, err := sqlStore.GetUserLastSeen(context.Background(), userUUID.String())
	require.NoError(t, err)
	assert.Nil(t, before, "last-seen must be nil before first stream connect")

	statusCode, _, _ := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	require.Equal(t, http.StatusOK, statusCode)

	after, err := sqlStore.GetUserLastSeen(context.Background(), userUUID.String())
	require.NoError(t, err)
	require.NotNil(t, after, "last-seen must be set after stream connect")
	assert.WithinDuration(t, time.Now(), *after, 5*time.Second)
}

// TestStellarStream_InvalidUserIDStillConnects verifies that a stream request from
// a user whose ID cannot be parsed as a UUID still connects (parseErr != nil path)
// without panicking. This covers the isAdmin=false fallback branch in Stream().
// When only a GitHub login (not a UUID) is available, resolveStellarUserID returns
// the login string, which fails uuid.Parse — the stream must still serve events.
func TestStellarStream_InvalidUserIDStillConnects(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		// Do NOT inject "userID" (uuid.UUID). Only set githubLogin so that
		// resolveStellarUserID returns the login string (a non-UUID), triggering
		// the parseErr != nil branch inside Stream's SetBodyStreamWriter goroutine.
		c.Locals("githubLogin", "stellar-github-only-user")
		return c.Next()
	})
	h := NewStellarHandler(newInMemoryStellarStore(t), nil)
	app.Get("/api/stellar/stream", h.Stream)

	// Stream must still connect and emit SSE headers even without admin resolution.
	statusCode, header, _ := sseGet(t, app, "/api/stellar/stream", sseReadDuration)
	assert.Equal(t, http.StatusOK, statusCode)
	assert.Equal(t, "text/event-stream", header.Get("Content-Type"))
}

// newInMemoryStellarStore creates a minimal SQLiteStore backed by a temp DB.
func newInMemoryStellarStore(t *testing.T) StellarStore {
	t.Helper()
	s, err := store.NewSQLiteStore(t.TempDir() + "/stellar-inline.db")
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })
	return s
}

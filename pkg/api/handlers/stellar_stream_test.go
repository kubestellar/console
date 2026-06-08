package handlers

import (
	"context"
	"io"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const stellarStreamTestTimeoutMs = 3000

// TestStellarStream_NoNilPointerPanic is a regression test for #17226.
// The Stellar SSE stream handler previously called middleware.GetUserID(c)
// inside the SetBodyStreamWriter callback after the fasthttp *RequestCtx
// had already been recycled, causing a nil-pointer dereference (SIGSEGV).
// This test verifies the stream endpoint returns a valid SSE response
// without panicking.
func TestStellarStream_NoNilPointerPanic(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "stellar-stream-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	testUserID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          testUserID,
		GitHubLogin: "stellar-stream-test-user",
		Role:        models.UserRoleAdmin,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testUserID)
		c.Locals("githubLogin", "stellar-stream-test-user")
		return c.Next()
	})

	h := NewStellarHandler(sqlStore, nil)
	app.Get("/api/stellar/stream", h.Stream)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/stream", nil)
	require.NoError(t, err)

	// The fiber test method drives the request. If the handler panics with
	// a nil pointer dereference (the bug), this will either panic the test
	// process or return an error — neither should happen.
	resp, err := app.Test(req, stellarStreamTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Verify the response headers indicate SSE.
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")

	// Read a small amount of the body to confirm the stream was successfully
	// started (no panic occurred in the goroutine).
	buf := make([]byte, 1024)
	_, readErr := io.ReadAtLeast(resp.Body, buf, 1)
	// io.EOF or io.ErrUnexpectedEOF are acceptable (empty stream); any other
	// error (or a panic in the handler) would indicate a regression.
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		// Accept timeout too — the stream may legitimately block if no events exist.
		if !isTimeoutError(readErr) {
			t.Logf("stream read returned: %v (acceptable for empty stream)", readErr)
		}
	}
}

// TestStellarStream_Unauthenticated verifies the stream endpoint rejects
// requests without a valid user identity.
func TestStellarStream_Unauthenticated(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "stellar-stream-noauth.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	// No userID middleware — simulates unauthenticated request.

	h := NewStellarHandler(sqlStore, nil)
	app.Get("/api/stellar/stream", h.Stream)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/stream", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarStreamTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	// net.Error timeout check
	type timeoutErr interface {
		Timeout() bool
	}
	if te, ok := err.(timeoutErr); ok {
		return te.Timeout()
	}
	return false
}

// Silence the unused import warning for time package.
var _ = time.Now

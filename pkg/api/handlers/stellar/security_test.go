package stellar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

func TestValidateStellarProviderBaseURL(t *testing.T) {
	t.Run("reject cloud http", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "http://api.openai.com/v1")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("reject cloud private ip", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "https://127.0.0.1/v1")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("allow cloud public ip", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "https://8.8.8.8/v1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("allow ollama loopback", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("ollama", "http://127.0.0.1:11434")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("reject ollama private by default", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("ollama", "http://10.1.2.3:11434")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("allow ollama private when CIDR allowlisted", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "10.0.0.0/8")
		_, err := validateStellarProviderBaseURL("ollama", "http://10.1.2.3:11434")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestRenderUntrustedPromptDataEscapesInput(t *testing.T) {
	got := renderUntrustedPromptData("event", `<script>alert("xss")</script>`)
	if got == "" {
		t.Fatal("expected wrapped output")
	}
	if got == `<cluster-data source="event" trust="untrusted"><script>alert("xss")</script></cluster-data>` {
		t.Fatal("expected HTML escaping in wrapped output")
	}
}

func TestStellarBroadcastToClientsFiltersByAudience(t *testing.T) {
	h := &StellarHandler{
		sseClients: map[string]stellarSSEClient{
			"owner": {userID: "user-a", ch: make(chan SSEEvent, 1)},
			"other": {userID: "user-b", ch: make(chan SSEEvent, 1)},
			"admin": {userID: "admin-user", isAdmin: true, ch: make(chan SSEEvent, 2)},
		},
	}

	h.broadcastToClients(SSEEvent{Type: "notification", Data: store.StellarNotification{UserID: "user-a"}})

	ownerEvent := readQueuedSSEEvent(t, h.sseClients["owner"].ch)
	assert.Equal(t, "user-a", ownerEvent.UserID)
	assertNoQueuedSSEEvent(t, h.sseClients["other"].ch)
	adminEvent := readQueuedSSEEvent(t, h.sseClients["admin"].ch)
	assert.Equal(t, "user-a", adminEvent.UserID)

	h.broadcastToClients(SSEEvent{Type: "notification_update", Data: map[string]string{"userId": "system", "dedupKey": "k", "body": "updated"}})

	systemEvent := readQueuedSSEEvent(t, h.sseClients["admin"].ch)
	assert.True(t, systemEvent.AdminOnly)
	assert.Empty(t, systemEvent.UserID)
	assertNoQueuedSSEEvent(t, h.sseClients["owner"].ch)
	assertNoQueuedSSEEvent(t, h.sseClients["other"].ch)
}

func TestStellarIngestEventRequiresEditorOrAdmin(t *testing.T) {
	const ingestEventPath = "/api/stellar/events"

	dbPath := filepath.Join(t.TempDir(), "stellar-security.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	ctx := context.Background()
	adminID := uuid.New()
	editorID := uuid.New()
	viewerID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(ctx, &models.User{ID: adminID, GitHubID: "1", GitHubLogin: "admin-user", Role: models.UserRoleAdmin}))
	require.NoError(t, sqlStore.CreateUser(ctx, &models.User{ID: editorID, GitHubID: "2", GitHubLogin: "editor-user", Role: models.UserRoleEditor}))
	require.NoError(t, sqlStore.CreateUser(ctx, &models.User{ID: viewerID, GitHubID: "3", GitHubLogin: "viewer-user", Role: models.UserRoleViewer}))

	h := NewStellarHandler(sqlStore, nil, WithUserStore(sqlStore))

	tests := []struct {
		name       string
		userID     uuid.UUID
		wantStatus int
	}{
		{name: "viewer forbidden", userID: viewerID, wantStatus: http.StatusForbidden},
		{name: "editor allowed", userID: editorID, wantStatus: http.StatusBadRequest},
		{name: "admin allowed", userID: adminID, wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", tt.userID)
				return c.Next()
			})
			app.Post(ingestEventPath, RequireEditorOrAdminMiddleware(sqlStore), h.IngestEvent)

			req := httptest.NewRequest(http.MethodPost, ingestEventPath, strings.NewReader(`{}`))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, stellarTestFiberTimeoutMs)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func readQueuedSSEEvent(t *testing.T, ch <-chan SSEEvent) SSEEvent {
	t.Helper()
	select {
	case event := <-ch:
		return event
	default:
		t.Fatal("expected SSE event")
		return SSEEvent{}
	}
}

func assertNoQueuedSSEEvent(t *testing.T, ch <-chan SSEEvent) {
	t.Helper()
	select {
	case event := <-ch:
		t.Fatalf("unexpected SSE event: %+v", event)
	default:
	}
}

package compliance

// Tests for the SIEM webhook destination adapter (#9887 / #9643).
//
// The adapter lives in pkg/api/audit so the handlers package can consume it
// the same way runtime code does. These tests exercise the public adapter
// contract end-to-end against an httptest.Server so we prove the JSON shape
// that arrives at the receiver is the shape we intend to publish.

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

// testWebhookSendTimeout bounds the unit test; the adapter's own timeout is
// much larger (siemWebhookTimeout) so this stays well under it.
const testWebhookSendTimeout = 5 * time.Second

func TestWebhookDestination_SendPOSTsExpectedPayload(t *testing.T) {
	var (
		gotMethod      atomic.Value // string
		gotContentType atomic.Value // string
		gotBody        atomic.Value // []byte
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod.Store(r.Method)
		gotContentType.Store(r.Header.Get("Content-Type"))
		b, _ := io.ReadAll(r.Body)
		gotBody.Store(b)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	dest, err := audit.NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)
	assert.Equal(t, audit.ProviderWebhook, dest.Provider())

	sent := time.Date(2026, 4, 24, 12, 0, 0, 0, time.UTC)
	events := []audit.PipelineEvent{
		{
			ID:               "evt-1",
			Cluster:          "prod-east",
			EventType:        "pods/exec",
			Resource:         "pods",
			User:             "alice",
			Timestamp:        sent,
			DestinationCount: 1,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), testWebhookSendTimeout)
	defer cancel()
	require.NoError(t, dest.Send(ctx, events))

	assert.Equal(t, http.MethodPost, gotMethod.Load())
	assert.Equal(t, "application/json", gotContentType.Load())

	raw, ok := gotBody.Load().([]byte)
	require.True(t, ok, "handler did not capture a request body")

	var got audit.WebhookPayload
	require.NoError(t, json.Unmarshal(raw, &got))
	assert.Equal(t, 1, got.Version)
	require.Len(t, got.Events, 1)
	assert.Equal(t, "evt-1", got.Events[0].ID)
	assert.Equal(t, "prod-east", got.Events[0].Cluster)
	assert.Equal(t, "alice", got.Events[0].User)
	assert.True(t, got.Events[0].Timestamp.Equal(sent))
}

func TestWebhookDestination_SendSkipsEmptyBatch(t *testing.T) {
	var called atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Store(true)
	}))
	defer srv.Close()

	dest, err := audit.NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)
	require.NoError(t, dest.Send(context.Background(), nil))
	assert.False(t, called.Load(), "empty batch should not POST")
}

func TestWebhookDestination_SendReturnsErrorOnNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	dest, err := audit.NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), []audit.PipelineEvent{{ID: "x"}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "502")
}

func TestRegisterDestination_StubProvidersReturnUnsupportedError(t *testing.T) {
	audit.ResetForTest()
	t.Cleanup(audit.ResetForTest)

	for _, provider := range []audit.DestinationProvider{
		audit.ProviderSplunk,
		audit.ProviderElastic,
		audit.ProviderSyslog,
	} {
		provider := provider
		t.Run(string(provider), func(t *testing.T) {
			adapter, err := audit.RegisterDestination(audit.DestinationConfig{
				ID:       "dest-" + string(provider),
				Name:     string(provider),
				Provider: provider,
			})
			require.NoError(t, err)
			require.NotNil(t, adapter)

			sendErr := adapter.Send(context.Background(), []audit.PipelineEvent{{ID: "evt"}})
			require.Error(t, sendErr)
			assert.ErrorIs(t, sendErr, audit.ErrDestinationUnsupported)
		})
	}
}

func TestSIEMHandler_RegisterRoutesRequiresAdmin(t *testing.T) {
	tests := []struct {
		name       string
		user       *models.User
		wantStatus int
	}{
		{
			name:       "AdminCanReadSummary",
			user:       &models.User{Role: models.UserRoleAdmin},
			wantStatus: http.StatusOK,
		},
		{
			name:       "ViewerIsForbidden",
			user:       &models.User{Role: models.UserRoleViewer},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "UnknownUserIsForbidden",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			userID := uuid.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})

			mockStore := new(test.MockStore)
			mockStore.On("GetUser", userID).Return(tt.user, nil).Once()

			handler := NewSIEMHandler(mockStore)
			handler.RegisterRoutes(app.Group("/api"))

			req := httptest.NewRequest(http.MethodGet, "/api/audit/export/summary", nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantStatus == http.StatusOK {
				var summary audit.ExportSummary
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&summary))
				assert.Zero(t, summary.TotalDestinations)
				assert.Zero(t, summary.ActiveDestinations)
				assert.False(t, summary.EvaluatedAt.IsZero())
			}

			mockStore.AssertExpectations(t)
		})
	}
}

package audit

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// WebhookDestination.Send
// ---------------------------------------------------------------------------

func TestWebhookSend_Success(t *testing.T) {
	// Bypass SSRF guard for the loopback test server.
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	var received WebhookPayload
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "kubestellar-console-siem/1", r.Header.Get("User-Agent"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &received))

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)

	events := []PipelineEvent{
		{ID: "evt-1", Cluster: "prod-us", EventType: "pod_restart", Timestamp: time.Now()},
		{ID: "evt-2", Cluster: "prod-eu", EventType: "deploy_rollout", Timestamp: time.Now()},
	}

	err = dest.Send(context.Background(), events)
	require.NoError(t, err)

	assert.Equal(t, webhookPayloadVersion, received.Version)
	assert.Len(t, received.Events, 2)
	assert.Equal(t, "evt-1", received.Events[0].ID)
	assert.Equal(t, "prod-us", received.Events[0].Cluster)
}

func TestWebhookSend_EmptyEvents(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Send should not make a request for empty events")
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)

	// Empty events slice should short-circuit without HTTP call.
	err = dest.Send(context.Background(), []PipelineEvent{})
	require.NoError(t, err)
}

func TestWebhookSend_ServerError(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)

	events := []PipelineEvent{{ID: "evt-1", Timestamp: time.Now()}}
	err = dest.Send(context.Background(), events)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "status 500")
}

func TestWebhookSend_ContextCancelled(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate slow response — test should cancel before this returns.
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	events := []PipelineEvent{{ID: "evt-1", Timestamp: time.Now()}}
	err = dest.Send(ctx, events)
	assert.Error(t, err)
}

func TestWebhookSend_Non2xxIsError(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	codes := []int{http.StatusBadRequest, http.StatusForbidden, http.StatusBadGateway}
	for _, code := range codes {
		t.Run(http.StatusText(code), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(code)
			}))
			defer srv.Close()

			dest, err := NewWebhookDestination(srv.URL, nil)
			require.NoError(t, err)

			err = dest.Send(context.Background(), []PipelineEvent{{ID: "e"}})
			assert.Error(t, err)
			assert.Contains(t, err.Error(), "status")
		})
	}
}

func TestWebhookSend_CustomClient(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	customClient := &http.Client{Timeout: 5 * time.Second}
	dest, err := NewWebhookDestination(srv.URL, customClient)
	require.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{{ID: "e"}})
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// WebhookDestination.Provider
// ---------------------------------------------------------------------------

func TestWebhookProvider(t *testing.T) {
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })

	dest, err := NewWebhookDestination("https://example.com/webhook", nil)
	require.NoError(t, err)
	assert.Equal(t, ProviderWebhook, dest.Provider())
}

// ---------------------------------------------------------------------------
// stubDestination.Provider + Send
// ---------------------------------------------------------------------------

func TestStubDestinationProvider(t *testing.T) {
	stub := stubDestination{provider: ProviderSplunk}
	assert.Equal(t, ProviderSplunk, stub.Provider())
}

func TestStubDestinationSendReturnsUnsupported(t *testing.T) {
	stub := stubDestination{provider: ProviderElastic}
	err := stub.Send(context.Background(), []PipelineEvent{{ID: "e"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
	assert.Contains(t, err.Error(), string(ProviderElastic))
}

// ---------------------------------------------------------------------------
// SetStore / getStore
// ---------------------------------------------------------------------------

func TestSetStore_NilDisables(t *testing.T) {
	// Ensure starting state is clean.
	SetStore(nil)
	assert.Nil(t, getStore())
}

func TestSetStore_EnablesAndDisables(t *testing.T) {
	// Use a mock value (the interface check happens at call site, not SetStore).
	type fakeStore struct{ store.Store }
	fs := &fakeStore{}

	SetStore(fs)
	assert.Equal(t, fs, getStore())

	SetStore(nil)
	assert.Nil(t, getStore())
}

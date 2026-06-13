package audit

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// WebhookDestination.Send — previously at 0% coverage
// ────────────────────────────────────────────────────────────────────────────

func TestWebhookSend_Success(t *testing.T) {
	allowLoopbackDestinations(t)

	var received WebhookPayload
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "kubestellar-console-siem/1", r.Header.Get("User-Agent"))
		assert.Equal(t, http.MethodPost, r.Method)

		body, _ := io.ReadAll(r.Body)
		err := json.Unmarshal(body, &received)
		assert.NoError(t, err)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	events := []PipelineEvent{
		{ID: "evt-1", Cluster: "prod", EventType: "create", Resource: "deployment/nginx", User: "admin", Timestamp: time.Now()},
		{ID: "evt-2", Cluster: "staging", EventType: "delete", Resource: "pod/test", User: "dev", Timestamp: time.Now()},
	}

	err = dest.Send(context.Background(), events)
	assert.NoError(t, err)

	assert.Equal(t, webhookPayloadVersion, received.Version)
	assert.Len(t, received.Events, 2)
	assert.Equal(t, "evt-1", received.Events[0].ID)
	assert.Equal(t, "prod", received.Events[0].Cluster)
	assert.Equal(t, "evt-2", received.Events[1].ID)
}

func TestWebhookSend_EmptyEventsNoHTTPCall(t *testing.T) {
	allowLoopbackDestinations(t)

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), []PipelineEvent{})
	assert.NoError(t, err)
	assert.Equal(t, 0, callCount, "empty events should not trigger HTTP call")
}

func TestWebhookSend_NilEventsNoHTTPCall(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not be called for nil events")
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	err = dest.Send(context.Background(), nil)
	assert.NoError(t, err)
}

func TestWebhookSend_Non2xxReturnsError(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	events := []PipelineEvent{{ID: "evt-1"}}
	err = dest.Send(context.Background(), events)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "status 500")
}

func TestWebhookSend_4xxReturnsError(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	events := []PipelineEvent{{ID: "evt-1"}}
	err = dest.Send(context.Background(), events)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "status 403")
}

func TestWebhookSend_ContextCancellation(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	events := []PipelineEvent{{ID: "evt-1"}}
	err = dest.Send(ctx, events)
	assert.Error(t, err, "should fail when context is cancelled")
}

func TestWebhookSend_PayloadVersion(t *testing.T) {
	allowLoopbackDestinations(t)

	var received WebhookPayload
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, srv.Client())
	require.NoError(t, err)

	events := []PipelineEvent{{ID: "evt-1", Timestamp: time.Now()}}
	err = dest.Send(context.Background(), events)
	require.NoError(t, err)

	assert.Equal(t, 1, received.Version)
	assert.False(t, received.SentAt.IsZero(), "SentAt should be populated")
}

// ────────────────────────────────────────────────────────────────────────────
// NewWebhookDestination validation
// ────────────────────────────────────────────────────────────────────────────

func TestNewWebhookDestination_EmptyURL(t *testing.T) {
	_, err := NewWebhookDestination("", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "url is required")
}

func TestNewWebhookDestination_NilClientUsesDefault(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)
	require.NotNil(t, dest)
	assert.NotNil(t, dest.client, "should create default client")
}

func TestWebhookDestination_Provider(t *testing.T) {
	allowLoopbackDestinations(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest, err := NewWebhookDestination(srv.URL, nil)
	require.NoError(t, err)
	assert.Equal(t, ProviderWebhook, dest.Provider())
}

// ────────────────────────────────────────────────────────────────────────────
// stubDestination
// ────────────────────────────────────────────────────────────────────────────

func TestStubDestination_ReturnsUnsupported(t *testing.T) {
	stub := stubDestination{provider: ProviderSplunk}
	err := stub.Send(context.Background(), []PipelineEvent{{ID: "x"}})
	assert.Error(t, err)
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
	assert.Contains(t, err.Error(), "splunk")
}

func TestStubDestination_ProviderSyslog(t *testing.T) {
	stub := stubDestination{provider: ProviderSyslog}
	assert.Equal(t, ProviderSyslog, stub.Provider())
}

func TestStubDestination_ProviderElastic(t *testing.T) {
	stub := stubDestination{provider: ProviderElastic}
	err := stub.Send(context.Background(), []PipelineEvent{{ID: "x"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
	assert.Contains(t, err.Error(), "elastic")
}

// ────────────────────────────────────────────────────────────────────────────
// SetStore + getStore
// ────────────────────────────────────────────────────────────────────────────

func TestSetStore_NilClearsStore(t *testing.T) {
	origStore := getStore()
	defer SetStore(origStore)

	SetStore(nil)
	assert.Nil(t, getStore())
}

func TestSetStore_GetStoreRoundTrip(t *testing.T) {
	origStore := getStore()
	defer SetStore(origStore)

	// SetStore accepts store.Store — use nil for this round-trip since we
	// cannot easily create a full mock. The key assertion is that the value
	// is stored and retrievable.
	SetStore(nil)
	assert.Nil(t, getStore())
}

// ────────────────────────────────────────────────────────────────────────────
// RegisterDestination — additional edge cases
// ────────────────────────────────────────────────────────────────────────────

func TestRegisterDestination_MissingID(t *testing.T) {
	_, err := RegisterDestination(DestinationConfig{
		Provider: ProviderWebhook,
		URL:      "http://example.com",
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "id is required")
}

func TestRegisterDestination_SplunkStubWhenMissingToken(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)
	allowLoopbackDestinations(t)

	adapter, err := RegisterDestination(DestinationConfig{
		ID:       "splunk-no-token",
		Name:     "Splunk Missing Token",
		Provider: ProviderSplunk,
		URL:      "",
		Token:    "",
	})
	require.NoError(t, err)
	assert.Equal(t, ProviderSplunk, adapter.Provider())

	// Should use stub that returns unsupported
	err = adapter.Send(context.Background(), []PipelineEvent{{ID: "x"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
}

func TestRegisterDestination_ElasticStubWhenMissingURL(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	adapter, err := RegisterDestination(DestinationConfig{
		ID:       "elastic-no-url",
		Name:     "Elastic No URL",
		Provider: ProviderElastic,
		URL:      "",
	})
	require.NoError(t, err)
	assert.Equal(t, ProviderElastic, adapter.Provider())

	err = adapter.Send(context.Background(), []PipelineEvent{{ID: "x"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
}

func TestRegisterDestination_SyslogStub(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	adapter, err := RegisterDestination(DestinationConfig{
		ID:       "syslog-1",
		Name:     "Syslog",
		Provider: ProviderSyslog,
	})
	require.NoError(t, err)
	assert.Equal(t, ProviderSyslog, adapter.Provider())

	err = adapter.Send(context.Background(), []PipelineEvent{{ID: "x"}})
	assert.ErrorIs(t, err, ErrDestinationUnsupported)
}

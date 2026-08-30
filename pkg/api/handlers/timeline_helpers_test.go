package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers/stellar"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// parseObject
// ---------------------------------------------------------------------------

func TestParseObject_Empty(t *testing.T) {
	kind, name := parseObject("")
	assert.Equal(t, "", kind)
	assert.Equal(t, "", name)
}

func TestParseObject_NoSlash(t *testing.T) {
	kind, name := parseObject("Pod")
	assert.Equal(t, "Pod", kind)
	assert.Equal(t, "", name)
}

func TestParseObject_CanonicalKindName(t *testing.T) {
	kind, name := parseObject("Deployment/nginx-ingress")
	assert.Equal(t, "Deployment", kind)
	assert.Equal(t, "nginx-ingress", name)
}

func TestParseObject_FirstSlashWins(t *testing.T) {
	// Names that contain slashes: first slash splits kind from the rest.
	kind, name := parseObject("Pod/my-pod/extra")
	assert.Equal(t, "Pod", kind)
	assert.Equal(t, "my-pod/extra", name)
}

func TestParseObject_LeadingSlash(t *testing.T) {
	kind, name := parseObject("/my-name")
	assert.Equal(t, "", kind)
	assert.Equal(t, "my-name", name)
}

func TestParseObject_TrailingSlash(t *testing.T) {
	kind, name := parseObject("Deployment/")
	assert.Equal(t, "Deployment", kind)
	assert.Equal(t, "", name)
}

// ---------------------------------------------------------------------------
// retentionDays
// ---------------------------------------------------------------------------

func TestRetentionDays_Unset(t *testing.T) {
	os.Unsetenv("KSC_EVENT_RETENTION_DAYS")
	assert.Equal(t, defaultEventRetentionDays, retentionDays())
}

func TestRetentionDays_ValidPositive(t *testing.T) {
	t.Setenv("KSC_EVENT_RETENTION_DAYS", "14")
	assert.Equal(t, 14, retentionDays())
}

func TestRetentionDays_NonNumeric(t *testing.T) {
	t.Setenv("KSC_EVENT_RETENTION_DAYS", "forever")
	assert.Equal(t, defaultEventRetentionDays, retentionDays())
}

func TestRetentionDays_Zero(t *testing.T) {
	// Zero is not > 0, so the default must be used.
	t.Setenv("KSC_EVENT_RETENTION_DAYS", "0")
	assert.Equal(t, defaultEventRetentionDays, retentionDays())
}

func TestRetentionDays_Negative(t *testing.T) {
	t.Setenv("KSC_EVENT_RETENTION_DAYS", "-5")
	assert.Equal(t, defaultEventRetentionDays, retentionDays())
}

func TestRetentionDays_DefaultPositiveConstant(t *testing.T) {
	// Guard that nobody edits defaultEventRetentionDays to 0, which would
	// silently disable the retention sweep.
	assert.Greater(t, defaultEventRetentionDays, 0)
}

// ---------------------------------------------------------------------------
// demoTimelineEvents
// ---------------------------------------------------------------------------

func TestDemoTimelineEvents_Count(t *testing.T) {
	events := demoTimelineEvents()
	assert.Len(t, events, 21, "3 clusters × 7 reasons = 21 events")
}

func TestDemoTimelineEvents_UniqueIDs(t *testing.T) {
	events := demoTimelineEvents()
	seen := make(map[string]bool, len(events))
	for _, ev := range events {
		assert.False(t, seen[ev.ID], "duplicate ID: %s", ev.ID)
		seen[ev.ID] = true
	}
}

func TestDemoTimelineEvents_UIDPrefix(t *testing.T) {
	events := demoTimelineEvents()
	for _, ev := range events {
		assert.True(t, strings.HasPrefix(ev.EventUID, "demo-"),
			"EventUID %q should start with demo-", ev.EventUID)
	}
}

func TestDemoTimelineEvents_EventTypes(t *testing.T) {
	events := demoTimelineEvents()
	for _, ev := range events {
		assert.Contains(t, []string{"Normal", "Warning"}, ev.EventType,
			"unexpected EventType %q", ev.EventType)
	}
}

func TestDemoTimelineEvents_RequiredFieldsPopulated(t *testing.T) {
	events := demoTimelineEvents()
	for _, ev := range events {
		assert.NotEmpty(t, ev.ClusterName, "ClusterName must not be empty")
		assert.NotEmpty(t, ev.Reason, "Reason must not be empty")
		assert.NotEmpty(t, ev.Message, "Message must not be empty")
		assert.NotEmpty(t, ev.FirstSeen, "FirstSeen must not be empty")
		assert.NotEmpty(t, ev.LastSeen, "LastSeen must not be empty")
	}
}

// ---------------------------------------------------------------------------
// GetTimeline — demo mode
// ---------------------------------------------------------------------------

func TestGetTimeline_DemoMode(t *testing.T) {
	// When X-Demo-Mode is true the store must NOT be called.
	// We intentionally do NOT wire a QueryTimeline expectation; if the handler
	// hits the store it will panic on the mock.
	env := setupTestEnv(t)
	handler := NewTimelineHandler(env.Store, env.K8sClient)
	env.App.Get("/api/timeline", handler.GetTimeline)

	req, err := http.NewRequest(http.MethodGet, "/api/timeline", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")
	req.Host = "localhost"

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var events []store.ClusterEvent
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&events))
	assert.Len(t, events, 21)
}

// ---------------------------------------------------------------------------
// GetTimeline — limit clamping
// ---------------------------------------------------------------------------

func TestGetTimeline_LimitClamping(t *testing.T) {
	cases := []struct {
		name       string
		limitParam string
		wantLimit  int
	}{
		{"above_max", "9999", timelineMaxLimit},
		{"negative", "-1", timelineDefaultLimit},
		{"zero", "0", timelineDefaultLimit},
		{"non_numeric", "lots", timelineDefaultLimit},
		{"valid", "50", 50},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := setupTestEnv(t)
			mockStore := env.Store.(*test.MockStore)

			var capturedLimit int
			mockStore.On("QueryTimeline", mock.MatchedBy(func(f store.TimelineFilter) bool {
				capturedLimit = f.Limit
				return true
			})).Return([]store.ClusterEvent{}, nil)

			handler := NewTimelineHandler(env.Store, nil)
			env.App.Get("/api/timeline", handler.GetTimeline)

			req, err := http.NewRequest(http.MethodGet, "/api/timeline?limit="+tc.limitParam, nil)
			require.NoError(t, err)
			req.Host = "localhost"

			resp, err := env.App.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, http.StatusOK, resp.StatusCode)
			assert.Equal(t, tc.wantLimit, capturedLimit, "limit mismatch for %s", tc.name)
		})
	}
}

// ---------------------------------------------------------------------------
// SetStellarEventSink
// ---------------------------------------------------------------------------

func TestSetStellarEventSink_SetsValue(t *testing.T) {
	env := setupTestEnv(t)
	h := NewTimelineHandler(env.Store, nil)
	assert.Nil(t, h.stellarSink)

	var sink mockStellarSink
	h.SetStellarEventSink(&sink)
	assert.Equal(t, &sink, h.stellarSink)
}

func TestSetStellarEventSink_NilUnwiring(t *testing.T) {
	env := setupTestEnv(t)
	h := NewTimelineHandler(env.Store, nil)
	var sink mockStellarSink
	h.SetStellarEventSink(&sink)
	h.SetStellarEventSink(nil)
	assert.Nil(t, h.stellarSink)
}

// mockStellarSink satisfies StellarEventSink for tests.
type mockStellarSink struct{}

func (m *mockStellarSink) ProcessEvent(_ context.Context, _ stellar.IncomingEvent) {}

// Compile-time assertion.
var _ StellarEventSink = (*mockStellarSink)(nil)

// ---------------------------------------------------------------------------
// sweepOld
// ---------------------------------------------------------------------------

func TestSweepOld_HappyPath(t *testing.T) {
	env := setupTestEnv(t)
	h := NewTimelineHandler(env.Store, nil)
	// SweepOldEvents on MockStore returns (0, nil) by default — must not panic.
	assert.NotPanics(t, func() {
		h.sweepOld()
	})
}

func TestSweepOld_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	mockStore, ok := env.Store.(*test.MockStore)
	require.True(t, ok, "env.Store must be a *test.MockStore")
	mockStore.On("SweepOldEvents", mock.AnythingOfType("int")).Return(int64(0), errors.New("db error"))
	h := NewTimelineHandler(env.Store, nil)
	// sweepOld logs the error but must not panic.
	assert.NotPanics(t, func() {
		h.sweepOld()
	})
	mockStore.AssertCalled(t, "SweepOldEvents", mock.AnythingOfType("int"))
}

// ---------------------------------------------------------------------------
// StartEventCollector
// ---------------------------------------------------------------------------

func TestStartEventCollector_NilClientEarlyReturn(t *testing.T) {
	env := setupTestEnv(t)
	// nil k8sClient: StartEventCollector must return immediately without
	// spawning a goroutine that would nil-deref on HealthyClusters.
	h := NewTimelineHandler(env.Store, nil)
	done := make(chan struct{})
	defer close(done)

	assert.NotPanics(t, func() {
		h.StartEventCollector(done)
	})
}

package stellar

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// autoTriggerFakeStore wraps test.MockStore so the autoTriggerSolve and
// isLatestEventBatch tests can control the solveFullStore surface
// (GetLatestEventBatchTimestamp, GetRecentSolveForWorkload, CreateSolve,
// UpdateSolveStatus, LogActivity) without changing the shared MockStore's
// hardcoded nil/zero returns used by every other stellar test.
type autoTriggerFakeStore struct {
	*test.MockStore

	latestBatchTimestamp *time.Time
	latestBatchErr       error

	recentSolve    *store.StellarSolve
	recentSolveErr error

	createSolveErr error

	updatedStatuses []string
	updatedSummary  string

	activityKinds []string
}

func (f *autoTriggerFakeStore) GetLatestEventBatchTimestamp(_ context.Context) (*time.Time, error) {
	return f.latestBatchTimestamp, f.latestBatchErr
}

func (f *autoTriggerFakeStore) GetRecentSolveForWorkload(_ context.Context, _, _, _ string, _ time.Time) (*store.StellarSolve, error) {
	return f.recentSolve, f.recentSolveErr
}

func (f *autoTriggerFakeStore) CreateSolve(_ context.Context, solve *store.StellarSolve) error {
	if f.createSolveErr != nil {
		return f.createSolveErr
	}
	// The real store assigns an ID; autoTriggerSolve slices solve.ID[:8], so
	// the fake must mimic that invariant or the code under test would panic
	// on a short/empty ID.
	solve.ID = "solve-00000000"
	return nil
}

func (f *autoTriggerFakeStore) UpdateSolveStatus(_ context.Context, _, status, summary, _, _ string) error {
	f.updatedStatuses = append(f.updatedStatuses, status)
	f.updatedSummary = summary
	return nil
}

func (f *autoTriggerFakeStore) LogActivity(_ context.Context, a *store.StellarActivity) error {
	f.activityKinds = append(f.activityKinds, a.Kind)
	return nil
}

func newAutoTriggerTestHandler(fake *autoTriggerFakeStore) (*Handler, chan SSEEvent) {
	h := &Handler{store: fake}
	ch := make(chan SSEEvent, 32)
	h.registerSSEClient("test-conn", "admin-observer", true, ch)
	return h, ch
}

func drainSSEEvents(ch chan SSEEvent) []SSEEvent {
	var events []SSEEvent
	for {
		select {
		case e := <-ch:
			events = append(events, e)
		default:
			return events
		}
	}
}

func TestIsLatestEventBatch(t *testing.T) {
	ctx := context.Background()
	batchA := time.Date(2024, 5, 1, 12, 0, 0, 0, time.UTC)
	batchB := time.Date(2024, 5, 1, 13, 0, 0, 0, time.UTC)

	t.Run("store error is propagated", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore), latestBatchErr: assert.AnError}
		h := &Handler{store: fake}
		_, _, err := h.isLatestEventBatch(ctx, &store.StellarNotification{BatchTimestamp: &batchA})
		assert.ErrorIs(t, err, assert.AnError)
	})

	t.Run("nil notification is not the latest batch", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore), latestBatchTimestamp: &batchA}
		h := &Handler{store: fake}
		isLatest, latest, err := h.isLatestEventBatch(ctx, nil)
		require.NoError(t, err)
		assert.False(t, isLatest)
		assert.Equal(t, &batchA, latest)
	})

	t.Run("notification with nil BatchTimestamp is not the latest batch", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore), latestBatchTimestamp: &batchA}
		h := &Handler{store: fake}
		isLatest, _, err := h.isLatestEventBatch(ctx, &store.StellarNotification{})
		require.NoError(t, err)
		assert.False(t, isLatest)
	})

	t.Run("nil latest batch timestamp from store is not the latest batch", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore)}
		h := &Handler{store: fake}
		isLatest, latest, err := h.isLatestEventBatch(ctx, &store.StellarNotification{BatchTimestamp: &batchA})
		require.NoError(t, err)
		assert.False(t, isLatest)
		assert.Nil(t, latest)
	})

	t.Run("matching batch timestamps are the latest batch", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore), latestBatchTimestamp: &batchA}
		h := &Handler{store: fake}
		isLatest, _, err := h.isLatestEventBatch(ctx, &store.StellarNotification{BatchTimestamp: &batchA})
		require.NoError(t, err)
		assert.True(t, isLatest)
	})

	t.Run("mismatched batch timestamps are not the latest batch", func(t *testing.T) {
		fake := &autoTriggerFakeStore{MockStore: new(test.MockStore), latestBatchTimestamp: &batchB}
		h := &Handler{store: fake}
		isLatest, _, err := h.isLatestEventBatch(ctx, &store.StellarNotification{BatchTimestamp: &batchA})
		require.NoError(t, err)
		assert.False(t, isLatest)
	})
}

func TestAutoTriggerSolve(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	event := IncomingEvent{
		Cluster:   "cluster-1",
		Namespace: "ns-1",
		Name:      "web-7c9f8-abcde",
		Kind:      "Pod",
		Reason:    "CrashLoopBackOff",
		Message:   "back-off restarting failed container",
		Type:      "Warning",
	}
	notif := &store.StellarNotification{
		ID:             "notif-1",
		UserID:         "user-1",
		BatchTimestamp: &now,
	}

	t.Run("links to an already-running solve instead of starting a new one", func(t *testing.T) {
		fake := &autoTriggerFakeStore{
			MockStore: new(test.MockStore),
			recentSolve: &store.StellarSolve{
				ID:        "solve-existing",
				Status:    "running",
				StartedAt: now.Add(-time.Minute),
			},
		}
		h, ch := newAutoTriggerTestHandler(fake)

		h.autoTriggerSolve(ctx, event, notif, nil)

		assert.Empty(t, fake.updatedStatuses, "a linked solve must not update any solve status")
		assert.Contains(t, fake.activityKinds, "decided_skip")

		events := drainSSEEvents(ch)
		require.NotEmpty(t, events)
		assert.Equal(t, "solve_started", events[0].Type)
		data, ok := events[0].Data.(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, "solve-existing", data["solveId"])
	})

	t.Run("escalates without acting when the event is from a stale batch", func(t *testing.T) {
		staleTime := now.Add(-time.Hour)
		notifStale := &store.StellarNotification{
			ID:             "notif-2",
			UserID:         "user-1",
			BatchTimestamp: &staleTime,
		}
		fake := &autoTriggerFakeStore{
			MockStore:            new(test.MockStore),
			latestBatchTimestamp: &now,
		}
		h, ch := newAutoTriggerTestHandler(fake)

		h.autoTriggerSolve(ctx, event, notifStale, nil)

		require.Len(t, fake.updatedStatuses, 1)
		assert.Equal(t, "escalated", fake.updatedStatuses[0])
		assert.Contains(t, fake.activityKinds, "solve_escalated")

		events := drainSSEEvents(ch)
		var sawComplete bool
		for _, e := range events {
			if e.Type == "solve_complete" {
				sawComplete = true
				data := e.Data.(map[string]interface{})
				assert.Equal(t, "escalated", data["status"])
			}
		}
		assert.True(t, sawComplete, "expected a solve_complete escalated event")
	})

	t.Run("falls through to the AI mission when no safe auto-action applies", func(t *testing.T) {
		fake := &autoTriggerFakeStore{
			MockStore:            new(test.MockStore),
			latestBatchTimestamp: &now,
		}
		h, ch := newAutoTriggerTestHandler(fake)
		eval := &stellar.EvaluationResult{Reasoning: "pod keeps crashing on startup"}

		h.autoTriggerSolve(ctx, event, notif, eval)

		assert.Empty(t, fake.updatedStatuses, "the AI-mission path must not resolve or escalate the solve itself")
		assert.Contains(t, fake.activityKinds, "root_cause")
		assert.Contains(t, fake.activityKinds, "solving")

		events := drainSSEEvents(ch)
		var sawMissionTrigger bool
		for _, e := range events {
			if e.Type == "mission_trigger" {
				sawMissionTrigger = true
				data := e.Data.(map[string]interface{})
				assert.Equal(t, "cluster-1", data["cluster"])
				assert.Equal(t, "ns-1", data["namespace"])
				prompt, ok := data["prompt"].(string)
				require.True(t, ok)
				assert.Contains(t, prompt, "Diagnose and fix it")
			}
		}
		assert.True(t, sawMissionTrigger, "expected a mission_trigger event")
	})

	t.Run("does nothing when the handler store does not support solves", func(t *testing.T) {
		h := &Handler{store: new(test.MockStore)}
		// MockStore itself satisfies solveFullStore today; simulate a Store
		// implementation that does not by wrapping it so h.fullStore()
		// returns ok=false — autoTriggerSolve must return immediately
		// without panicking on a nil k8sClient/broadcaster.
		h.store = narrowStoreOnly{Store: new(test.MockStore)}
		assert.NotPanics(t, func() {
			h.autoTriggerSolve(ctx, event, notif, nil)
		})
	})
}

// narrowStoreOnly exposes only the Store interface, hiding the wider
// solveFullStore methods test.MockStore also implements, so h.fullStore()
// resolves to ok=false.
type narrowStoreOnly struct {
	Store
}

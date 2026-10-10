package stellar

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/store"
)

// newAutomationTestHandler builds a Handler backed by a real SQLite store but
// with no k8s client, scoped to the auto-remediation branches in this file
// that never reach scheduler.Dispatch (idempotency short-circuits and
// non-RestartDeployment delegation/no-ops).
func newAutomationTestHandler(t *testing.T) *Handler {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-automation.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })
	return NewHandler(sqlStore, nil)
}

// ---------- autoExecuteAction ----------

func TestAutoExecuteAction_NonRestartDelegatesToQueueAutoTend(t *testing.T) {
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "pod-abc", Kind: "Pod", Reason: "OOMKilled"}
	rec := &stellar.RecommendedAction{Type: "ScaleDeployment", Reasoning: "scale up"}

	h.autoExecuteAction(ctx, e, rec, "notif-1")

	// Non-RestartDeployment types must never be auto-executed directly; they
	// are delegated to queueAutoTendAction. Note that queueAutoTendAction
	// itself also only handles "RestartDeployment" ("Other action types not
	// yet supported for auto-tend") so the net effect of this delegation for
	// any other type is currently a silent no-op: nothing is auto-executed,
	// and nothing is queued for approval either.
	actions, err := h.store.ListStellarActions(ctx, "system", "", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, actions, "non-RestartDeployment auto-execute delegates to queueAutoTendAction, which is itself a no-op for non-RestartDeployment types")
}

func TestAutoExecuteAction_IdempotencyKeyDedupIsCurrentlyBroken(t *testing.T) {
	// NOTE: documents the *actual* current behavior, not the intended one.
	// CreateStellarAction never persists idempotency_key (see #24212), so
	// ActionCompletedByIdempotencyKey can never match a genuinely created
	// row and the dedup short-circuit below never fires. Once #24212 is
	// fixed, this test's expected count must change from 2 back to 1 and
	// the title/assertion should be restored to the originally-intended
	// "skips when already completed" behavior.
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "pod-xyz-7d4c5b9f4-abc12", Kind: "Pod", Reason: "CrashLoopBackOff"}
	rec := &stellar.RecommendedAction{Type: "RestartDeployment", Reasoning: "restart crashlooping pod"}

	idempotencyKey := "auto-exec:RestartDeployment:c1:ns1:pod-xyz-7d4c5b9f4-abc12"
	require.NoError(t, h.store.CreateStellarAction(ctx, &store.StellarAction{
		UserID:         "system",
		ActionType:     "RestartDeployment",
		Cluster:        "c1",
		Namespace:      "ns1",
		Status:         "completed",
		CreatedBy:      "stellar",
		IdempotencyKey: idempotencyKey,
	}))

	h.autoExecuteAction(ctx, e, rec, "notif-2")

	actions, err := h.store.ListStellarActions(ctx, "system", "", 10, 0)
	require.NoError(t, err)
	assert.Len(t, actions, 2, "idempotency dedup is currently broken (#24212): a duplicate action is created instead of being skipped")
}

// ---------- queueAutoTendAction ----------

func TestQueueAutoTendAction_NonRestartIsNoOp(t *testing.T) {
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "pod-abc", Kind: "Pod", Reason: "FailedScheduling"}
	rec := &stellar.RecommendedAction{Type: "DeletePod", Reasoning: "delete stuck pod"}

	h.queueAutoTendAction(ctx, e, rec, "notif-3")

	actions, err := h.store.ListStellarActions(ctx, "system", "", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, actions, "non-RestartDeployment types are not yet supported for auto-tend")
}

func TestQueueAutoTendAction_CreatesActionAndNotification(t *testing.T) {
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "api-server-7d4c5b9f4-abc12", Kind: "Pod", Reason: "OOMKilled"}
	rec := &stellar.RecommendedAction{Type: "RestartDeployment", Reasoning: "pod was OOM-killed repeatedly"}

	h.queueAutoTendAction(ctx, e, rec, "notif-4")

	actions, err := h.store.ListStellarActions(ctx, "system", "", 10, 0)
	require.NoError(t, err)
	require.Len(t, actions, 1)
	assert.Equal(t, "pending_approval", actions[0].Status)
	assert.Equal(t, "RestartDeployment", actions[0].ActionType)

	notifs, err := h.store.ListStellarNotifications(ctx, "system", 10, false)
	require.NoError(t, err)
	require.Len(t, notifs, 1)
	assert.Equal(t, "ActionRequired", notifs[0].Type)
	assert.Equal(t, actions[0].ID, notifs[0].ActionID)
}

func TestQueueAutoTendAction_IdempotencyKeyDedupIsCurrentlyBroken(t *testing.T) {
	// NOTE: documents the *actual* current behavior, not the intended one —
	// see the matching note on TestAutoExecuteAction_IdempotencyKeyDedupIsCurrentlyBroken
	// and #24212.
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "api-server-7d4c5b9f4-abc12", Kind: "Pod", Reason: "OOMKilled"}
	rec := &stellar.RecommendedAction{Type: "RestartDeployment", Reasoning: "pod was OOM-killed repeatedly"}

	idempotencyKey := "auto:RestartDeployment:c1:ns1:api-server-7d4c5b9f4-abc12"
	require.NoError(t, h.store.CreateStellarAction(ctx, &store.StellarAction{
		UserID:         "system",
		ActionType:     "RestartDeployment",
		Cluster:        "c1",
		Namespace:      "ns1",
		Status:         "completed",
		CreatedBy:      "stellar",
		IdempotencyKey: idempotencyKey,
	}))

	h.queueAutoTendAction(ctx, e, rec, "notif-5")

	actions, err := h.store.ListStellarActions(ctx, "system", "", 10, 0)
	require.NoError(t, err)
	assert.Len(t, actions, 2, "idempotency dedup is currently broken (#24212): a duplicate pending action is created instead of being skipped")
}

// ---------- autoCreateWatch ----------

func TestAutoCreateWatch_CreatesNewWatchWhenNoneExists(t *testing.T) {
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "deploy-1", Kind: "Deployment", Reason: "FailedMount", Message: "unable to mount volume"}

	h.autoCreateWatch(ctx, e)

	watches, err := h.store.GetActiveWatches(ctx, "system")
	require.NoError(t, err)
	require.Len(t, watches, 1)
	assert.Equal(t, "deploy-1", watches[0].ResourceName)
	assert.Contains(t, watches[0].Reason, "FailedMount")
}

func TestAutoCreateWatch_TouchesExistingWatchInsteadOfDuplicating(t *testing.T) {
	h := newAutomationTestHandler(t)
	ctx := context.Background()
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "deploy-1", Kind: "Deployment", Reason: "FailedMount", Message: "first failure"}

	h.autoCreateWatch(ctx, e)
	h.autoCreateWatch(ctx, IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "deploy-1", Kind: "Deployment", Reason: "FailedMount", Message: "second failure"})

	watches, err := h.store.GetActiveWatches(ctx, "system")
	require.NoError(t, err)
	require.Len(t, watches, 1, "a repeat event for the same resource must refresh, not duplicate, the watch")
	assert.Contains(t, watches[0].LastUpdate, "second failure")
}

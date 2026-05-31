package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSQLiteStellarActionsListAndLifecycle(t *testing.T) {
	store := OpenTestDB(t)
	baseTime := time.Date(2025, time.March, 4, 5, 6, 7, 0, time.UTC)

	pending := createActionForTest(t, store, &StellarAction{
		UserID:      "user-1",
		Description: "Pending action",
		ActionType:  "ScaleDeployment",
		Cluster:     "prod-a",
		CreatedBy:   "user-1",
		CreatedAt:   baseTime.Add(time.Minute),
	})
	approved := createActionForTest(t, store, &StellarAction{
		UserID:      "user-1",
		Description: "Approved action",
		ActionType:  "RestartPods",
		Parameters:  `{"namespace":"default"}`,
		Cluster:     "prod-a",
		Namespace:   "default",
		Status:      "approved",
		CreatedBy:   "user-1",
		CreatedAt:   baseTime.Add(2 * time.Minute),
	})
	rejected := createActionForTest(t, store, &StellarAction{
		UserID:      "user-1",
		Description: "Rejected action",
		ActionType:  "DrainNode",
		Cluster:     "prod-b",
		Status:      "rejected",
		CreatedBy:   "user-1",
		CreatedAt:   baseTime.Add(3 * time.Minute),
	})
	createActionForTest(t, store, &StellarAction{
		UserID:      "other-user",
		Description: "Foreign action",
		ActionType:  "ScaleDeployment",
		Cluster:     "prod-z",
		CreatedBy:   "other-user",
		CreatedAt:   baseTime.Add(4 * time.Minute),
	})

	listTests := []struct {
		name    string
		status  string
		limit   int
		offset  int
		wantIDs []string
	}{
		{name: "empty results", status: "completed", limit: 10},
		{name: "all actions newest first", limit: 10, wantIDs: []string{rejected.ID, approved.ID, pending.ID}},
		{name: "status filter", status: "approved", limit: 10, wantIDs: []string{approved.ID}},
		{name: "pagination", limit: 2, offset: 1, wantIDs: []string{approved.ID, pending.ID}},
	}
	for _, tc := range listTests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := store.ListStellarActions(ctx, "user-1", tc.status, tc.limit, tc.offset)
			require.NoError(t, err)
			requireActionIDs(t, got, tc.wantIDs)
		})
	}

	got, err := store.GetStellarAction(ctx, "user-1", pending.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "{}", got.Parameters)
	require.Equal(t, "pending_approval", got.Status)

	missing, err := store.GetStellarAction(ctx, "user-1", "missing")
	require.NoError(t, err)
	require.Nil(t, missing)

	require.NoError(t, store.ApproveStellarAction(ctx, "user-1", pending.ID, "approver"))
	got, err = store.GetStellarAction(ctx, "user-1", pending.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "approved", got.Status)
	require.Equal(t, "approver", got.ApprovedBy)
	require.NotNil(t, got.ApprovedAt)

	require.NoError(t, store.RejectStellarAction(ctx, "user-1", pending.ID, "approver", "unsafe"))
	got, err = store.GetStellarAction(ctx, "user-1", pending.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "rejected", got.Status)
	require.Equal(t, "unsafe", got.RejectReason)

	require.NoError(t, store.DeleteStellarAction(ctx, "user-1", rejected.ID))
	got, err = store.GetStellarAction(ctx, "user-1", rejected.ID)
	require.NoError(t, err)
	require.Nil(t, got)
}

func TestSQLiteStellarActionsSchedulingAndStatus(t *testing.T) {
	store := OpenTestDB(t)
	now := time.Date(2025, time.April, 5, 6, 7, 8, 0, time.UTC)
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)

	dueApproved := createActionForTest(t, store, &StellarAction{
		ID:          "due-approved",
		UserID:      "user-1",
		Description: "Due approved",
		ActionType:  "ScaleDeployment",
		Cluster:     "prod-a",
		Namespace:   "default",
		ScheduledAt: &past,
		Status:      "approved",
		CreatedBy:   "user-1",
	})
	futureApproved := createActionForTest(t, store, &StellarAction{
		ID:          "future-approved",
		UserID:      "user-1",
		Description: "Future approved",
		ActionType:  "ScaleDeployment",
		Cluster:     "prod-a",
		ScheduledAt: &future,
		Status:      "approved",
		CreatedBy:   "user-1",
	})
	unscheduledApproved := createActionForTest(t, store, &StellarAction{
		ID:          "unscheduled-approved",
		UserID:      "user-1",
		Description: "Unscheduled approved",
		ActionType:  "RestartPods",
		Cluster:     "prod-a",
		Status:      "approved",
		CreatedBy:   "user-1",
	})
	stalePending := createActionForTest(t, store, &StellarAction{
		ID:          "stale-pending",
		UserID:      "user-1",
		Description: "Stale pending",
		ActionType:  "DrainNode",
		Cluster:     "prod-a",
		Status:      "pending_approval",
		CreatedBy:   "user-1",
		CreatedAt:   now.Add(-2 * time.Hour),
	})
	createActionForTest(t, store, &StellarAction{
		ID:          "fresh-pending",
		UserID:      "user-1",
		Description: "Fresh pending",
		ActionType:  "DrainNode",
		Cluster:     "prod-a",
		Status:      "pending_approval",
		CreatedBy:   "user-1",
		CreatedAt:   now.Add(time.Hour),
	})
	completedKey := createActionForTest(t, store, &StellarAction{
		ID:             "completed-key",
		UserID:         "user-1",
		Description:    "Completed with key",
		ActionType:     "ScaleDeployment",
		Cluster:        "prod-a",
		Status:         "completed",
		CreatedBy:      "user-1",
		IdempotencyKey: "idem-1",
	})
	setActionColumnForTest(t, store, completedKey.ID, "idempotency_key", completedKey.IdempotencyKey)

	due, err := store.GetDueApprovedStellarActions(ctx, now, 10)
	require.NoError(t, err)
	requireActionIDs(t, due, []string{dueApproved.ID, unscheduledApproved.ID})

	olderThan, err := store.GetPendingApprovalActionsOlderThan(ctx, now, 10)
	require.NoError(t, err)
	requireActionIDs(t, olderThan, []string{stalePending.ID})

	statusTests := []struct {
		name         string
		status       string
		outcome      string
		rejectReason string
	}{
		{name: "completed", status: "completed", outcome: "done"},
		{name: "failed", status: "failed", rejectReason: "boom"},
		{name: "running", status: "running"},
		{name: "custom", status: "superseded", outcome: "self-healed", rejectReason: "n/a"},
	}
	for _, tc := range statusTests {
		t.Run(tc.name, func(t *testing.T) {
			action := createActionForTest(t, store, &StellarAction{UserID: "user-1", Description: tc.name, ActionType: "ScaleDeployment", Cluster: "prod-a", Status: "approved", CreatedBy: "user-1"})
			require.NoError(t, store.UpdateStellarActionStatus(ctx, action.ID, tc.status, tc.outcome, tc.rejectReason))
			got, err := store.GetStellarAction(ctx, "user-1", action.ID)
			require.NoError(t, err)
			require.Equal(t, tc.status, got.Status)
			require.Equal(t, tc.outcome, got.Outcome)
			require.Equal(t, tc.rejectReason, got.RejectReason)
			if tc.status == "completed" || tc.status == "failed" {
				require.NotNil(t, got.ExecutedAt)
				require.NotNil(t, got.ApprovedAt)
			}
		})
	}

	pendingIDs, err := store.GetPendingActionIDs(ctx)
	require.NoError(t, err)
	require.Contains(t, pendingIDs, stalePending.ID)
	require.NotContains(t, pendingIDs, futureApproved.ID)

	require.True(t, store.ActionCompletedByIdempotencyKey(ctx, "idem-1"))
	require.False(t, store.ActionCompletedByIdempotencyKey(ctx, "missing"))
	require.False(t, store.ActionCompletedByIdempotencyKey(ctx, "   "))

	retryAction := createActionForTest(t, store, &StellarAction{ID: "retry-action", UserID: "user-1", Description: "Retry", ActionType: "ScaleDeployment", Cluster: "prod-a", Status: "failed", CreatedBy: "user-1"})
	require.NoError(t, store.IncrementRetry(ctx, retryAction.ID))
	var retryCount int
	var status string
	err = store.db.QueryRowContext(ctx, `SELECT retry_count, status FROM stellar_actions WHERE id = ?`, retryAction.ID).Scan(&retryCount, &status)
	require.NoError(t, err)
	require.Equal(t, 1, retryCount)
	require.Equal(t, "approved", status)
}

func TestSQLiteStellarActionsErrors(t *testing.T) {
	store := OpenTestDB(t)
	require.NoError(t, store.Close())

	_, err := store.ListStellarActions(ctx, "user-1", "", 10, 0)
	require.Error(t, err)

	err = store.CreateStellarAction(ctx, &StellarAction{UserID: "user-1", Description: "x", ActionType: "ScaleDeployment", Cluster: "prod-a", CreatedBy: "user-1"})
	require.Error(t, err)
}

func createActionForTest(t *testing.T, store *SQLiteStore, action *StellarAction) *StellarAction {
	t.Helper()
	require.NoError(t, store.CreateStellarAction(ctx, action))
	require.NotEmpty(t, action.ID)
	return action
}

func setActionColumnForTest(t *testing.T, store *SQLiteStore, id, column string, value any) {
	t.Helper()
	_, err := store.db.ExecContext(ctx, fmt.Sprintf("UPDATE stellar_actions SET %s = ? WHERE id = ?", column), value, id)
	require.NoError(t, err)
}

func requireActionIDs(t *testing.T, got []StellarAction, want []string) {
	t.Helper()
	require.Len(t, got, len(want))
	for i, id := range want {
		require.Equal(t, id, got[i].ID)
	}
}

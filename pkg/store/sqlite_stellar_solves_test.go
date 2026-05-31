package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSQLiteStellarSolvesLifecycle(t *testing.T) {
	store := OpenTestDB(t)
	baseTime := time.Date(2025, time.May, 6, 7, 8, 9, 0, time.UTC)

	runningOlder := createSolveForTest(t, store, &StellarSolve{EventID: "event-1", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api", StartedAt: baseTime.Add(time.Minute), Summary: "older"})
	runningNewest := createSolveForTest(t, store, &StellarSolve{EventID: "event-1", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api", StartedAt: baseTime.Add(2 * time.Minute), Summary: "newest"})
	createSolveForTest(t, store, &StellarSolve{EventID: "event-2", UserID: "other-user", Cluster: "prod-b", Namespace: "ops", Workload: "worker", StartedAt: baseTime.Add(3 * time.Minute), Summary: "foreign"})

	active, err := store.GetActiveSolveForEvent(ctx, "event-1")
	require.NoError(t, err)
	require.NotNil(t, active)
	require.Equal(t, runningNewest.ID, active.ID)

	missingActive, err := store.GetActiveSolveForEvent(ctx, "missing")
	require.NoError(t, err)
	require.Nil(t, missingActive)

	byID, err := store.GetSolveByID(ctx, runningOlder.ID)
	require.NoError(t, err)
	require.NotNil(t, byID)
	require.Equal(t, runningOlder.ID, byID.ID)
	require.Equal(t, "running", byID.Status)

	missingByID, err := store.GetSolveByID(ctx, "missing")
	require.NoError(t, err)
	require.Nil(t, missingByID)

	for i := 0; i < 4; i++ {
		createSolveForTest(t, store, &StellarSolve{EventID: "event-list", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api", StartedAt: baseTime.Add(time.Duration(10+i) * time.Minute), Summary: "list"})
	}

	listTests := []struct {
		name    string
		userID  string
		limit   int
		wantLen int
	}{
		{name: "empty user", userID: "missing", limit: 10, wantLen: 0},
		{name: "list by user", userID: "user-1", limit: 3, wantLen: 3},
		{name: "default limit when non-positive", userID: "user-1", limit: 0, wantLen: 6},
	}
	for _, tc := range listTests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := store.GetSolvesForUser(ctx, tc.userID, tc.limit)
			require.NoError(t, err)
			require.Len(t, got, tc.wantLen)
			for _, solve := range got {
				require.Equal(t, tc.userID, solve.UserID)
			}
		})
	}

	since, err := store.GetSolvesSince(ctx, "user-1", baseTime.Add(90*time.Second))
	require.NoError(t, err)
	require.NotEmpty(t, since)
	for _, solve := range since {
		require.True(t, !solve.StartedAt.Before(baseTime.Add(90*time.Second)))
	}
}

func TestSQLiteStellarSolvesStatusUpdates(t *testing.T) {
	store := OpenTestDB(t)
	nextRecheck := time.Date(2025, time.June, 7, 8, 9, 10, 0, time.UTC)

	statusTests := []struct {
		name        string
		status      string
		summary     string
		limitHit    string
		errStr      string
		wantEndedAt bool
	}{
		{name: "running update", status: "running", summary: "still running", wantEndedAt: false},
		{name: "resolved update", status: "resolved", summary: "fixed", wantEndedAt: true},
		{name: "exhausted update", status: "exhausted", summary: "gave up", limitHit: "max_actions", errStr: "boom", wantEndedAt: true},
	}

	for _, tc := range statusTests {
		t.Run(tc.name, func(t *testing.T) {
			solve := createSolveForTest(t, store, &StellarSolve{EventID: tc.name, UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api"})
			require.NoError(t, store.UpdateSolveStatus(ctx, solve.ID, tc.status, tc.summary, tc.limitHit, tc.errStr))
			got, err := store.GetSolveByID(ctx, solve.ID)
			require.NoError(t, err)
			require.Equal(t, tc.status, got.Status)
			require.Equal(t, tc.summary, got.Summary)
			require.Equal(t, tc.limitHit, got.LimitHit)
			require.Equal(t, tc.errStr, got.Error)
			if tc.wantEndedAt {
				require.NotNil(t, got.EndedAt)
			} else {
				require.Nil(t, got.EndedAt)
			}
		})
	}

	monitored := createSolveForTest(t, store, &StellarSolve{EventID: "event-monitored", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api"})
	require.NoError(t, store.UpdateSolveStatusWithRecheck(ctx, monitored.ID, "resolved_monitored", "monitoring", nextRecheck))
	require.NoError(t, store.IncrementSolveActions(ctx, monitored.ID))
	require.NoError(t, store.IncrementSolveActions(ctx, monitored.ID))

	got, err := store.GetSolveByID(ctx, monitored.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "resolved_monitored", got.Status)
	require.Equal(t, "monitoring", got.Summary)
	require.Equal(t, 2, got.ActionsTaken)
	require.NotNil(t, got.EndedAt)
	require.NotNil(t, got.NextRecheckAt)
	require.WithinDuration(t, nextRecheck, *got.NextRecheckAt, time.Second)
}

func TestSQLiteStellarSolvesRecentWorkloadAndErrors(t *testing.T) {
	store := OpenTestDB(t)
	cutoff := time.Date(2025, time.July, 8, 9, 10, 11, 0, time.UTC)

	createSolveForTest(t, store, &StellarSolve{EventID: "old", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api", StartedAt: cutoff.Add(-2 * time.Hour)})
	latest := createSolveForTest(t, store, &StellarSolve{EventID: "new", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api", StartedAt: cutoff.Add(time.Minute)})

	recent, err := store.GetRecentSolveForWorkload(ctx, "prod-a", "default", "api", cutoff)
	require.NoError(t, err)
	require.NotNil(t, recent)
	require.Equal(t, latest.ID, recent.ID)

	missing, err := store.GetRecentSolveForWorkload(ctx, "prod-a", "default", "missing", cutoff)
	require.NoError(t, err)
	require.Nil(t, missing)

	require.NoError(t, store.Close())

	_, err = store.GetSolvesForUser(ctx, "user-1", 10)
	require.Error(t, err)

	err = store.CreateSolve(ctx, &StellarSolve{EventID: "after-close", UserID: "user-1", Cluster: "prod-a", Namespace: "default", Workload: "api"})
	require.Error(t, err)
}

func createSolveForTest(t *testing.T, store *SQLiteStore, solve *StellarSolve) *StellarSolve {
	t.Helper()
	require.NoError(t, store.CreateSolve(ctx, solve))
	require.NotEmpty(t, solve.ID)
	return solve
}

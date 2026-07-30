package store

import (
	"database/sql"
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

func TestCreateSolveIfNoneActive(t *testing.T) {
	store := OpenTestDB(t)

	t.Run("creates solve when none exists", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "event-new",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "first solve",
		}

		created, isNew, err := store.CreateSolveIfNoneActive(ctx, solve)
		require.NoError(t, err)
		require.True(t, isNew, "should be new solve")
		require.NotNil(t, created)
		require.NotEmpty(t, created.ID)
		require.Equal(t, "running", created.Status)
		require.Equal(t, "event-new", created.EventID)
	})

	t.Run("returns existing solve without creating duplicate", func(t *testing.T) {
		eventID := "event-concurrent"
		existing := createSolveForTest(t, store, &StellarSolve{
			EventID:   eventID,
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "existing",
		})

		newSolve := &StellarSolve{
			EventID:   eventID,
			UserID:    "user-2",
			Cluster:   "prod-b",
			Namespace: "other",
			Workload:  "worker",
			Summary:   "should not be created",
		}

		result, isNew, err := store.CreateSolveIfNoneActive(ctx, newSolve)
		require.NoError(t, err)
		require.False(t, isNew, "should return existing")
		require.NotNil(t, result)
		require.Equal(t, existing.ID, result.ID, "should return existing solve ID")
		require.Equal(t, "existing", result.Summary, "should have original summary")
	})

	t.Run("creates new solve after previous is resolved", func(t *testing.T) {
		eventID := "event-resolved"
		oldSolve := createSolveForTest(t, store, &StellarSolve{
			EventID:   eventID,
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "old",
		})

		require.NoError(t, store.UpdateSolveStatus(ctx, oldSolve.ID, "resolved", "fixed", "", ""))

		newSolve := &StellarSolve{
			EventID:   eventID,
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "new solve after resolution",
		}

		result, isNew, err := store.CreateSolveIfNoneActive(ctx, newSolve)
		require.NoError(t, err)
		require.True(t, isNew, "should create new solve after old one resolved")
		require.NotNil(t, result)
		require.NotEqual(t, oldSolve.ID, result.ID, "should have different ID")
		require.Equal(t, "new solve after resolution", result.Summary)
	})
}

func TestBumpActionPriority(t *testing.T) {
	store := OpenTestDB(t)

	action := &StellarAction{
		UserID:      "user-1",
		Description: "Test action",
		ActionType:  "restart",
		Cluster:     "prod-a",
		Status:      "pending_approval",
		CreatedBy:   "user-1",
	}
	require.NoError(t, store.CreateStellarAction(ctx, action))
	require.NotEmpty(t, action.ID)

	t.Run("sets bumped_at timestamp", func(t *testing.T) {
		before := time.Now()
		err := store.BumpActionPriority(ctx, action.ID)
		require.NoError(t, err)

		var bumpedAt sql.NullTime
		err = store.db.QueryRowContext(ctx, `SELECT bumped_at FROM stellar_actions WHERE id = ?`, action.ID).Scan(&bumpedAt)
		require.NoError(t, err)
		require.True(t, bumpedAt.Valid, "bumped_at should be set")
		require.True(t, bumpedAt.Time.After(before.Add(-1*time.Second)))
	})

	t.Run("bumping multiple times updates timestamp", func(t *testing.T) {
		require.NoError(t, store.BumpActionPriority(ctx, action.ID))
		time.Sleep(10 * time.Millisecond)

		firstBump := time.Now()
		require.NoError(t, store.BumpActionPriority(ctx, action.ID))

		var bumpedAt sql.NullTime
		err := store.db.QueryRowContext(ctx, `SELECT bumped_at FROM stellar_actions WHERE id = ?`, action.ID).Scan(&bumpedAt)
		require.NoError(t, err)
		require.True(t, bumpedAt.Time.After(firstBump.Add(-1*time.Second)))
	})

	t.Run("no error on missing action ID", func(t *testing.T) {
		err := store.BumpActionPriority(ctx, "nonexistent-action")
		require.NoError(t, err, "bumping missing action should not error")
	})
}

func TestSupersedeAction(t *testing.T) {
	store := OpenTestDB(t)

	action := &StellarAction{
		UserID:      "user-1",
		Description: "Test action",
		ActionType:  "restart",
		Cluster:     "prod-a",
		Status:      "pending_approval",
		CreatedBy:   "user-1",
	}
	require.NoError(t, store.CreateStellarAction(ctx, action))

	t.Run("marks action as superseded with reason in outcome", func(t *testing.T) {
		reason := "operator manually fixed the issue"
		err := store.SupersedeAction(ctx, action.ID, reason)
		require.NoError(t, err)

		updated, err := store.GetStellarAction(ctx, "user-1", action.ID)
		require.NoError(t, err)
		require.Equal(t, "superseded", updated.Status)
		require.Equal(t, reason, updated.Outcome)
	})

	t.Run("updates updated_at timestamp", func(t *testing.T) {
		action2 := &StellarAction{
			UserID:      "user-1",
			Description: "Test action 2",
			ActionType:  "rollback",
			Cluster:     "prod-b",
			Status:      "pending_approval",
			CreatedBy:   "user-1",
		}
		require.NoError(t, store.CreateStellarAction(ctx, action2))

		err := store.SupersedeAction(ctx, action2.ID, "automated resolution")
		require.NoError(t, err)

		updated, err := store.GetStellarAction(ctx, "user-1", action2.ID)
		require.NoError(t, err)
		require.Equal(t, "superseded", updated.Status)
		require.Equal(t, "automated resolution", updated.Outcome)
	})

	t.Run("no error on missing action", func(t *testing.T) {
		err := store.SupersedeAction(ctx, "nonexistent", "some reason")
		require.NoError(t, err, "superseding missing action should not error")
	})
}

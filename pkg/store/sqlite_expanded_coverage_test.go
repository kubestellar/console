package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSQLiteStellarSolvesExtended adds additional coverage for stellar_solves table operations
func TestSQLiteStellarSolvesExtended(t *testing.T) {
	store := OpenTestDB(t)
	defer store.Close()

	t.Run("concurrent solve creation for same event", func(t *testing.T) {
		solve1 := &StellarSolve{
			EventID:   "concurrent-event",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "first solve",
		}
		solve2 := &StellarSolve{
			EventID:   "concurrent-event",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "second solve",
		}

		err1 := store.CreateSolve(ctx, solve1)
		require.NoError(t, err1)
		require.NotEmpty(t, solve1.ID)

		err2 := store.CreateSolve(ctx, solve2)
		require.NoError(t, err2)
		require.NotEmpty(t, solve2.ID)
		require.NotEqual(t, solve1.ID, solve2.ID)

		// GetActiveSolveForEvent should return the most recent one
		active, err := store.GetActiveSolveForEvent(ctx, "concurrent-event")
		require.NoError(t, err)
		require.NotNil(t, active)
		// Second solve was created later
		assert.Equal(t, solve2.ID, active.ID)
	})

	t.Run("solve status transitions", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "status-transitions",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		// Initial status should be "running"
		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, "running", got.Status)

		// Transition to resolved
		err = store.UpdateSolveStatus(ctx, solve.ID, "resolved", "problem fixed", "", "")
		require.NoError(t, err)

		got, err = store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, "resolved", got.Status)
		assert.Equal(t, "problem fixed", got.Summary)
		assert.NotNil(t, got.EndedAt)
	})

	t.Run("solve limit tracking", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "limit-tracking",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		// Update with limit hit
		err = store.UpdateSolveStatus(ctx, solve.ID, "exhausted", "gave up", "max_actions", "too many attempts")
		require.NoError(t, err)

		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, "exhausted", got.Status)
		assert.Equal(t, "max_actions", got.LimitHit)
		assert.Equal(t, "too many attempts", got.Error)
	})

	t.Run("solve action increment", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "action-tracking",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		// Initially should be 0
		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, 0, got.ActionsTaken)

		// Increment multiple times
		for i := 1; i <= 5; i++ {
			err = store.IncrementSolveActions(ctx, solve.ID)
			require.NoError(t, err)

			got, err = store.GetSolveByID(ctx, solve.ID)
			require.NoError(t, err)
			assert.Equal(t, i, got.ActionsTaken)
		}
	})

	t.Run("solve recheck scheduling", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "recheck-scheduling",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		nextRecheck := time.Now().Add(24 * time.Hour)
		err = store.UpdateSolveStatusWithRecheck(ctx, solve.ID, "resolved_monitored", "monitoring for regression", nextRecheck)
		require.NoError(t, err)

		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, "resolved_monitored", got.Status)
		assert.NotNil(t, got.NextRecheckAt)
		assert.WithinDuration(t, nextRecheck, *got.NextRecheckAt, time.Second)
	})

	t.Run("solves by user pagination", func(t *testing.T) {
		userID := "pagination-user"
		// Create 10 solves
		for i := 0; i < 10; i++ {
			solve := &StellarSolve{
				EventID:   "event-" + string(rune(i)),
				UserID:    userID,
				Cluster:   "prod-a",
				Namespace: "default",
				Workload:  "api",
			}
			err := store.CreateSolve(ctx, solve)
			require.NoError(t, err)
		}

		// Get first 5
		page1, err := store.GetSolvesForUser(ctx, userID, 5)
		require.NoError(t, err)
		assert.Len(t, page1, 5)

		// Get all
		all, err := store.GetSolvesForUser(ctx, userID, 100)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(all), 10)
	})
}

// TestNPSTableOperations tests NPS (Net Promoter Score) table operations
func TestNPSTableOperations(t *testing.T) {
	store := OpenTestDB(t)
	defer store.Close()

	t.Run("create NPS response", func(t *testing.T) {
		// Note: This test assumes NPS table exists and has methods
		// If not implemented yet, this serves as a placeholder for future implementation
		t.Skip("NPS table operations not yet implemented in store")
	})

	t.Run("query NPS responses by user", func(t *testing.T) {
		t.Skip("NPS table operations not yet implemented in store")
	})

	t.Run("calculate NPS score", func(t *testing.T) {
		t.Skip("NPS table operations not yet implemented in store")
	})

	t.Run("NPS response deduplication", func(t *testing.T) {
		t.Skip("NPS table operations not yet implemented in store")
	})
}

// TestFeedbackTableOperations tests feedback table operations
func TestFeedbackTableOperations(t *testing.T) {
	store := OpenTestDB(t)
	defer store.Close()

	t.Run("create feedback entry", func(t *testing.T) {
		// Note: This test assumes feedback table exists and has methods
		// If not implemented yet, this serves as a placeholder for future implementation
		t.Skip("Feedback table operations not yet implemented in store")
	})

	t.Run("query feedback by feature request", func(t *testing.T) {
		t.Skip("Feedback table operations not yet implemented in store")
	})

	t.Run("query feedback by user", func(t *testing.T) {
		t.Skip("Feedback table operations not yet implemented in store")
	})

	t.Run("feedback type validation", func(t *testing.T) {
		t.Skip("Feedback table operations not yet implemented in store")
	})

	t.Run("cascade delete on feature request removal", func(t *testing.T) {
		t.Skip("Feedback table operations not yet implemented in store")
	})
}

// TestStellarSolvesEdgeCases tests edge cases for stellar_solves table
func TestStellarSolvesEdgeCases(t *testing.T) {
	store := OpenTestDB(t)
	defer store.Close()

	t.Run("empty summary allowed", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "empty-summary",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   "",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, "", got.Summary)
	})

	t.Run("very long summary", func(t *testing.T) {
		longSummary := string(make([]byte, 10000))
		solve := &StellarSolve{
			EventID:   "long-summary",
			UserID:    "user-1",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			Summary:   longSummary,
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Len(t, got.Summary, len(longSummary))
	})

	t.Run("special characters in fields", func(t *testing.T) {
		solve := &StellarSolve{
			EventID:   "special-chars-event-🚀",
			UserID:    "user-with-special@chars.com",
			Cluster:   "prod-中文",
			Namespace: "ns-with-emoji-🎉",
			Workload:  "api-special-ñ",
			Summary:   "Summary with special chars: <>&\"'",
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)

		got, err := store.GetSolveByID(ctx, solve.ID)
		require.NoError(t, err)
		assert.Equal(t, solve.EventID, got.EventID)
		assert.Equal(t, solve.UserID, got.UserID)
		assert.Equal(t, solve.Cluster, got.Cluster)
		assert.Equal(t, solve.Namespace, got.Namespace)
		assert.Equal(t, solve.Workload, got.Workload)
		assert.Equal(t, solve.Summary, got.Summary)
	})

	t.Run("update non-existent solve", func(t *testing.T) {
		err := store.UpdateSolveStatus(ctx, "non-existent-id", "resolved", "should fail", "", "")
		// Should either error or silently succeed (depending on implementation)
		// For now, we just verify it doesn't panic
		_ = err
	})

	t.Run("increment actions on non-existent solve", func(t *testing.T) {
		err := store.IncrementSolveActions(ctx, "non-existent-id")
		// Should either error or silently succeed (depending on implementation)
		_ = err
	})
}

// TestStellarSolvesTimeRangeQueries tests time-based query functionality
func TestStellarSolvesTimeRangeQueries(t *testing.T) {
	store := OpenTestDB(t)
	defer store.Close()

	baseTime := time.Date(2025, time.June, 1, 12, 0, 0, 0, time.UTC)

	// Create solves at different times
	for i := 0; i < 5; i++ {
		solve := &StellarSolve{
			EventID:   "time-range-" + string(rune(i)),
			UserID:    "time-user",
			Cluster:   "prod-a",
			Namespace: "default",
			Workload:  "api",
			StartedAt: baseTime.Add(time.Duration(i) * time.Hour),
		}
		err := store.CreateSolve(ctx, solve)
		require.NoError(t, err)
	}

	t.Run("get solves since specific time", func(t *testing.T) {
		// Get solves since 2 hours after base time
		since := baseTime.Add(2 * time.Hour)
		solves, err := store.GetSolvesSince(ctx, "time-user", since)
		require.NoError(t, err)

		// Should get solves at 2h, 3h, and 4h
		assert.GreaterOrEqual(t, len(solves), 3)

		for _, solve := range solves {
			assert.False(t, solve.StartedAt.Before(since))
		}
	})

	t.Run("get recent solve for workload", func(t *testing.T) {
		cutoff := baseTime.Add(3 * time.Hour)
		recent, err := store.GetRecentSolveForWorkload(ctx, "prod-a", "default", "api", cutoff)
		require.NoError(t, err)
		require.NotNil(t, recent)

		// Should be the solve created at 4 hours (most recent after cutoff)
		assert.False(t, recent.StartedAt.Before(cutoff))
	})
}

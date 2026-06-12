package store

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/require"
)

func TestSQLiteDashboards_CreateAndGet(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	err := store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-123",
		GitHubLogin: "testuser",
		Role:        "viewer",
	})
	require.NoError(t, err)

	dashboardID := uuid.New()
	dashboard := &models.Dashboard{
		ID:        dashboardID,
		UserID:    userID,
		Name:      "Test Dashboard",
		Layout:    json.RawMessage(`{"cols": 3}`),
		IsDefault: false,
	}

	err = store.CreateDashboard(ctx, dashboard)
	require.NoError(t, err)

	retrieved, err := store.GetDashboard(ctx, dashboardID)
	require.NoError(t, err)
	require.NotNil(t, retrieved)
	require.Equal(t, "Test Dashboard", retrieved.Name)
	require.Equal(t, userID, retrieved.UserID)
}

func TestSQLiteDashboards_ListByUser(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	err := store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-456",
		GitHubLogin: "testuser2",
		Role:        "viewer",
	})
	require.NoError(t, err)

	dashboard1 := &models.Dashboard{
		ID:     uuid.New(),
		UserID: userID,
		Name:   "Dashboard 1",
	}
	dashboard2 := &models.Dashboard{
		ID:     uuid.New(),
		UserID: userID,
		Name:   "Dashboard 2",
	}

	require.NoError(t, store.CreateDashboard(ctx, dashboard1))
	require.NoError(t, store.CreateDashboard(ctx, dashboard2))

	dashboards, err := store.GetUserDashboards(ctx, userID, 0, 0)
	require.NoError(t, err)
	require.Len(t, dashboards, 2)

	names := make([]string, 0, 2)
	for _, d := range dashboards {
		names = append(names, d.Name)
	}
	require.Contains(t, names, "Dashboard 1")
	require.Contains(t, names, "Dashboard 2")
}

func TestSQLiteDashboards_Delete(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	err := store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-789",
		GitHubLogin: "testuser3",
		Role:        "viewer",
	})
	require.NoError(t, err)

	dashboardID := uuid.New()
	dashboard := &models.Dashboard{
		ID:     dashboardID,
		UserID: userID,
		Name:   "To Delete",
	}

	require.NoError(t, store.CreateDashboard(ctx, dashboard))

	retrieved, err := store.GetDashboard(ctx, dashboardID)
	require.NoError(t, err)
	require.NotNil(t, retrieved)

	err = store.DeleteDashboard(ctx, dashboardID)
	require.NoError(t, err)

	deleted, err := store.GetDashboard(ctx, dashboardID)
	require.NoError(t, err)
	require.Nil(t, deleted, "dashboard should be deleted")
}

func TestGetUserPendingSwaps(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	require.NoError(t, store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-swaps",
		GitHubLogin: "swapuser",
		Role:        "viewer",
	}))

	baseTime := time.Date(2025, time.June, 1, 12, 0, 0, 0, time.UTC)

	t.Run("returns pending swaps ordered by swap_at", func(t *testing.T) {
		cardID := uuid.New()
		swap1 := &models.PendingSwap{
			ID:            uuid.New(),
			UserID:        userID,
			CardID:        cardID,
			NewCardType:   "type-a",
			Reason:        "old swap",
			SwapAt:        baseTime.Add(2 * time.Hour),
			Status:        models.SwapStatusPending,
		}
		swap2 := &models.PendingSwap{
			ID:            uuid.New(),
			UserID:        userID,
			CardID:        cardID,
			NewCardType:   "type-b",
			Reason:        "newer swap",
			SwapAt:        baseTime.Add(1 * time.Hour),
			Status:        models.SwapStatusPending,
		}

		require.NoError(t, store.CreatePendingSwap(ctx, swap1))
		require.NoError(t, store.CreatePendingSwap(ctx, swap2))

		swaps, err := store.GetUserPendingSwaps(ctx, userID, 10, 0)
		require.NoError(t, err)
		require.Len(t, swaps, 2)
		require.Equal(t, swap2.ID, swaps[0].ID, "newer swap (earlier swap_at) should come first")
		require.Equal(t, swap1.ID, swaps[1].ID)
	})

	t.Run("respects limit and offset", func(t *testing.T) {
		otherUser := uuid.New()
		require.NoError(t, store.CreateUser(ctx, &models.User{
			ID:          otherUser,
			GitHubID:    "test-swaps-2",
			GitHubLogin: "swapuser2",
			Role:        "viewer",
		}))

		for i := 0; i < 5; i++ {
			swap := &models.PendingSwap{
				ID:          uuid.New(),
				UserID:      otherUser,
				CardID:      uuid.New(),
				NewCardType: "type",
				Reason:      fmt.Sprintf("swap-%d", i),
				SwapAt:      baseTime.Add(time.Duration(i) * time.Hour),
				Status:      models.SwapStatusPending,
			}
			require.NoError(t, store.CreatePendingSwap(ctx, swap))
		}

		page1, err := store.GetUserPendingSwaps(ctx, otherUser, 2, 0)
		require.NoError(t, err)
		require.Len(t, page1, 2)

		page2, err := store.GetUserPendingSwaps(ctx, otherUser, 2, 2)
		require.NoError(t, err)
		require.Len(t, page2, 2)

		require.NotEqual(t, page1[0].ID, page2[0].ID, "different pages should have different swaps")
	})

	t.Run("excludes non-pending swaps", func(t *testing.T) {
		completedUser := uuid.New()
		require.NoError(t, store.CreateUser(ctx, &models.User{
			ID:          completedUser,
			GitHubID:    "test-completed",
			GitHubLogin: "completeduser",
			Role:        "viewer",
		}))

		pendingSwap := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      completedUser,
			CardID:      uuid.New(),
			NewCardType: "type-a",
			Reason:      "pending",
			SwapAt:      baseTime,
			Status:      models.SwapStatusPending,
		}
		completedSwap := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      completedUser,
			CardID:      uuid.New(),
			NewCardType: "type-b",
			Reason:      "completed",
			SwapAt:      baseTime,
			Status:      models.SwapStatusCompleted,
		}

		require.NoError(t, store.CreatePendingSwap(ctx, pendingSwap))
		require.NoError(t, store.CreatePendingSwap(ctx, completedSwap))

		swaps, err := store.GetUserPendingSwaps(ctx, completedUser, 10, 0)
		require.NoError(t, err)
		require.Len(t, swaps, 1, "should only return pending swaps")
		require.Equal(t, pendingSwap.ID, swaps[0].ID)
	})
}

func TestGetDueSwaps(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	require.NoError(t, store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-due",
		GitHubLogin: "dueuser",
		Role:        "viewer",
	}))

	now := time.Now()

	t.Run("returns swaps where swap_at has arrived", func(t *testing.T) {
		dueSwap := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      userID,
			CardID:      uuid.New(),
			NewCardType: "type-a",
			Reason:      "due now",
			SwapAt:      now.Add(-10 * time.Minute),
			Status:      models.SwapStatusPending,
		}
		futureSwap := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      userID,
			CardID:      uuid.New(),
			NewCardType: "type-b",
			Reason:      "not due yet",
			SwapAt:      now.Add(10 * time.Minute),
			Status:      models.SwapStatusPending,
		}

		require.NoError(t, store.CreatePendingSwap(ctx, dueSwap))
		require.NoError(t, store.CreatePendingSwap(ctx, futureSwap))

		swaps, err := store.GetDueSwaps(ctx, 10, 0)
		require.NoError(t, err)
		require.NotEmpty(t, swaps, "should have at least the due swap")

		foundDue := false
		for _, swap := range swaps {
			if swap.ID == dueSwap.ID {
				foundDue = true
			}
			require.False(t, swap.ID == futureSwap.ID, "future swap should not be in results")
		}
		require.True(t, foundDue, "due swap should be in results")
	})

	t.Run("orders by swap_at ascending", func(t *testing.T) {
		older := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      userID,
			CardID:      uuid.New(),
			NewCardType: "type-a",
			Reason:      "older",
			SwapAt:      now.Add(-2 * time.Hour),
			Status:      models.SwapStatusPending,
		}
		newer := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      userID,
			CardID:      uuid.New(),
			NewCardType: "type-b",
			Reason:      "newer",
			SwapAt:      now.Add(-1 * time.Hour),
			Status:      models.SwapStatusPending,
		}

		require.NoError(t, store.CreatePendingSwap(ctx, older))
		require.NoError(t, store.CreatePendingSwap(ctx, newer))

		swaps, err := store.GetDueSwaps(ctx, 10, 0)
		require.NoError(t, err)
		require.NotEmpty(t, swaps)

		olderIndex := -1
		newerIndex := -1
		for i, swap := range swaps {
			if swap.ID == older.ID {
				olderIndex = i
			}
			if swap.ID == newer.ID {
				newerIndex = i
			}
		}

		if olderIndex >= 0 && newerIndex >= 0 {
			require.Less(t, olderIndex, newerIndex, "older swap should come before newer")
		}
	})

	t.Run("respects limit", func(t *testing.T) {
		user2 := uuid.New()
		require.NoError(t, store.CreateUser(ctx, &models.User{
			ID:          user2,
			GitHubID:    "test-limit",
			GitHubLogin: "limituser",
			Role:        "viewer",
		}))

		for i := 0; i < 5; i++ {
			swap := &models.PendingSwap{
				ID:          uuid.New(),
				UserID:      user2,
				CardID:      uuid.New(),
				NewCardType: "type",
				Reason:      fmt.Sprintf("swap-%d", i),
				SwapAt:      now.Add(-time.Duration(i+1) * time.Hour),
				Status:      models.SwapStatusPending,
			}
			require.NoError(t, store.CreatePendingSwap(ctx, swap))
		}

		swaps, err := store.GetDueSwaps(ctx, 2, 0)
		require.NoError(t, err)

		user2Count := 0
		for _, swap := range swaps {
			if swap.UserID == user2 {
				user2Count++
			}
		}
		require.LessOrEqual(t, user2Count, 2, "should respect limit")
	})
}

func TestSnoozeSwap(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	userID := uuid.New()
	require.NoError(t, store.CreateUser(ctx, &models.User{
		ID:          userID,
		GitHubID:    "test-snooze",
		GitHubLogin: "snoozeuser",
		Role:        "viewer",
	}))

	now := time.Now()

	t.Run("updates swap_at and sets status to snoozed", func(t *testing.T) {
		swap := &models.PendingSwap{
			ID:          uuid.New(),
			UserID:      userID,
			CardID:      uuid.New(),
			NewCardType: "type-a",
			Reason:      "original",
			SwapAt:      now.Add(-1 * time.Hour),
			Status:      models.SwapStatusPending,
		}
		require.NoError(t, store.CreatePendingSwap(ctx, swap))

		newSwapAt := now.Add(24 * time.Hour)
		err := store.SnoozeSwap(ctx, swap.ID, newSwapAt)
		require.NoError(t, err)

		updated, err := store.GetPendingSwap(ctx, swap.ID)
		require.NoError(t, err)
		require.NotNil(t, updated)
		require.Equal(t, models.SwapStatusSnoozed, updated.Status)
		require.WithinDuration(t, newSwapAt, updated.SwapAt, time.Second)
	})

	t.Run("no error on missing swap", func(t *testing.T) {
		err := store.SnoozeSwap(ctx, uuid.New(), now.Add(1*time.Hour))
		require.NoError(t, err, "snoozing missing swap should not error")
	})
}

package store

import (
	"context"
	"testing"

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
		GithubID:    "test-123",
		GithubLogin: "testuser",
		Role:        "viewer",
	})
	require.NoError(t, err)

	dashboardID := uuid.New()
	dashboard := &models.Dashboard{
		ID:        dashboardID,
		UserID:    userID,
		Name:      "Test Dashboard",
		Layout:    `{"cols": 3}`,
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
		GithubID:    "test-456",
		GithubLogin: "testuser2",
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

	dashboards, err := store.ListDashboards(ctx, userID)
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
		GithubID:    "test-789",
		GithubLogin: "testuser3",
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

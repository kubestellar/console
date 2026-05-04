package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

func TestGPUReservationCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-gpu", "gpuuser")

	t.Run("Create and GetGPUReservation round-trip", func(t *testing.T) {
		res := &models.GPUReservation{
			UserID:        user.ID,
			UserName:      user.GitHubLogin,
			Title:         "My Job",
			Cluster:       "cluster-1",
			Namespace:     "default",
			GPUCount:      2,
			GPUTypes:      []string{"nvidia-a100"},
			StartDate:     time.Now().Format(time.RFC3339),
			DurationHours: 24,
			Status:        models.ReservationStatusActive,
		}
		require.NoError(t, s.CreateGPUReservation(ctx, res))
		require.NotEqual(t, uuid.Nil, res.ID)

		got, err := s.GetGPUReservation(ctx, res.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "My Job", got.Title)
		require.Equal(t, []string{"nvidia-a100"}, got.GPUTypes)
	})

	t.Run("CreateGPUReservationWithCapacity enforces limit", func(t *testing.T) {
		res1 := &models.GPUReservation{
			UserID:    user.ID,
			UserName:  user.GitHubLogin,
			Title:     "Job 1",
			Cluster:   "cap-cluster",
			Namespace: "default",
			GPUCount:  4,
			Status:    models.ReservationStatusActive,
		}
		require.NoError(t, s.CreateGPUReservationWithCapacity(ctx, res1, 10))

		res2 := &models.GPUReservation{
			UserID:    user.ID,
			UserName:  user.GitHubLogin,
			Title:     "Job 2",
			Cluster:   "cap-cluster",
			Namespace: "default",
			GPUCount:  7, // 4+7 > 10
			Status:    models.ReservationStatusActive,
		}
		err := s.CreateGPUReservationWithCapacity(ctx, res2, 10)
		require.ErrorIs(t, err, ErrGPUQuotaExceeded)
	})

	t.Run("UpdateGPUReservationWithCapacity enforces limit", func(t *testing.T) {
		res := &models.GPUReservation{
			UserID:    user.ID,
			UserName:  user.GitHubLogin,
			Title:     "Resize Job",
			Cluster:   "upd-cluster",
			Namespace: "default",
			GPUCount:  2,
			Status:    models.ReservationStatusActive,
		}
		require.NoError(t, s.CreateGPUReservationWithCapacity(ctx, res, 10))

		res.GPUCount = 11
		err := s.UpdateGPUReservationWithCapacity(ctx, res, 10)
		require.ErrorIs(t, err, ErrGPUQuotaExceeded)
	})

	t.Run("ListUserGPUReservations returns user's reservations", func(t *testing.T) {
		u2 := createTestUser(t, s, "gh-gpu-2", "gpuuser2")
		require.NoError(t, s.CreateGPUReservation(ctx, &models.GPUReservation{
			UserID:   u2.ID,
			UserName: u2.GitHubLogin,
			Title:    "U2 Job",
			Cluster:  "c1",
			GPUCount: 1,
		}))

		list, err := s.ListUserGPUReservations(ctx, u2.ID)
		require.NoError(t, err)
		require.Len(t, list, 1)
		require.Equal(t, "U2 Job", list[0].Title)
	})
}

func TestGPUUtilizationSnapshots(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-gpu-snap", "snapuser")
	res := &models.GPUReservation{
		UserID:   user.ID,
		UserName: user.GitHubLogin,
		Title:    "Snap Job",
		Cluster:  "snap-cluster",
		GPUCount: 1,
	}
	require.NoError(t, s.CreateGPUReservation(ctx, res))
	resID := res.ID.String()

	t.Run("Insert and GetUtilizationSnapshots round-trip", func(t *testing.T) {
		snap := &models.GPUUtilizationSnapshot{
			ReservationID:        resID,
			Timestamp:            time.Now(),
			GPUUtilizationPct:    85.5,
			MemoryUtilizationPct: 40.0,
			ActiveGPUCount:       1,
			TotalGPUCount:        1,
		}
		require.NoError(t, s.InsertUtilizationSnapshot(ctx, snap))

		snaps, err := s.GetUtilizationSnapshots(ctx, resID, 10)
		require.NoError(t, err)
		require.Len(t, snaps, 1)
		require.InDelta(t, 85.5, snaps[0].GPUUtilizationPct, 0.01)
	})

	t.Run("GetBulkUtilizationSnapshots returns snapshots for multiple reservations", func(t *testing.T) {
		// Create two fresh reservations so this subtest is self-contained
		resA := &models.GPUReservation{
			UserID:   user.ID,
			UserName: user.GitHubLogin,
			Title:    "Bulk Snap Job A",
			Cluster:  "snap-cluster",
			GPUCount: 1,
		}
		require.NoError(t, s.CreateGPUReservation(ctx, resA))
		resAID := resA.ID.String()

		resB := &models.GPUReservation{
			UserID:   user.ID,
			UserName: user.GitHubLogin,
			Title:    "Bulk Snap Job B",
			Cluster:  "snap-cluster",
			GPUCount: 1,
		}
		require.NoError(t, s.CreateGPUReservation(ctx, resB))
		resBID := resB.ID.String()

		require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resAID, GPUUtilizationPct: 10}))
		require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resAID, GPUUtilizationPct: 15}))
		require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resBID, GPUUtilizationPct: 20}))

		bulk, err := s.GetBulkUtilizationSnapshots(ctx, []string{resAID, resBID})
		require.NoError(t, err)
		require.Len(t, bulk[resAID], 2)
		require.Len(t, bulk[resBID], 1)
	})
}

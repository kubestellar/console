package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// mkReservation is a small helper that builds a minimal GPUReservation for
// the untested list/update/delete/batch code paths in sqlite_gpu.go.
func mkReservation(user *models.User, title, cluster string, status models.ReservationStatus, count int) *models.GPUReservation {
	return &models.GPUReservation{
		UserID:    user.ID,
		UserName:  user.GitHubLogin,
		Title:     title,
		Cluster:   cluster,
		Namespace: "default",
		GPUCount:  count,
		GPUTypes:  []string{"nvidia-a100"},
		Status:    status,
	}
}

// TestListGPUReservations_ReturnsAllReservations exercises the previously
// 0%-covered ListGPUReservations query and confirms it round-trips through
// scanGPUReservationRow and honors the outer LIMIT cap (well below 5000).
func TestListGPUReservations_ReturnsAllReservations(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-list-all", "listalluser")

	require.NoError(t, s.CreateGPUReservation(ctx, mkReservation(user, "A", "c1", models.ReservationStatusActive, 1)))
	require.NoError(t, s.CreateGPUReservation(ctx, mkReservation(user, "B", "c2", models.ReservationStatusCompleted, 2)))

	list, err := s.ListGPUReservations(ctx)
	require.NoError(t, err)
	require.Len(t, list, 2, "expected both active and completed reservations")

	// Round-trip preserves gpu_types (JSON column).
	for _, r := range list {
		require.Equal(t, []string{"nvidia-a100"}, r.GPUTypes)
	}
}

// TestListGPUReservations_EmptyTable verifies the not-empty-slice contract:
// a fresh store returns a non-nil empty slice, not nil.
func TestListGPUReservations_EmptyTable(t *testing.T) {
	s := newTestStore(t)
	list, err := s.ListGPUReservations(ctx)
	require.NoError(t, err)
	require.NotNil(t, list)
	require.Len(t, list, 0)
}

// TestListActiveGPUReservations_FiltersByStatus exercises the previously
// 0%-covered ListActiveGPUReservations query. Only status='active' rows
// are returned; the WHERE clause must exclude expired/cancelled rows.
func TestListActiveGPUReservations_FiltersByStatus(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-list-active", "activelist")

	require.NoError(t, s.CreateGPUReservation(ctx, mkReservation(user, "Active1", "c1", models.ReservationStatusActive, 1)))
	require.NoError(t, s.CreateGPUReservation(ctx, mkReservation(user, "Active2", "c2", models.ReservationStatusActive, 1)))
	require.NoError(t, s.CreateGPUReservation(ctx, mkReservation(user, "Expired", "c1", models.ReservationStatusCompleted, 1)))

	list, err := s.ListActiveGPUReservations(ctx)
	require.NoError(t, err)
	require.Len(t, list, 2)
	for _, r := range list {
		require.Equal(t, models.ReservationStatusActive, r.Status)
	}
}

// TestUpdateGPUReservation_PersistsFieldChanges exercises the previously
// 0%-covered UpdateGPUReservation path — a plain UPDATE that runs when no
// capacity check is requested. Verifies that mutable fields (Title, GPUCount,
// GPUTypes, Status) are persisted and UpdatedAt is populated.
func TestUpdateGPUReservation_PersistsFieldChanges(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-update", "updateuser")

	res := mkReservation(user, "Original", "c1", models.ReservationStatusActive, 1)
	require.NoError(t, s.CreateGPUReservation(ctx, res))

	res.Title = "Renamed"
	res.GPUCount = 4
	res.GPUTypes = []string{"nvidia-h100", "nvidia-a100"}
	res.Status = models.ReservationStatusCompleted
	require.NoError(t, s.UpdateGPUReservation(ctx, res))
	require.NotNil(t, res.UpdatedAt)

	got, err := s.GetGPUReservation(ctx, res.ID)
	require.NoError(t, err)
	require.Equal(t, "Renamed", got.Title)
	require.Equal(t, 4, got.GPUCount)
	require.Equal(t, []string{"nvidia-h100", "nvidia-a100"}, got.GPUTypes)
	require.Equal(t, models.ReservationStatusCompleted, got.Status)
}

// TestDeleteGPUReservation_RemovesRow exercises the previously 0%-covered
// DeleteGPUReservation. A subsequent Get returns nil (row not found).
func TestDeleteGPUReservation_RemovesRow(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-delete", "delete-user")

	res := mkReservation(user, "ToDelete", "c1", models.ReservationStatusActive, 1)
	require.NoError(t, s.CreateGPUReservation(ctx, res))

	require.NoError(t, s.DeleteGPUReservation(ctx, res.ID))

	got, err := s.GetGPUReservation(ctx, res.ID)
	require.NoError(t, err)
	require.Nil(t, got, "expected Get after Delete to return nil")

	// Deleting a nonexistent id is a no-op, not an error, per the raw
	// DELETE semantics. Guard the current contract.
	require.NoError(t, s.DeleteGPUReservation(ctx, uuid.New()))
}

// TestGetGPUReservationsByIDs_EmptyIDs verifies the fast-path branch that
// returns an empty map for an empty ID slice without hitting the database.
func TestGetGPUReservationsByIDs_EmptyIDs(t *testing.T) {
	s := newTestStore(t)
	got, err := s.GetGPUReservationsByIDs(ctx, nil)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Len(t, got, 0)
}

// TestGetGPUReservationsByIDs_BatchLookup exercises the previously
// 0%-covered batched IN(...) query. Requesting a mix of existing and
// unknown IDs returns only the found ones, keyed by UUID.
func TestGetGPUReservationsByIDs_BatchLookup(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-batch", "batchuser")

	a := mkReservation(user, "Batch A", "c1", models.ReservationStatusActive, 1)
	b := mkReservation(user, "Batch B", "c1", models.ReservationStatusActive, 2)
	require.NoError(t, s.CreateGPUReservation(ctx, a))
	require.NoError(t, s.CreateGPUReservation(ctx, b))
	missing := uuid.New()

	got, err := s.GetGPUReservationsByIDs(ctx, []uuid.UUID{a.ID, missing, b.ID})
	require.NoError(t, err)
	require.Len(t, got, 2, "unknown id must not appear in result map")
	require.NotNil(t, got[a.ID])
	require.NotNil(t, got[b.ID])
	require.Equal(t, "Batch A", got[a.ID].Title)
	require.Equal(t, "Batch B", got[b.ID].Title)
	require.Nil(t, got[missing])
}

// TestDeleteOldUtilizationSnapshots_DeletesOnlyOlder exercises the
// previously 0%-covered DeleteOldUtilizationSnapshots. Only snapshots
// whose timestamp is strictly before the cutoff are removed; the returned
// count matches RowsAffected.
func TestDeleteOldUtilizationSnapshots_DeletesOnlyOlder(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-snap-delete", "snapdel")

	res := mkReservation(user, "Snap parent", "c1", models.ReservationStatusActive, 1)
	require.NoError(t, s.CreateGPUReservation(ctx, res))
	resID := res.ID.String()

	old := time.Now().Add(-2 * time.Hour)
	recent := time.Now()
	require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resID, Timestamp: old, GPUUtilizationPct: 10}))
	require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resID, Timestamp: old, GPUUtilizationPct: 20}))
	require.NoError(t, s.InsertUtilizationSnapshot(ctx, &models.GPUUtilizationSnapshot{ReservationID: resID, Timestamp: recent, GPUUtilizationPct: 30}))

	cutoff := time.Now().Add(-1 * time.Hour)
	n, err := s.DeleteOldUtilizationSnapshots(ctx, cutoff)
	require.NoError(t, err)
	require.Equal(t, int64(2), n)

	remaining, err := s.GetUtilizationSnapshots(ctx, resID, 10)
	require.NoError(t, err)
	require.Len(t, remaining, 1)
	require.InDelta(t, 30.0, remaining[0].GPUUtilizationPct, 0.01)
}

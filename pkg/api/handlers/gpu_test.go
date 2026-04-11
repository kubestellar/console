package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type gpuTestStore struct {
	test.MockStore
	user               *models.User
	userErr            error
	clusterReserved    int
	clusterReservedErr error
	createErr          error
	created            *models.GPUReservation
	listAll            []models.GPUReservation
	listMine           []models.GPUReservation
	listErr            error
	reservations       map[uuid.UUID]*models.GPUReservation
	updateErr          error
	updated            *models.GPUReservation
	bulkSnapshots      map[string][]models.GPUUtilizationSnapshot
	bulkSnapshotsErr   error
}

func (s *gpuTestStore) GetUser(id uuid.UUID) (*models.User, error) {
	if s.userErr != nil {
		return nil, s.userErr
	}
	return s.user, nil
}

func (s *gpuTestStore) GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error) {
	if s.clusterReservedErr != nil {
		return 0, s.clusterReservedErr
	}
	return s.clusterReserved, nil
}

func (s *gpuTestStore) CreateGPUReservation(reservation *models.GPUReservation) error {
	if s.createErr != nil {
		return s.createErr
	}
	copy := *reservation
	if copy.ID == uuid.Nil {
		copy.ID = uuid.New()
	}
	s.created = &copy
	*reservation = copy
	return nil
}

// CreateGPUReservationWithCapacity is the atomic variant added for #6612.
// The test store reuses CreateGPUReservation for the happy path and uses
// clusterReserved+capacity to mirror the store-level quota check so the
// TOCTOU test exercises the same decision the real store would make.
func (s *gpuTestStore) CreateGPUReservationWithCapacity(reservation *models.GPUReservation, capacity int) error {
	if s.createErr != nil {
		return s.createErr
	}
	if capacity > 0 && s.clusterReserved+reservation.GPUCount > capacity {
		return store.ErrGPUQuotaExceeded
	}
	return s.CreateGPUReservation(reservation)
}

func (s *gpuTestStore) ListGPUReservations() ([]models.GPUReservation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.listAll, nil
}

func (s *gpuTestStore) ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.listMine, nil
}

func (s *gpuTestStore) GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error) {
	if s.reservations != nil {
		r, ok := s.reservations[id]
		if !ok {
			return nil, nil
		}
		return r, nil
	}
	return nil, nil
}

func (s *gpuTestStore) UpdateGPUReservation(reservation *models.GPUReservation) error {
	if s.updateErr != nil {
		return s.updateErr
	}
	copy := *reservation
	s.updated = &copy
	return nil
}

func (s *gpuTestStore) GetBulkUtilizationSnapshots(ids []string) (map[string][]models.GPUUtilizationSnapshot, error) {
	if s.bulkSnapshotsErr != nil {
		return nil, s.bulkSnapshotsErr
	}
	return s.bulkSnapshots, nil
}

// stubCapacity returns a ClusterCapacityProvider that always returns the given value.
func stubCapacity(gpus int) ClusterCapacityProvider {
	return func(_ context.Context, _ string) int { return gpus }
}

func TestGPUCreateReservation_OverAllocationReturnsConflict(t *testing.T) {
	env := setupTestEnv(t)
	// Server-side capacity says cluster has 4 GPUs; 3 are already reserved.
	// Requesting 3 more should exceed capacity (3 + 3 > 4).
	const clusterCapacity = 4
	store := &gpuTestStore{
		user:            &models.User{ID: testAdminUserID, GitHubLogin: "alice"},
		clusterReserved: 3,
	}
	handler := NewGPUHandler(store, stubCapacity(clusterCapacity))
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":      "Train model",
		"cluster":    "cluster-a",
		"namespace":  "ml",
		"gpu_count":  3,
		"start_date": "2026-03-16T00:00:00Z",
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/gpu/reservations", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestGPUCreateReservation_SetsDefaultDurationAndUserName(t *testing.T) {
	env := setupTestEnv(t)
	// 8 GPU capacity, 0 reserved — should succeed
	const clusterCapacity = 8
	store := &gpuTestStore{
		user:            &models.User{ID: testAdminUserID, GitHubLogin: "alice"},
		clusterReserved: 0,
	}
	handler := NewGPUHandler(store, stubCapacity(clusterCapacity))
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":      "Inference batch",
		"cluster":    "cluster-a",
		"namespace":  "ml",
		"gpu_count":  1,
		"start_date": "2026-03-16T00:00:00Z",
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/gpu/reservations", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	require.NotNil(t, store.created)
	assert.Equal(t, "alice", store.created.UserName)
	assert.Equal(t, 24, store.created.DurationHours)
	assert.Equal(t, 1, store.created.GPUCount)
}

func TestGPUListReservations_MineNilReturnsEmptyArray(t *testing.T) {
	env := setupTestEnv(t)
	store := &gpuTestStore{
		user:     &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		listMine: nil,
	}
	handler := NewGPUHandler(store, nil)
	env.App.Get("/api/gpu/reservations", handler.ListReservations)

	req, err := http.NewRequest(http.MethodGet, "/api/gpu/reservations?mine=true", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var reservations []models.GPUReservation
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&reservations))
	assert.Len(t, reservations, 0)
}

func TestGPUUpdateReservation_RejectsZeroGPUCount(t *testing.T) {
	env := setupTestEnv(t)
	resID := uuid.New()
	store := &gpuTestStore{
		user: &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		reservations: map[uuid.UUID]*models.GPUReservation{
			resID: {ID: resID, UserID: testAdminUserID, GPUCount: 2, DurationHours: 24, Cluster: "c1"},
		},
	}
	handler := NewGPUHandler(store, nil)
	env.App.Put("/api/gpu/reservations/:id", handler.UpdateReservation)

	zero := 0
	body, err := json.Marshal(map[string]any{"gpu_count": zero})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/gpu/reservations/"+resID.String(), bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Nil(t, store.updated, "store should not have been updated")
}

func TestGPUUpdateReservation_RejectsNegativeGPUCount(t *testing.T) {
	env := setupTestEnv(t)
	resID := uuid.New()
	store := &gpuTestStore{
		user: &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		reservations: map[uuid.UUID]*models.GPUReservation{
			resID: {ID: resID, UserID: testAdminUserID, GPUCount: 2, DurationHours: 24, Cluster: "c1"},
		},
	}
	handler := NewGPUHandler(store, nil)
	env.App.Put("/api/gpu/reservations/:id", handler.UpdateReservation)

	body, err := json.Marshal(map[string]any{"gpu_count": -1})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/gpu/reservations/"+resID.String(), bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGPUUpdateReservation_RejectsNegativeDuration(t *testing.T) {
	env := setupTestEnv(t)
	resID := uuid.New()
	store := &gpuTestStore{
		user: &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		reservations: map[uuid.UUID]*models.GPUReservation{
			resID: {ID: resID, UserID: testAdminUserID, GPUCount: 2, DurationHours: 24, Cluster: "c1"},
		},
	}
	handler := NewGPUHandler(store, nil)
	env.App.Put("/api/gpu/reservations/:id", handler.UpdateReservation)

	body, err := json.Marshal(map[string]any{"duration_hours": -5})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/gpu/reservations/"+resID.String(), bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGPUUpdateReservation_RejectsZeroDuration(t *testing.T) {
	env := setupTestEnv(t)
	resID := uuid.New()
	store := &gpuTestStore{
		user: &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		reservations: map[uuid.UUID]*models.GPUReservation{
			resID: {ID: resID, UserID: testAdminUserID, GPUCount: 2, DurationHours: 24, Cluster: "c1"},
		},
	}
	handler := NewGPUHandler(store, nil)
	env.App.Put("/api/gpu/reservations/:id", handler.UpdateReservation)

	body, err := json.Marshal(map[string]any{"duration_hours": 0})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/gpu/reservations/"+resID.String(), bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGPUBulkUtilizations_ForbiddenForNonOwner(t *testing.T) {
	env := setupTestEnv(t)
	otherUserID := uuid.New()
	resID := uuid.New()
	store := &gpuTestStore{
		user: &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleViewer},
		reservations: map[uuid.UUID]*models.GPUReservation{
			resID: {ID: resID, UserID: otherUserID, GPUCount: 1, Cluster: "c1"},
		},
	}
	handler := NewGPUHandler(store, nil)
	env.App.Get("/api/gpu/utilizations", handler.GetBulkUtilizations)

	req, err := http.NewRequest(http.MethodGet, "/api/gpu/utilizations?ids="+resID.String(), nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

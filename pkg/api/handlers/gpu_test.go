package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
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

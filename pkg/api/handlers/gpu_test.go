package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
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

type gpuProvisioningTestClient struct {
	createNamespaceCluster string
	createNamespaceName    string
	createNamespaceLabels  map[string]string
	createNamespaceErr     error
	quotaCluster           string
	quotaSpec              *k8s.ResourceQuotaSpec
	quotaErr               error
	deleteQuotaCluster     string
	deleteQuotaNamespace   string
	deleteQuotaName        string
	deleteQuotaCalls       int
}

func (c *gpuProvisioningTestClient) CreateNamespace(_ context.Context, contextName, name string, labels map[string]string) (*models.NamespaceDetails, error) {
	c.createNamespaceCluster = contextName
	c.createNamespaceName = name
	c.createNamespaceLabels = labels
	if c.createNamespaceErr != nil {
		return nil, c.createNamespaceErr
	}
	return &models.NamespaceDetails{Name: name, Labels: labels}, nil
}

func (c *gpuProvisioningTestClient) CreateOrUpdateResourceQuota(_ context.Context, contextName string, spec k8s.ResourceQuotaSpec) (*k8s.ResourceQuota, error) {
	c.quotaCluster = contextName
	copy := spec
	c.quotaSpec = &copy
	if c.quotaErr != nil {
		return nil, c.quotaErr
	}
	return &k8s.ResourceQuota{Name: spec.Name, Namespace: spec.Namespace}, nil
}

func (c *gpuProvisioningTestClient) DeleteResourceQuota(_ context.Context, contextName, namespace, name string) error {
	c.deleteQuotaCluster = contextName
	c.deleteQuotaNamespace = namespace
	c.deleteQuotaName = name
	c.deleteQuotaCalls++
	return nil
}

func (s *gpuTestStore) GetUser(_ context.Context, id uuid.UUID) (*models.User, error) {
	if s.userErr != nil {
		return nil, s.userErr
	}
	return s.user, nil
}

func (s *gpuTestStore) GetClusterReservedGPUCount(_ context.Context, cluster string, excludeID *uuid.UUID) (int, error) {
	if s.clusterReservedErr != nil {
		return 0, s.clusterReservedErr
	}
	return s.clusterReserved, nil
}

func (s *gpuTestStore) CreateGPUReservation(_ context.Context, reservation *models.GPUReservation) error {
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
func (s *gpuTestStore) CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	if s.createErr != nil {
		return s.createErr
	}
	if capacity > 0 && s.clusterReserved+reservation.GPUCount > capacity {
		return store.ErrGPUQuotaExceeded
	}
	return s.CreateGPUReservation(ctx, reservation)
}

func (s *gpuTestStore) ListGPUReservations(_ context.Context) ([]models.GPUReservation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.listAll, nil
}

func (s *gpuTestStore) ListUserGPUReservations(_ context.Context, userID uuid.UUID) ([]models.GPUReservation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.listMine, nil
}

func (s *gpuTestStore) GetGPUReservation(_ context.Context, id uuid.UUID) (*models.GPUReservation, error) {
	if s.reservations != nil {
		r, ok := s.reservations[id]
		if !ok {
			return nil, nil
		}
		return r, nil
	}
	return nil, nil
}

func (s *gpuTestStore) UpdateGPUReservation(_ context.Context, reservation *models.GPUReservation) error {
	if s.updateErr != nil {
		return s.updateErr
	}
	copy := *reservation
	s.updated = &copy
	return nil
}

// UpdateGPUReservationWithCapacity mirrors the atomic update with capacity
// check for tests (#6957).
func (s *gpuTestStore) UpdateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	if s.updateErr != nil {
		return s.updateErr
	}
	if capacity > 0 && s.clusterReserved+reservation.GPUCount > capacity {
		return store.ErrGPUQuotaExceeded
	}
	return s.UpdateGPUReservation(ctx, reservation)
}

// GetGPUReservationsByIDs returns reservations from the test store's
// reservations map in a single call (#6963).
func (s *gpuTestStore) GetGPUReservationsByIDs(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error) {
	result := make(map[uuid.UUID]*models.GPUReservation, len(ids))
	for _, id := range ids {
		if r, ok := s.reservations[id]; ok {
			result[id] = r
		}
	}
	return result, nil
}

func (s *gpuTestStore) GetBulkUtilizationSnapshots(_ context.Context, ids []string) (map[string][]models.GPUUtilizationSnapshot, error) {
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
	handler := NewGPUHandler(store, stubCapacity(clusterCapacity), nil)
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":          "Train model",
		"cluster":        "cluster-a",
		"namespace":      "ml",
		"gpu_count":      3,
		"start_date":     "2026-03-16T00:00:00Z",
		"duration_hours": 8,
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
	handler := NewGPUHandler(store, stubCapacity(clusterCapacity), nil)
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":          "Inference batch",
		"cluster":        "cluster-a",
		"namespace":      "ml",
		"gpu_count":      1,
		"start_date":     "2026-03-16T00:00:00Z",
		"duration_hours": 24,
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

func TestGPUCreateReservation_ProvisioningSuccessReturnsActiveReservation(t *testing.T) {
	env := setupTestEnv(t)
	store := &gpuTestStore{
		user:            &models.User{ID: testAdminUserID, GitHubLogin: "alice"},
		clusterReserved: 0,
	}
	k8sClient := &gpuProvisioningTestClient{}
	handler := NewGPUHandler(store, stubCapacity(8), k8sClient)
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":          "Provision now",
		"cluster":        "cluster-a",
		"namespace":      "ml-sync",
		"gpu_count":      2,
		"start_date":     "2026-03-16T00:00:00Z",
		"duration_hours": 12,
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/gpu/reservations", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var reservation models.GPUReservation
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&reservation))
	assert.Equal(t, models.ReservationStatusActive, reservation.Status)
	assert.Equal(t, "ml-sync", reservation.Namespace)
	assert.Equal(t, "gpu-reservation-ml-sync", reservation.QuotaName)
	assert.True(t, reservation.QuotaEnforced)

	require.NotNil(t, store.created)
	assert.Equal(t, models.ReservationStatusActive, store.created.Status)
	assert.Equal(t, reservation.Namespace, store.created.Namespace)
	assert.Equal(t, reservation.QuotaName, store.created.QuotaName)
	assert.True(t, store.created.QuotaEnforced)

	require.NotNil(t, k8sClient.quotaSpec)
	assert.Equal(t, "cluster-a", k8sClient.createNamespaceCluster)
	assert.Equal(t, "ml-sync", k8sClient.createNamespaceName)
	assert.Equal(t, "cluster-a", k8sClient.quotaCluster)
	assert.Equal(t, "gpu-reservation-ml-sync", k8sClient.quotaSpec.Name)
	assert.Equal(t, "ml-sync", k8sClient.quotaSpec.Namespace)
	assert.Equal(t, "2", k8sClient.quotaSpec.Hard["nvidia.com/gpu"])
	assert.Equal(t, "true", k8sClient.createNamespaceLabels[reservationNSLabel])
	assert.Equal(t, "kubestellar-console", k8sClient.createNamespaceLabels["app.kubernetes.io/managed-by"])
}

func TestGPUCreateReservation_ProvisioningCleanupOnStoreFailure(t *testing.T) {
	env := setupTestEnv(t)
	store := &gpuTestStore{
		user:            &models.User{ID: testAdminUserID, GitHubLogin: "alice"},
		clusterReserved: 0,
		createErr:       errors.New("db write failed"),
	}
	k8sClient := &gpuProvisioningTestClient{}
	handler := NewGPUHandler(store, stubCapacity(8), k8sClient)
	env.App.Post("/api/gpu/reservations", handler.CreateReservation)

	body, err := json.Marshal(map[string]any{
		"title":          "Provision now",
		"cluster":        "cluster-a",
		"namespace":      "ml-cleanup",
		"gpu_count":      2,
		"start_date":     "2026-03-16T00:00:00Z",
		"duration_hours": 12,
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/gpu/reservations", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Nil(t, store.created)
	assert.Equal(t, 1, k8sClient.deleteQuotaCalls)
	assert.Equal(t, "cluster-a", k8sClient.deleteQuotaCluster)
	assert.Equal(t, "ml-cleanup", k8sClient.deleteQuotaNamespace)
	assert.Equal(t, "gpu-reservation-ml-cleanup", k8sClient.deleteQuotaName)
}

func TestGPUListReservations_MineNilReturnsEmptyArray(t *testing.T) {
	env := setupTestEnv(t)
	store := &gpuTestStore{
		user:     &models.User{ID: testAdminUserID, GitHubLogin: "alice", Role: models.UserRoleAdmin},
		listMine: nil,
	}
	handler := NewGPUHandler(store, nil, nil)
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
	handler := NewGPUHandler(store, nil, nil)
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
	handler := NewGPUHandler(store, nil, nil)
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
	handler := NewGPUHandler(store, nil, nil)
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
	handler := NewGPUHandler(store, nil, nil)
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
	handler := NewGPUHandler(store, nil, nil)
	env.App.Get("/api/gpu/utilizations", handler.GetBulkUtilizations)

	req, err := http.NewRequest(http.MethodGet, "/api/gpu/utilizations?ids="+resID.String(), nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

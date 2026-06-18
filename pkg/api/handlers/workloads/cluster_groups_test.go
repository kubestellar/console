package workloads

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/test"
)

// TestCreateClusterGroup_ValidationErrors exercises the validation branches
// in CreateClusterGroup that return 400 status codes.
func TestCreateClusterGroup_ValidationErrors(t *testing.T) {
	tests := []struct {
		name    string
		payload interface{}
		errMsg  string
	}{
		{
			name:    "empty name",
			payload: map[string]interface{}{"name": "", "kind": "static", "clusters": []string{"c1"}},
			errMsg:  "name is required",
		},
		{
			name:    "reserved name",
			payload: map[string]interface{}{"name": "all-healthy-clusters", "kind": "static", "clusters": []string{"c1"}},
			errMsg:  "cannot create a group with the reserved name",
		},
		{
			name:    "static group without clusters",
			payload: map[string]interface{}{"name": "empty-group", "kind": "static", "clusters": []string{}},
			errMsg:  "at least one cluster is required",
		},
		{
			name:    "invalid JSON body",
			payload: "not-json{{{",
			errMsg:  "invalid request",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			env := setupTestEnv(t)
			handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
			env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)

			var body []byte
			switch v := tc.payload.(type) {
			case string:
				body = []byte(v)
			default:
				body, _ = json.Marshal(v)
			}

			req, err := http.NewRequest("POST", "/api/cluster-groups", bytes.NewReader(body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, 400, resp.StatusCode)

			var result map[string]interface{}
			respBody, _ := io.ReadAll(resp.Body)
			json.Unmarshal(respBody, &result)
			assert.Contains(t, result["error"], tc.errMsg)
		})
	}
}

// TestCreateClusterGroup_DynamicGroupNoCluster verifies that dynamic groups
// can be created without specifying clusters (they are evaluated on demand).
func TestCreateClusterGroup_DynamicGroupNoCluster(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)

	payload := map[string]interface{}{
		"name": "dynamic-group",
		"kind": "dynamic",
		"query": map[string]interface{}{
			"filters": []map[string]interface{}{
				{"field": "healthy", "operator": "eq", "value": "true"},
			},
		},
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "/api/cluster-groups", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 201, resp.StatusCode)

	var result ClusterGroup
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Equal(t, "dynamic-group", result.Name)
	assert.Equal(t, "dynamic", result.Kind)
}

// TestUpdateClusterGroup_BuiltInProtection verifies that the built-in
// "all-healthy-clusters" group cannot be modified.
func TestUpdateClusterGroup_BuiltInProtection(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", handler.UpdateClusterGroup)

	payload := map[string]interface{}{
		"name": "all-healthy-clusters",
		"kind": "static",
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("PUT", "/api/cluster-groups/all-healthy-clusters", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Contains(t, result["error"], "cannot modify a built-in group")
}

// TestUpdateClusterGroup_InvalidBody verifies that malformed request bodies
// are rejected with 400.
func TestUpdateClusterGroup_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", handler.UpdateClusterGroup)

	req, err := http.NewRequest("PUT", "/api/cluster-groups/my-group", bytes.NewReader([]byte("invalid{json")))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

// TestDeleteClusterGroup_BuiltInProtection verifies that the built-in group
// cannot be deleted.
func TestDeleteClusterGroup_BuiltInProtection(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", handler.DeleteClusterGroup)

	req, err := http.NewRequest("DELETE", "/api/cluster-groups/all-healthy-clusters", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Contains(t, result["error"], "cannot delete a built-in group")
}

// TestDeleteClusterGroup_NonExistent verifies that deleting a group that
// doesn't exist still returns success (idempotent delete).
func TestDeleteClusterGroup_NonExistent(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", handler.DeleteClusterGroup)

	req, err := http.NewRequest("DELETE", "/api/cluster-groups/does-not-exist", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Equal(t, "Cluster group deleted", result["message"])
}

// TestSyncClusterGroups_Success verifies the bulk sync endpoint replaces
// all existing cluster groups with the provided set.
func TestSyncClusterGroups_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", handler.SyncClusterGroups)

	// Pre-populate a group that should be replaced
	clusterGroupsMu.Lock()
	clusterGroups["old-group"] = ClusterGroup{Name: "old-group", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	syncPayload := []ClusterGroup{
		{Name: "new-group-1", Kind: "static", Clusters: []string{"c1", "c2"}},
		{Name: "new-group-2", Kind: "dynamic"},
	}
	data, _ := json.Marshal(syncPayload)
	req, err := http.NewRequest("POST", "/api/cluster-groups/sync", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	// Two groups synced (reserved name filtered out)
	assert.Equal(t, float64(2), result["synced"])

	// Verify old group was removed
	clusterGroupsMu.RLock()
	_, oldExists := clusterGroups["old-group"]
	_, new1Exists := clusterGroups["new-group-1"]
	_, new2Exists := clusterGroups["new-group-2"]
	clusterGroupsMu.RUnlock()
	assert.False(t, oldExists)
	assert.True(t, new1Exists)
	assert.True(t, new2Exists)

	// Cleanup
	clusterGroupsMu.Lock()
	delete(clusterGroups, "new-group-1")
	delete(clusterGroups, "new-group-2")
	clusterGroupsMu.Unlock()
}

// TestSyncClusterGroups_ReservedNameFiltered verifies that the reserved
// "all-healthy-clusters" name is filtered out during sync.
func TestSyncClusterGroups_ReservedNameFiltered(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", handler.SyncClusterGroups)

	syncPayload := []ClusterGroup{
		{Name: "all-healthy-clusters", Kind: "dynamic"},
		{Name: "valid-group", Kind: "static", Clusters: []string{"c1"}},
	}
	data, _ := json.Marshal(syncPayload)
	req, err := http.NewRequest("POST", "/api/cluster-groups/sync", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	// Only "valid-group" should be stored (reserved name skipped)
	assert.Equal(t, float64(1), result["synced"])

	// Cleanup
	clusterGroupsMu.Lock()
	delete(clusterGroups, "valid-group")
	clusterGroupsMu.Unlock()
}

// TestSyncClusterGroups_InvalidBody verifies that malformed JSON is rejected.
func TestSyncClusterGroups_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", handler.SyncClusterGroups)

	req, err := http.NewRequest("POST", "/api/cluster-groups/sync", bytes.NewReader([]byte("not-json")))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

// TestSyncClusterGroups_OversizedPayload verifies the 1MB payload limit.
func TestSyncClusterGroups_OversizedPayload(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", handler.SyncClusterGroups)

	// Create a payload > 1MB
	bigPayload := make([]byte, (1<<20)+1)
	for i := range bigPayload {
		bigPayload[i] = 'a'
	}
	req, err := http.NewRequest("POST", "/api/cluster-groups/sync", bytes.NewReader(bigPayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	// Fiber may reject oversized bodies with 413 or our handler returns 413
	assert.True(t, resp.StatusCode == 413 || resp.StatusCode == 400,
		"expected 413 or 400, got %d", resp.StatusCode)
}

// TestListClusterGroups_NoK8sClient verifies that ListClusterGroups works
// when no k8s client is available (built-in group has empty clusters list).
func TestListClusterGroups_NoK8sClient(t *testing.T) {
	env := setupTestEnv(t)
	// Create handler without k8s client
	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", handler.ListClusterGroups)

	req, err := http.NewRequest("GET", "/api/cluster-groups", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string][]ClusterGroup
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)

	require.NotEmpty(t, result["groups"])
	builtIn := result["groups"][0]
	assert.Equal(t, "all-healthy-clusters", builtIn.Name)
	assert.Equal(t, "dynamic", builtIn.Kind)
	assert.True(t, builtIn.BuiltIn)
	// Clusters should be an empty list, not nil
	assert.NotNil(t, builtIn.Clusters)
	assert.Empty(t, builtIn.Clusters)
}

// TestLoadPersistedClusterGroups_Success verifies that persisted cluster groups
// are loaded into the in-memory map on startup.
func TestLoadPersistedClusterGroups_Success(t *testing.T) {
	mockStore := new(test.MockStore)
	group := ClusterGroup{Name: "persisted-group", Kind: "static", Clusters: []string{"c1"}}
	data, _ := json.Marshal(group)
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"persisted-group": data,
	}, nil).Once()

	handler := &WorkloadHandlers{store: mockStore, stopCh: make(chan struct{})}
	handler.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	loaded, exists := clusterGroups["persisted-group"]
	clusterGroupsMu.RUnlock()

	assert.True(t, exists)
	assert.Equal(t, "persisted-group", loaded.Name)
	assert.Equal(t, []string{"c1"}, loaded.Clusters)
	mockStore.AssertExpectations(t)

	// Cleanup
	clusterGroupsMu.Lock()
	delete(clusterGroups, "persisted-group")
	clusterGroupsMu.Unlock()
}

// TestLoadPersistedClusterGroups_NilStore verifies that LoadPersistedClusterGroups
// returns early when store is nil (no crash).
func TestLoadPersistedClusterGroups_NilStore(t *testing.T) {
	handler := &WorkloadHandlers{store: nil, stopCh: make(chan struct{})}
	// Should not panic
	handler.LoadPersistedClusterGroups()
}

// TestLoadPersistedClusterGroups_UnmarshalError verifies that invalid persisted
// data is skipped without crashing.
func TestLoadPersistedClusterGroups_UnmarshalError(t *testing.T) {
	mockStore := new(test.MockStore)
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"bad-group": []byte("not-valid-json{{{"),
	}, nil).Once()

	handler := &WorkloadHandlers{store: mockStore, stopCh: make(chan struct{})}
	handler.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["bad-group"]
	clusterGroupsMu.RUnlock()

	assert.False(t, exists, "invalid JSON should not be stored in memory")
	mockStore.AssertExpectations(t)
}

// TestStartStopCacheRefresh verifies that the periodic cache refresh goroutine
// can be started and stopped without deadlocking or panicking.
func TestStartStopCacheRefresh(t *testing.T) {
	mockStore := new(test.MockStore)
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{}, nil).Maybe()

	handler := &WorkloadHandlers{store: mockStore, stopCh: make(chan struct{})}

	// StartCacheRefresh with nil store should be a no-op
	nilHandler := &WorkloadHandlers{store: nil, stopCh: make(chan struct{})}
	nilHandler.StartCacheRefresh() // should not panic

	// Start with a real store
	handler.StartCacheRefresh()

	// Give it a tiny bit of time to start the goroutine
	time.Sleep(50 * time.Millisecond)

	// StopCacheRefresh should be idempotent
	handler.StopCacheRefresh()
	handler.StopCacheRefresh() // second call should not panic
}

// TestPersistClusterGroup_NilStore verifies that persistence is a no-op
// when store is nil.
func TestPersistClusterGroup_NilStore(t *testing.T) {
	handler := &WorkloadHandlers{store: nil, stopCh: make(chan struct{})}
	// Should not panic
	handler.persistClusterGroup(nil, "test", ClusterGroup{Name: "test"})
}

// TestDeletePersistedClusterGroup_NilStore verifies that delete is a no-op
// when store is nil.
func TestDeletePersistedClusterGroup_NilStore(t *testing.T) {
	handler := &WorkloadHandlers{store: nil, stopCh: make(chan struct{})}
	// Should not panic
	handler.deletePersistedClusterGroup(nil, "test")
}

// TestCreateClusterGroup_NoK8sClient verifies that a group can be created
// without a k8s client (labels are not applied, but group is stored).
func TestCreateClusterGroup_NoK8sClient(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)

	payload := map[string]interface{}{
		"name":     "no-k8s-group",
		"kind":     "static",
		"clusters": []string{"c1"},
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "/api/cluster-groups", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 201, resp.StatusCode)

	var result ClusterGroup
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Equal(t, "no-k8s-group", result.Name)

	// Cleanup
	clusterGroupsMu.Lock()
	delete(clusterGroups, "no-k8s-group")
	clusterGroupsMu.Unlock()
}

// TestSyncClusterGroups_PersistenceDeletesStale verifies that sync removes
// stale groups from the in-memory map when replaced by new groups.
func TestSyncClusterGroups_PersistenceDeletesStale(t *testing.T) {
	env := setupTestEnv(t)
	// Use nil store handler to avoid RBAC enforcement (nil store skips it)
	handler := NewWorkloadHandlers(nil, nil, nil)
	env.App.Post("/api/cluster-groups/sync", handler.SyncClusterGroups)

	// Pre-populate the in-memory map with a stale group
	clusterGroupsMu.Lock()
	clusterGroups["stale-group"] = ClusterGroup{Name: "stale-group", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	syncPayload := []ClusterGroup{
		{Name: "fresh-group", Kind: "static", Clusters: []string{"c2"}},
	}
	data, _ := json.Marshal(syncPayload)
	req, err := http.NewRequest("POST", "/api/cluster-groups/sync", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Verify the in-memory state is correct
	clusterGroupsMu.RLock()
	_, staleExists := clusterGroups["stale-group"]
	_, freshExists := clusterGroups["fresh-group"]
	clusterGroupsMu.RUnlock()
	assert.False(t, staleExists, "stale group should be removed from memory")
	assert.True(t, freshExists, "fresh group should be in memory")

	// Cleanup
	clusterGroupsMu.Lock()
	delete(clusterGroups, "fresh-group")
	clusterGroupsMu.Unlock()
}

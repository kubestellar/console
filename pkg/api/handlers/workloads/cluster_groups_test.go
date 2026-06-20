package workloads

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// ---------- LoadPersistedClusterGroups ----------

func TestLoadPersistedClusterGroups_Success(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	group := ClusterGroup{Name: "test-group", Kind: "static", Clusters: []string{"c1", "c2"}}
	data, _ := json.Marshal(group)

	mockStore.ExpectedCalls = nil // clear default
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"test-group": data,
	}, nil).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)

	// Clear in-memory state
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	loaded, exists := clusterGroups["test-group"]
	clusterGroupsMu.RUnlock()

	assert.True(t, exists)
	assert.Equal(t, "test-group", loaded.Name)
	assert.Equal(t, []string{"c1", "c2"}, loaded.Clusters)
}

func TestLoadPersistedClusterGroups_NilStoreClusterGroups(t *testing.T) {
	h := &WorkloadHandlers{store: nil}
	// Should not panic
	h.LoadPersistedClusterGroups()
}

func TestLoadPersistedClusterGroups_StoreErrorClusterGroups(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("ListClusterGroups", mock.Anything).Return(nil, assert.AnError).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)

	// Should not panic, just log error
	h.LoadPersistedClusterGroups()
}

func TestLoadPersistedClusterGroups_InvalidJSONClusterGroups(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"bad-group": []byte("not valid json{{{"),
	}, nil).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	// Should not panic, skip invalid entries
	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["bad-group"]
	clusterGroupsMu.RUnlock()
	assert.False(t, exists)
}

// ---------- persistClusterGroup ----------

func TestPersistClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("SaveClusterGroup", mock.Anything, "my-group", mock.AnythingOfType("[]uint8")).Return(nil).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)
	group := ClusterGroup{Name: "my-group", Kind: "static", Clusters: []string{"c1"}}

	h.persistClusterGroup(context.Background(), "my-group", group)
	mockStore.AssertExpectations(t)
}

func TestPersistClusterGroup_NilStore(t *testing.T) {
	h := &WorkloadHandlers{store: nil}
	group := ClusterGroup{Name: "test", Kind: "static"}
	// Should not panic
	h.persistClusterGroup(context.Background(), "test", group)
}

func TestPersistClusterGroup_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("SaveClusterGroup", mock.Anything, "err-group", mock.Anything).Return(assert.AnError).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)
	group := ClusterGroup{Name: "err-group", Kind: "static"}

	// Should not panic, just log error
	h.persistClusterGroup(context.Background(), "err-group", group)
	mockStore.AssertExpectations(t)
}

// ---------- deletePersistedClusterGroup ----------

func TestDeletePersistedClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("DeleteClusterGroup", mock.Anything, "del-group").Return(nil).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)
	h.deletePersistedClusterGroup(context.Background(), "del-group")
	mockStore.AssertExpectations(t)
}

func TestDeletePersistedClusterGroup_NilStore(t *testing.T) {
	h := &WorkloadHandlers{store: nil}
	// Should not panic
	h.deletePersistedClusterGroup(context.Background(), "test")
}

func TestDeletePersistedClusterGroup_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	mockStore.ExpectedCalls = nil
	mockStore.On("DeleteClusterGroup", mock.Anything, "err-group").Return(assert.AnError).Once()
	mockStore.On("GetUser", mock.Anything).Return(nil, nil).Maybe()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, mockStore)
	// Should not panic
	h.deletePersistedClusterGroup(context.Background(), "err-group")
	mockStore.AssertExpectations(t)
}

// ---------- ListClusterGroups ----------

func TestListClusterGroups_IncludesBuiltIn(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", h.ListClusterGroups)

	// Clear and add a custom group
	clusterGroupsMu.Lock()
	clusterGroups = map[string]ClusterGroup{
		"custom": {Name: "custom", Kind: "static", Clusters: []string{"c1"}},
	}
	clusterGroupsMu.Unlock()

	req, _ := http.NewRequest("GET", "/api/cluster-groups", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var body map[string][]ClusterGroup
	err = json.NewDecoder(resp.Body).Decode(&body)
	require.NoError(t, err)

	groups := body["groups"]
	require.GreaterOrEqual(t, len(groups), 2)
	// First group should be the built-in
	assert.Equal(t, allHealthyClustersGroupName, groups[0].Name)
	assert.True(t, groups[0].BuiltIn)
}

// ---------- CreateClusterGroup ----------

func TestCreateClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	// Clear in-memory state
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	payload := `{"name":"new-group","kind":"static","clusters":["test-cluster"]}`
	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 201, resp.StatusCode)

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["new-group"]
	clusterGroupsMu.RUnlock()
	assert.True(t, exists)
}

func TestCreateClusterGroup_MissingName(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	payload := `{"name":"","kind":"static","clusters":["c1"]}`
	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestCreateClusterGroup_ReservedName(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	payload := `{"name":"all-healthy-clusters","kind":"static","clusters":["c1"]}`
	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestCreateClusterGroup_StaticNoClusters(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	payload := `{"name":"empty-group","kind":"static","clusters":[]}`
	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestCreateClusterGroup_DynamicNoClusters(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	// Dynamic groups are allowed with no clusters
	payload := `{"name":"dyn-group","kind":"dynamic","clusters":[]}`
	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 201, resp.StatusCode)
}

func TestCreateClusterGroup_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	req, _ := http.NewRequest("POST", "/api/cluster-groups", strings.NewReader("not json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

// ---------- UpdateClusterGroup ----------

func TestUpdateClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

	// Seed existing group
	clusterGroupsMu.Lock()
	clusterGroups = map[string]ClusterGroup{
		"existing": {Name: "existing", Kind: "static", Clusters: []string{"c1"}},
	}
	clusterGroupsMu.Unlock()

	payload := `{"kind":"static","clusters":["c1","c2"]}`
	req, _ := http.NewRequest("PUT", "/api/cluster-groups/existing", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	clusterGroupsMu.RLock()
	updated := clusterGroups["existing"]
	clusterGroupsMu.RUnlock()
	assert.Equal(t, []string{"c1", "c2"}, updated.Clusters)
}

func TestUpdateClusterGroup_BuiltInReject(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

	payload := `{"kind":"static","clusters":["c1"]}`
	req, _ := http.NewRequest("PUT", "/api/cluster-groups/all-healthy-clusters", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestUpdateClusterGroup_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

	req, _ := http.NewRequest("PUT", "/api/cluster-groups/test", strings.NewReader("bad json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

// ---------- DeleteClusterGroup ----------

func TestDeleteClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)

	clusterGroupsMu.Lock()
	clusterGroups = map[string]ClusterGroup{
		"del-me": {Name: "del-me", Kind: "static", Clusters: []string{"c1"}},
	}
	clusterGroupsMu.Unlock()

	req, _ := http.NewRequest("DELETE", "/api/cluster-groups/del-me", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["del-me"]
	clusterGroupsMu.RUnlock()
	assert.False(t, exists)
}

func TestDeleteClusterGroup_BuiltInReject(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)

	req, _ := http.NewRequest("DELETE", "/api/cluster-groups/all-healthy-clusters", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

// ---------- SyncClusterGroups ----------

func TestSyncClusterGroups_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	payload := `[{"name":"g1","kind":"static","clusters":["c1"]},{"name":"g2","kind":"dynamic","clusters":[]}]`
	req, _ := http.NewRequest("POST", "/api/cluster-groups/sync", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var body map[string]int
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, 2, body["synced"])
}

func TestSyncClusterGroups_FiltersReservedName(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	// Include the reserved name — it should be filtered out
	payload := `[{"name":"all-healthy-clusters","kind":"dynamic","clusters":[]},{"name":"real-group","kind":"static","clusters":["c1"]}]`
	req, _ := http.NewRequest("POST", "/api/cluster-groups/sync", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var body map[string]int
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, 1, body["synced"]) // only "real-group"
}

func TestSyncClusterGroups_InvalidJSONClusterGroups(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	req, _ := http.NewRequest("POST", "/api/cluster-groups/sync", strings.NewReader("not json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, 400, resp.StatusCode)
}

func TestSyncClusterGroups_BodyTooLarge(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	// 1MB + 1 byte
	bigPayload := "[" + strings.Repeat(`{"name":"x","kind":"static","clusters":["c"]},`, 30000) + `{"name":"last","kind":"static","clusters":["c"]}]`
	if len(bigPayload) <= 1<<20 {
		// Ensure it's actually over 1MB
		bigPayload = strings.Repeat("x", 1<<20+1)
	}
	req, _ := http.NewRequest("POST", "/api/cluster-groups/sync", strings.NewReader(bigPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	// Should be 413 or 400 depending on whether Fiber or the handler catches it
	assert.True(t, resp.StatusCode == 413 || resp.StatusCode == 400)
}

// ---------- StopCacheRefresh ----------

func TestStopCacheRefresh_Idempotent(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	// Calling StopCacheRefresh multiple times should not panic
	h.StopCacheRefresh()
	h.StopCacheRefresh()
	h.StopCacheRefresh()
}

// ---------- Concurrent access ----------

func TestClusterGroupsConcurrentAccess(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", h.ListClusterGroups)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	var wg sync.WaitGroup
	// Concurrent reads and writes should not race
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			req, _ := http.NewRequest("GET", "/api/cluster-groups", nil)
			env.App.Test(req, -1)
		}(i)
		go func(idx int) {
			defer wg.Done()
			clusterGroupsMu.Lock()
			clusterGroups[time.Now().String()] = ClusterGroup{Name: "concurrent", Kind: "static", Clusters: []string{"c1"}}
			clusterGroupsMu.Unlock()
		}(i)
	}
	wg.Wait()
}

package workloads

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────
// LoadPersistedClusterGroups
// ────────────────────────────────────────────────────────────────────

func TestLoadPersistedClusterGroups_LoadsFromStore(t *testing.T) {
	env := setupTestEnv(t)

	// Seed some persisted groups in the mock store
	groupA := ClusterGroup{Name: "group-a", Kind: "static", Clusters: []string{"c1", "c2"}}
	groupB := ClusterGroup{Name: "group-b", Kind: "dynamic", Clusters: []string{}}
	dataA, _ := json.Marshal(groupA)
	dataB, _ := json.Marshal(groupB)

	mockStore := env.Store.(*test.MockStore)
	// Override the default ListClusterGroups expectation
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "ListClusterGroups")
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"group-a": dataA,
		"group-b": dataB,
	}, nil).Once()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	// Clear any existing groups from previous tests
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	defer clusterGroupsMu.RUnlock()
	assert.Len(t, clusterGroups, 2)
	assert.Equal(t, "group-a", clusterGroups["group-a"].Name)
	assert.Equal(t, []string{"c1", "c2"}, clusterGroups["group-a"].Clusters)
	assert.Equal(t, "dynamic", clusterGroups["group-b"].Kind)
}

func TestLoadPersistedClusterGroups_NilStore(t *testing.T) {
	h := NewWorkloadHandlers(nil, nil, nil)

	// Should not panic with nil store
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	defer clusterGroupsMu.RUnlock()
	assert.Empty(t, clusterGroups)
}

func TestLoadPersistedClusterGroups_StoreError(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "ListClusterGroups")
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte(nil), assert.AnError).Once()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	// Should not panic on store error
	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	defer clusterGroupsMu.RUnlock()
	assert.Empty(t, clusterGroups)
}

func TestLoadPersistedClusterGroups_InvalidJSON(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "ListClusterGroups")
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{
		"valid": mustMarshal(ClusterGroup{Name: "valid", Kind: "static", Clusters: []string{"c1"}}),
		"bad":   []byte(`{invalid json`),
	}, nil).Once()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroupsMu.Unlock()

	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	defer clusterGroupsMu.RUnlock()
	// Only the valid group should be loaded
	assert.Len(t, clusterGroups, 1)
	assert.Equal(t, "valid", clusterGroups["valid"].Name)
}

// ────────────────────────────────────────────────────────────────────
// StartCacheRefresh / StopCacheRefresh
// ────────────────────────────────────────────────────────────────────

func TestStartStopCacheRefresh(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	// Start should not panic
	h.StartCacheRefresh()

	// Stop should be safe to call multiple times (sync.Once)
	h.StopCacheRefresh()
	h.StopCacheRefresh() // second call should be no-op
}

func TestStartCacheRefresh_NilStore(t *testing.T) {
	h := NewWorkloadHandlers(nil, nil, nil)
	// Should return immediately without starting goroutine
	h.StartCacheRefresh()
	// StopCacheRefresh is safe regardless
	h.StopCacheRefresh()
}

// ────────────────────────────────────────────────────────────────────
// SyncClusterGroups
// ────────────────────────────────────────────────────────────────────

func TestSyncClusterGroups_BulkSync(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	groups := []ClusterGroup{
		{Name: "prod", Kind: "static", Clusters: []string{"c1", "c2"}},
		{Name: "staging", Kind: "dynamic", Clusters: []string{"c3"}},
	}
	body, _ := json.Marshal(groups)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	respBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(respBody, &result)
	assert.Equal(t, float64(2), result["synced"])

	// Verify in-memory state
	clusterGroupsMu.RLock()
	assert.Equal(t, "prod", clusterGroups["prod"].Name)
	assert.Equal(t, "staging", clusterGroups["staging"].Name)
	clusterGroupsMu.RUnlock()
}

func TestSyncClusterGroups_ReservedNameFiltered(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	groups := []ClusterGroup{
		{Name: allHealthyClustersGroupName, Kind: "dynamic", Clusters: []string{"reserved"}},
		{Name: "custom", Kind: "static", Clusters: []string{"c1"}},
	}
	body, _ := json.Marshal(groups)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	respBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(respBody, &result)
	// Reserved name should be excluded
	assert.Equal(t, float64(1), result["synced"])
}

func TestSyncClusterGroups_InvalidJSON(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader([]byte(`not json`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSyncClusterGroups_RemovesStaleGroups(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	// Clear and pre-populate with an existing group
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	clusterGroups["old-group"] = ClusterGroup{Name: "old-group", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	// Sync with only a new group — old-group should be deleted
	groups := []ClusterGroup{
		{Name: "new-group", Kind: "static", Clusters: []string{"c2"}},
	}
	body, _ := json.Marshal(groups)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Verify old-group was removed from in-memory state
	clusterGroupsMu.RLock()
	_, exists := clusterGroups["old-group"]
	clusterGroupsMu.RUnlock()
	assert.False(t, exists, "old-group should be removed after sync")

	// The store mock should have received a DeleteClusterGroup call.
	// The testify mock records calls; look for our group name in any arg position.
	var deletedOldGroup bool
	for _, call := range mockStore.Calls {
		if call.Method == "DeleteClusterGroup" {
			for _, arg := range call.Arguments {
				if s, ok := arg.(string); ok && s == "old-group" {
					deletedOldGroup = true
				}
			}
		}
	}
	assert.True(t, deletedOldGroup, "DeleteClusterGroup should have been called for old-group")
}

// ────────────────────────────────────────────────────────────────────
// clusterMatchesFilter — additional coverage for untested branches
// ────────────────────────────────────────────────────────────────────

func TestClusterMatchesFilter_ReachableField(t *testing.T) {
	health := makeClusterHealth(true, true, 4, 16.0, 3, 100)
	var nodes []k8s.NodeInfo

	assert.True(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "reachable", Operator: "eq", Value: "true"}))
	assert.False(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "reachable", Operator: "eq", Value: "false"}))
}

func TestClusterMatchesFilter_PodCountField(t *testing.T) {
	health := makeClusterHealth(true, true, 4, 16.0, 3, 100)
	var nodes []k8s.NodeInfo

	assert.True(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "podCount", Operator: "gte", Value: "100"}))
	assert.False(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "podCount", Operator: "gt", Value: "100"}))
	assert.True(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "podCount", Operator: "lt", Value: "200"}))
}

func TestClusterMatchesFilter_UnknownField(t *testing.T) {
	health := makeClusterHealth(true, true, 4, 16.0, 3, 100)
	var nodes []k8s.NodeInfo

	// Unknown fields should pass (not block)
	assert.True(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "unknownField", Operator: "eq", Value: "anything"}))
}

func TestClusterMatchesFilter_NodeCountField(t *testing.T) {
	health := makeClusterHealth(true, true, 4, 16.0, 3, 100)
	var nodes []k8s.NodeInfo

	assert.True(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "nodeCount", Operator: "eq", Value: "3"}))
	assert.False(t, clusterMatchesFilter(health, nodes, ClusterFilter{Field: "nodeCount", Operator: "gt", Value: "3"}))
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}

// filterExpectedCalls removes expected calls for a given method name
func filterExpectedCalls(calls []*mock.Call, method string) []*mock.Call {
	filtered := make([]*mock.Call, 0, len(calls))
	for _, c := range calls {
		if c.Method != method {
			filtered = append(filtered, c)
		}
	}
	return filtered
}

// makeClusterHealth creates a ClusterHealth for testing clusterMatchesFilter
func makeClusterHealth(healthy, reachable bool, cpuCores int, memoryGB float64, nodeCount, podCount int) k8s.ClusterHealth {
	return k8s.ClusterHealth{
		Healthy:   healthy,
		Reachable: reachable,
		CpuCores:  cpuCores,
		MemoryGB:  memoryGB,
		NodeCount: nodeCount,
		PodCount:  podCount,
	}
}

// Verify time import is used (needed by StartCacheRefresh test)
var _ = time.Second

package workloads

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func resetClusterGroupsState() {
	clusterGroupsMu.Lock()
	defer clusterGroupsMu.Unlock()
	clusterGroups = make(map[string]ClusterGroup)
}

func resetClusterGroupsForTest(t *testing.T) {
	t.Helper()
	resetClusterGroupsState()
	t.Cleanup(resetClusterGroupsState)
}

func excludeCallsByMethod(calls []*mock.Call, method string) []*mock.Call {
	filtered := make([]*mock.Call, 0, len(calls))
	for _, c := range calls {
		if c.Method != method {
			filtered = append(filtered, c)
		}
	}
	return filtered
}

func decodeMapResponse(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(body, &payload))
	return payload
}

func TestListClusterGroups_ReturnsBuiltInAndUserGroups(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", h.ListClusterGroups)

	resetClusterGroupsForTest(t)
	clusterGroupsMu.Lock()
	clusterGroups["team-a"] = ClusterGroup{Name: "team-a", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/api/cluster-groups", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	payload := decodeMapResponse(t, resp)
	groupsAny, ok := payload["groups"].([]any)
	require.True(t, ok)
	require.GreaterOrEqual(t, len(groupsAny), 2)

	builtIn, ok := groupsAny[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, allHealthyClustersGroupName, builtIn["name"])
	assert.Equal(t, true, builtIn["builtIn"])
	assert.NotNil(t, builtIn["clusters"])

	var foundUserGroup bool
	for _, item := range groupsAny {
		group, ok := item.(map[string]any)
		require.True(t, ok)
		if group["name"] == "team-a" {
			foundUserGroup = true
			break
		}
	}
	assert.True(t, foundUserGroup)
}

func TestCreateClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", h.CreateClusterGroup)
	nodeGVR := schema.GroupVersionResource{Version: "v1", Resource: "nodes"}
	injectDynamicCluster(env, "c1", map[schema.GroupVersionResource]string{nodeGVR: "NodeList"})

	resetClusterGroupsForTest(t)

	requestBody := []byte(`{"name":"team-a","kind":"static","clusters":["c1"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", bytes.NewReader(requestBody))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["team-a"]
	clusterGroupsMu.RUnlock()
	assert.True(t, exists)

	var persisted bool
	for _, call := range store.Calls {
		if call.Method == "SaveClusterGroup" {
			if name, ok := call.Arguments.Get(0).(string); ok && name == "team-a" {
				persisted = true
				break
			}
		}
	}
	assert.True(t, persisted)
}

func TestCreateClusterGroup_ValidationAndReservedName(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		expectCode int
	}{
		{name: "invalid json", body: `not-json`, expectCode: http.StatusBadRequest},
		{name: "missing name", body: `{"kind":"static","clusters":["test-cluster"]}`, expectCode: http.StatusBadRequest},
		{name: "missing clusters for static", body: `{"name":"team-a","kind":"static"}`, expectCode: http.StatusBadRequest},
		{name: "reserved name", body: `{"name":"all-healthy-clusters","kind":"static","clusters":["test-cluster"]}`, expectCode: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			env := setupTestEnv(t)
			h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
			env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

			resetClusterGroupsForTest(t)

			req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", bytes.NewReader([]byte(tc.body)))
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tc.expectCode, resp.StatusCode)
		})
	}
}

func TestCreateClusterGroup_RequiresAdmin(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	nonAdminID := uuid.New()
	store.On("GetUser", nonAdminID).Return(&models.User{ID: nonAdminID, Role: models.UserRoleViewer}, nil).Once()
	env.App.Post("/api/cluster-groups", func(c *fiber.Ctx) error {
		c.Locals("userID", nonAdminID)
		return h.CreateClusterGroup(c)
	})

	resetClusterGroupsForTest(t)

	requestBody := []byte(`{"name":"team-a","kind":"static","clusters":["test-cluster"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", bytes.NewReader(requestBody))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUpdateClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

	resetClusterGroupsForTest(t)
	clusterGroupsMu.Lock()
	clusterGroups["team-a"] = ClusterGroup{Name: "team-a", Kind: "static", Clusters: []string{"test-cluster"}}
	clusterGroupsMu.Unlock()

	requestBody := []byte(`{"kind":"static","clusters":["test-cluster"],"color":"blue"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/cluster-groups/team-a", bytes.NewReader(requestBody))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	clusterGroupsMu.RLock()
	updated := clusterGroups["team-a"]
	clusterGroupsMu.RUnlock()
	assert.Equal(t, []string{"test-cluster"}, updated.Clusters)
	assert.Equal(t, "blue", updated.Color)
}

func TestUpdateClusterGroup_ReservedNameProtected(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

	req := httptest.NewRequest(http.MethodPut, "/api/cluster-groups/all-healthy-clusters", bytes.NewReader([]byte(`{"kind":"static","clusters":["test-cluster"]}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDeleteClusterGroup_Success(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)
	nodeGVR := schema.GroupVersionResource{Version: "v1", Resource: "nodes"}
	injectDynamicCluster(env, "c1", map[schema.GroupVersionResource]string{nodeGVR: "NodeList"})

	resetClusterGroupsForTest(t)
	clusterGroupsMu.Lock()
	clusterGroups["team-a"] = ClusterGroup{Name: "team-a", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	req := httptest.NewRequest(http.MethodDelete, "/api/cluster-groups/team-a", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["team-a"]
	clusterGroupsMu.RUnlock()
	assert.False(t, exists)

	var deleted bool
	for _, call := range store.Calls {
		if call.Method == "DeleteClusterGroup" {
			if name, ok := call.Arguments.Get(0).(string); ok && name == "team-a" {
				deleted = true
				break
			}
		}
	}
	assert.True(t, deleted)
}

func TestDeleteClusterGroup_ReservedNameProtected(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)

	req := httptest.NewRequest(http.MethodDelete, "/api/cluster-groups/all-healthy-clusters", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSyncClusterGroups_SuccessAndReservedFiltered(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	resetClusterGroupsForTest(t)
	clusterGroupsMu.Lock()
	clusterGroups["old-group"] = ClusterGroup{Name: "old-group", Kind: "static", Clusters: []string{"c0"}}
	clusterGroupsMu.Unlock()

	syncPayload := []ClusterGroup{
		{Name: allHealthyClustersGroupName, Kind: "dynamic", Clusters: []string{"ignored"}},
		{Name: "team-a", Kind: "static", Clusters: []string{"test-cluster"}},
	}
	body, err := json.Marshal(syncPayload)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	payload := decodeMapResponse(t, resp)
	assert.Equal(t, float64(1), payload["synced"])

	clusterGroupsMu.RLock()
	_, hasOld := clusterGroups["old-group"]
	_, hasReserved := clusterGroups[allHealthyClustersGroupName]
	_, hasTeamA := clusterGroups["team-a"]
	clusterGroupsMu.RUnlock()
	assert.False(t, hasOld)
	assert.False(t, hasReserved)
	assert.True(t, hasTeamA)

	var deletedOld bool
	for _, call := range store.Calls {
		if call.Method == "DeleteClusterGroup" {
			if name, ok := call.Arguments.Get(0).(string); ok && name == "old-group" {
				deletedOld = true
				break
			}
		}
	}
	assert.True(t, deletedOld)
}

func TestSyncClusterGroups_RejectsOversizedPayload(t *testing.T) {
	const syncMaxBodyBytes = 1 << 20

	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

	oversizedBody := bytes.Repeat([]byte("a"), syncMaxBodyBytes+1)
	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(oversizedBody))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
}

func TestLoadPersistedClusterGroups_RestoresFromStore(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	store.ExpectedCalls = excludeCallsByMethod(store.ExpectedCalls, "ListClusterGroups")

	group := ClusterGroup{Name: "persisted", Kind: "static", Clusters: []string{"test-cluster", "another"}}
	data, err := json.Marshal(group)
	require.NoError(t, err)

	store.On("ListClusterGroups").Return(map[string][]byte{"persisted": data}, nil).Once()

	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)
	resetClusterGroupsForTest(t)

	h.LoadPersistedClusterGroups()

	clusterGroupsMu.RLock()
	persisted, exists := clusterGroups["persisted"]
	clusterGroupsMu.RUnlock()
	require.True(t, exists)
	assert.Equal(t, []string{"test-cluster", "another"}, persisted.Clusters)
}

func TestStartStopCacheRefresh_Lifecycle(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	h.StartCacheRefresh()
	h.StopCacheRefresh()
	h.StopCacheRefresh()

	select {
	case <-h.stopCh:
	default:
		t.Fatal("expected stop channel to be closed after StopCacheRefresh")
	}
}

func TestPersistenceHelpers_SaveAndDelete(t *testing.T) {
	env := setupTestEnv(t)
	store := env.Store.(*test.MockStore)
	h := NewWorkloadHandlers(env.K8sClient, env.Hub, env.Store)

	group := ClusterGroup{Name: "persist-me", Kind: "static", Clusters: []string{"test-cluster"}}
	h.persistClusterGroup(context.Background(), group.Name, group)
	h.deletePersistedClusterGroup(context.Background(), group.Name)

	var saved bool
	var deleted bool
	for _, call := range store.Calls {
		switch call.Method {
		case "SaveClusterGroup":
			if name, ok := call.Arguments.Get(0).(string); ok && name == group.Name {
				saved = true
			}
		case "DeleteClusterGroup":
			if name, ok := call.Arguments.Get(0).(string); ok && name == group.Name {
				deleted = true
			}
		}
	}
	assert.True(t, saved)
	assert.True(t, deleted)
}

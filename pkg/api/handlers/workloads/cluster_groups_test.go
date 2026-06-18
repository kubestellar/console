package workloads

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func resetClusterGroups(t *testing.T) {
	t.Helper()
	clearGroups := func() {
		clusterGroupsMu.Lock()
		clusterGroups = make(map[string]ClusterGroup)
		clusterGroupsMu.Unlock()
	}
	clearGroups()
	t.Cleanup(clearGroups)
}

func newJSONRequest(t *testing.T, method, path string, body any) *http.Request {
	t.Helper()
	data, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestListClusterGroups_PrependsBuiltInGroup(t *testing.T) {
	env := setupTestEnv(t)
	resetClusterGroups(t)

	clusterGroupsMu.Lock()
	clusterGroups["user-group"] = ClusterGroup{Name: "user-group", Kind: "static", Clusters: []string{"c1"}}
	clusterGroupsMu.Unlock()

	h := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", h.ListClusterGroups)

	resp, err := env.App.Test(httptest.NewRequest(http.MethodGet, "/api/cluster-groups", nil), -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Groups []ClusterGroup `json:"groups"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	require.GreaterOrEqual(t, len(payload.Groups), 2)
	assert.Equal(t, allHealthyClustersGroupName, payload.Groups[0].Name)
	assert.True(t, payload.Groups[0].BuiltIn)
	assert.Equal(t, []string{}, payload.Groups[0].Clusters)
}

func TestCreateClusterGroup_ValidationAndPersistence(t *testing.T) {
	tests := []struct {
		name       string
		body       any
		wantStatus int
	}{
		{
			name:       "empty name rejected",
			body:       ClusterGroup{Kind: "static", Clusters: []string{"c1"}},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "reserved name rejected",
			body:       ClusterGroup{Name: allHealthyClustersGroupName, Kind: "static", Clusters: []string{"c1"}},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "static group requires clusters",
			body:       ClusterGroup{Name: "no-clusters", Kind: "static", Clusters: []string{}},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "dynamic group may omit clusters",
			body:       ClusterGroup{Name: "dynamic-ok", Kind: "dynamic", Clusters: []string{}},
			wantStatus: http.StatusCreated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := setupTestEnv(t)
			resetClusterGroups(t)
			h := NewWorkloadHandlers(nil, env.Hub, env.Store)
			env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

			resp, err := env.App.Test(newJSONRequest(t, http.MethodPost, "/api/cluster-groups", tt.body), -1)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}

	t.Run("persists created group", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "SaveClusterGroup")
		mockStore.On("SaveClusterGroup", "persist-me", mock.MatchedBy(func(data []byte) bool {
			var group ClusterGroup
			if err := json.Unmarshal(data, &group); err != nil {
				return false
			}
			return group.Name == "persist-me" && group.Kind == "static" && len(group.Clusters) == 1
		})).Return(nil).Once()

		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Post("/api/cluster-groups", h.CreateClusterGroup)

		resp, err := env.App.Test(newJSONRequest(t, http.MethodPost, "/api/cluster-groups", ClusterGroup{
			Name: "persist-me", Kind: "static", Clusters: []string{"c1"},
		}), -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusCreated, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})
}

func TestClusterGroupMutations_RequireAdmin(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   []byte
	}{
		{
			name:   "create forbidden for non-admin",
			method: http.MethodPost,
			path:   "/api/cluster-groups",
			body:   mustMarshal(ClusterGroup{Name: "g1", Kind: "static", Clusters: []string{"c1"}}),
		},
		{
			name:   "update forbidden for non-admin",
			method: http.MethodPut,
			path:   "/api/cluster-groups/g1",
			body:   mustMarshal(ClusterGroup{Name: "g1", Kind: "static", Clusters: []string{"c1"}}),
		},
		{
			name:   "delete forbidden for non-admin",
			method: http.MethodDelete,
			path:   "/api/cluster-groups/g1",
		},
		{
			name:   "sync forbidden for non-admin",
			method: http.MethodPost,
			path:   "/api/cluster-groups/sync",
			body:   mustMarshal([]ClusterGroup{{Name: "g1", Kind: "static", Clusters: []string{"c1"}}}),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := setupTestEnv(t)
			resetClusterGroups(t)
			mockStore := env.Store.(*test.MockStore)
			mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "GetUser")
			mockStore.On("GetUser", testAdminUserID).Return(&models.User{
				ID:   testAdminUserID,
				Role: models.UserRoleViewer,
			}, nil).Once()

			h := NewWorkloadHandlers(nil, env.Hub, env.Store)
			env.App.Post("/api/cluster-groups", h.CreateClusterGroup)
			env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)
			env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)
			env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

			req := httptest.NewRequest(tt.method, tt.path, bytes.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := env.App.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, http.StatusForbidden, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestUpdateAndDeleteClusterGroup_Persistence(t *testing.T) {
	t.Run("update persists URL name", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "SaveClusterGroup")
		mockStore.On("SaveClusterGroup", "group-from-url", mock.MatchedBy(func(data []byte) bool {
			var group ClusterGroup
			if err := json.Unmarshal(data, &group); err != nil {
				return false
			}
			return group.Name == "group-from-url" && group.Color == "red"
		})).Return(nil).Once()

		clusterGroupsMu.Lock()
		clusterGroups["group-from-url"] = ClusterGroup{Name: "group-from-url", Kind: "static", Clusters: []string{"c1"}}
		clusterGroupsMu.Unlock()

		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Put("/api/cluster-groups/:name", h.UpdateClusterGroup)

		resp, err := env.App.Test(newJSONRequest(t, http.MethodPut, "/api/cluster-groups/group-from-url", ClusterGroup{
			Name: "ignored-body-name", Kind: "static", Clusters: []string{"c1"}, Color: "red",
		}), -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("delete removes persisted group", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		mockStore := env.Store.(*test.MockStore)
		mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "DeleteClusterGroup")
		mockStore.On("DeleteClusterGroup", "to-delete").Return(nil).Once()

		clusterGroupsMu.Lock()
		clusterGroups["to-delete"] = ClusterGroup{Name: "to-delete", Kind: "static", Clusters: []string{"c1"}}
		clusterGroupsMu.Unlock()

		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Delete("/api/cluster-groups/:name", h.DeleteClusterGroup)

		resp, err := env.App.Test(httptest.NewRequest(http.MethodDelete, "/api/cluster-groups/to-delete", nil), -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})
}

func TestSyncClusterGroups_BodySizeAndFiltering(t *testing.T) {
	t.Run("empty body rejected", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

		req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", http.NoBody)
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("oversized body rejected", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

		oversized := bytes.Repeat([]byte("a"), (1<<20)+1)
		req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups/sync", bytes.NewReader(oversized))
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
	})

	t.Run("reserved name is filtered during sync", func(t *testing.T) {
		env := setupTestEnv(t)
		resetClusterGroups(t)
		h := NewWorkloadHandlers(nil, env.Hub, env.Store)
		env.App.Post("/api/cluster-groups/sync", h.SyncClusterGroups)

		resp, err := env.App.Test(newJSONRequest(t, http.MethodPost, "/api/cluster-groups/sync", []ClusterGroup{
			{Name: allHealthyClustersGroupName, Kind: "dynamic", Clusters: []string{"c1"}},
			{Name: "kept", Kind: "static", Clusters: []string{"c2"}},
		}), -1)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), `"synced":1`)

		clusterGroupsMu.RLock()
		_, reservedExists := clusterGroups[allHealthyClustersGroupName]
		_, keptExists := clusterGroups["kept"]
		clusterGroupsMu.RUnlock()
		assert.False(t, reservedExists)
		assert.True(t, keptExists)
	})
}

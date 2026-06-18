package workloads

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestListClusterGroups_PrependsBuiltInGroup(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Get("/api/cluster-groups", handler.ListClusterGroups)

	setClusterGroupsForTest(t, ClusterGroup{
		Name:     "team-a",
		Kind:     "static",
		Clusters: []string{"c1"},
		Color:    "blue",
	})

	req := httptest.NewRequest(http.MethodGet, "/api/cluster-groups", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Groups []ClusterGroup `json:"groups"`
	}
	decodeJSONBody(t, resp, &payload)
	require.Len(t, payload.Groups, 2)
	assert.Equal(t, allHealthyClustersGroupName, payload.Groups[0].Name)
	assert.True(t, payload.Groups[0].BuiltIn)
	assert.Empty(t, payload.Groups[0].Clusters)
	assert.Equal(t, "team-a", payload.Groups[1].Name)
}

func TestCreateClusterGroup_Validation(t *testing.T) {
	testCases := []struct {
		name          string
		body          string
		expectedCode  int
		expectedError string
	}{
		{
			name:          "empty name",
			body:          `{"kind":"static","clusters":["c1"]}`,
			expectedCode:  http.StatusBadRequest,
			expectedError: "name is required",
		},
		{
			name:          "reserved name",
			body:          `{"name":"all-healthy-clusters","kind":"static","clusters":["c1"]}`,
			expectedCode:  http.StatusBadRequest,
			expectedError: "cannot create a group with the reserved name",
		},
		{
			name:          "missing clusters for static group",
			body:          `{"name":"team-a","kind":"static","clusters":[]}`,
			expectedCode:  http.StatusBadRequest,
			expectedError: "at least one cluster is required",
		},
		{
			name:          "invalid json",
			body:          `{"name":`,
			expectedCode:  http.StatusBadRequest,
			expectedError: "invalid request",
		},
	}

	for _, tt := range testCases {
		t.Run(tt.name, func(t *testing.T) {
			env := setupTestEnv(t)
			handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
			env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)
			setClusterGroupsForTest(t)

			req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, -1)
			require.NoError(t, err)
			require.Equal(t, tt.expectedCode, resp.StatusCode)

			var payload map[string]string
			decodeJSONBody(t, resp, &payload)
			assert.Equal(t, tt.expectedError, payload["error"])
		})
	}
}

func TestCreateClusterGroup_PersistsGroup(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "SaveClusterGroup")

	expected := ClusterGroup{
		Name:     "team-a",
		Kind:     "static",
		Clusters: []string{"c1", "c2"},
		Color:    "blue",
	}
	mockStore.
		On("SaveClusterGroup", "team-a", mock.MatchedBy(func(data []byte) bool {
			var got ClusterGroup
			if err := json.Unmarshal(data, &got); err != nil {
				return false
			}
			return assert.ObjectsAreEqual(expected, got)
		})).
		Return(nil).
		Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)
	setClusterGroupsForTest(t)

	body := `{"name":"team-a","kind":"static","clusters":["c1","c2"],"color":"blue"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var group ClusterGroup
	decodeJSONBody(t, resp, &group)
	assert.Equal(t, expected, group)

	clusterGroupsMu.RLock()
	assert.Equal(t, expected, clusterGroups["team-a"])
	clusterGroupsMu.RUnlock()
	mockStore.AssertExpectations(t)
}

func TestCreateClusterGroup_RBAC(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "GetUser")
	mockStore.On("GetUser", testAdminUserID).Return(&models.User{
		ID:   testAdminUserID,
		Role: models.UserRoleViewer,
	}, nil).Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Post("/api/cluster-groups", handler.CreateClusterGroup)

	req := httptest.NewRequest(http.MethodPost, "/api/cluster-groups", strings.NewReader(`{"name":"team-a","kind":"static","clusters":["c1"]}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Contains(t, readBody(t, resp), "Console admin access required")
}

func TestUpdateClusterGroup_UpdatesExistingGroup(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "SaveClusterGroup")

	expected := ClusterGroup{
		Name:     "team-a",
		Kind:     "static",
		Clusters: []string{"c2"},
		Color:    "red",
	}
	mockStore.
		On("SaveClusterGroup", "team-a", mock.MatchedBy(func(data []byte) bool {
			var got ClusterGroup
			if err := json.Unmarshal(data, &got); err != nil {
				return false
			}
			return assert.ObjectsAreEqual(expected, got)
		})).
		Return(nil).
		Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", handler.UpdateClusterGroup)
	setClusterGroupsForTest(t, ClusterGroup{
		Name:     "team-a",
		Kind:     "static",
		Clusters: []string{"c1"},
		Color:    "blue",
	})

	req := httptest.NewRequest(http.MethodPut, "/api/cluster-groups/team-a", strings.NewReader(`{"name":"ignored","kind":"static","clusters":["c2"],"color":"red"}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var group ClusterGroup
	decodeJSONBody(t, resp, &group)
	assert.Equal(t, expected, group)

	clusterGroupsMu.RLock()
	assert.Equal(t, expected, clusterGroups["team-a"])
	clusterGroupsMu.RUnlock()
	mockStore.AssertExpectations(t)
}

func TestUpdateClusterGroup_ProtectsBuiltInGroup(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Put("/api/cluster-groups/:name", handler.UpdateClusterGroup)

	req := httptest.NewRequest(http.MethodPut, "/api/cluster-groups/"+allHealthyClustersGroupName, strings.NewReader(`{"kind":"static","clusters":["c1"]}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]string
	decodeJSONBody(t, resp, &payload)
	assert.Equal(t, "cannot modify a built-in group", payload["error"])
}

func TestDeleteClusterGroup_DeletesPersistedGroup(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "DeleteClusterGroup")
	mockStore.On("DeleteClusterGroup", "team-a").Return(nil).Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", handler.DeleteClusterGroup)
	setClusterGroupsForTest(t, ClusterGroup{Name: "team-a", Kind: "static"})

	req := httptest.NewRequest(http.MethodDelete, "/api/cluster-groups/team-a", nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]string
	decodeJSONBody(t, resp, &payload)
	assert.Equal(t, "Cluster group deleted", payload["message"])
	assert.Equal(t, "team-a", payload["name"])

	clusterGroupsMu.RLock()
	_, exists := clusterGroups["team-a"]
	clusterGroupsMu.RUnlock()
	assert.False(t, exists)
	mockStore.AssertExpectations(t)
}

func TestDeleteClusterGroup_ProtectsBuiltInGroup(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	env.App.Delete("/api/cluster-groups/:name", handler.DeleteClusterGroup)

	req := httptest.NewRequest(http.MethodDelete, "/api/cluster-groups/"+allHealthyClustersGroupName, nil)
	resp, err := env.App.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]string
	decodeJSONBody(t, resp, &payload)
	assert.Equal(t, "cannot delete a built-in group", payload["error"])
}

func TestPersistClusterGroup_SavesToStore(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "SaveClusterGroup")

	group := ClusterGroup{Name: "persisted", Kind: "static", Clusters: []string{"c1"}}
	mockStore.
		On("SaveClusterGroup", "persisted", mock.MatchedBy(func(data []byte) bool {
			var got ClusterGroup
			if err := json.Unmarshal(data, &got); err != nil {
				return false
			}
			return assert.ObjectsAreEqual(group, got)
		})).
		Return(nil).
		Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	handler.persistClusterGroup(context.Background(), group.Name, group)
	mockStore.AssertExpectations(t)
}

func TestPersistClusterGroup_NilStoreNoop(t *testing.T) {
	handler := NewWorkloadHandlers(nil, nil, nil)
	handler.persistClusterGroup(context.Background(), "ignored", ClusterGroup{Name: "ignored"})
}

func TestDeletePersistedClusterGroup_RemovesFromStore(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)
	mockStore.ExpectedCalls = filterExpectedCalls(mockStore.ExpectedCalls, "DeleteClusterGroup")
	mockStore.On("DeleteClusterGroup", "persisted").Return(nil).Once()

	handler := NewWorkloadHandlers(nil, env.Hub, env.Store)
	handler.deletePersistedClusterGroup(context.Background(), "persisted")
	mockStore.AssertExpectations(t)
}

func TestDeletePersistedClusterGroup_NilStoreNoop(t *testing.T) {
	handler := NewWorkloadHandlers(nil, nil, nil)
	handler.deletePersistedClusterGroup(context.Background(), "ignored")
}

func setClusterGroupsForTest(t testing.TB, groups ...ClusterGroup) {
	t.Helper()
	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup, len(groups))
	for _, group := range groups {
		clusterGroups[group.Name] = group
	}
	clusterGroupsMu.Unlock()
	t.Cleanup(func() {
		clusterGroupsMu.Lock()
		clusterGroups = make(map[string]ClusterGroup)
		clusterGroupsMu.Unlock()
	})
}

func decodeJSONBody(t *testing.T, resp *http.Response, target interface{}) {
	t.Helper()
	body := readBody(t, resp)
	require.NoError(t, json.Unmarshal([]byte(body), target))
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return string(bytes.TrimSpace(body))
}

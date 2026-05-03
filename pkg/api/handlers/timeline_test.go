package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestTimelineGetTimeline_Success(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	handler := NewTimelineHandler(env.Store, env.K8sClient)
	env.App.Get("/api/timeline", handler.GetTimeline)

	expectedEvents := []store.ClusterEvent{
		{
			ClusterName: "test-cluster",
			Namespace:   "default",
			EventType:   "Normal",
			Reason:      "Scheduled",
			Message:     "Successfully assigned default/pod to node-1",
		},
	}

	mockStore.On("QueryTimeline", mock.Anything).Return(expectedEvents, nil)

	req, err := http.NewRequest(http.MethodGet, "/api/timeline?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result []store.ClusterEvent
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "test-cluster", result[0].ClusterName)
}

func TestTimelineGetTimeline_Error(t *testing.T) {
	env := setupTestEnv(t)
	mockStore := env.Store.(*test.MockStore)

	handler := NewTimelineHandler(env.Store, env.K8sClient)
	env.App.Get("/api/timeline", handler.GetTimeline)

	mockStore.On("QueryTimeline", mock.Anything).Return(nil, assert.AnError)

	req, err := http.NewRequest(http.MethodGet, "/api/timeline", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

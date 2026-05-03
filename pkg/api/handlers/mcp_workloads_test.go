package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestGetPods(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/workloads/pods", handler.GetPods)

	scheme := newK8sScheme()
	pod := &corev1.Pod{
		TypeMeta: metav1.TypeMeta{Kind: "Pod", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pod",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{Name: "c1", Image: "nginx"}},
		},
	}

	injectDynamicClusterWithObjects(env, "test-cluster", scheme, []runtime.Object{pod}, pod)

	req, err := http.NewRequest("GET", "/api/mcp/workloads/pods?cluster=test-cluster&namespace=default", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var response map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &response)
	require.NoError(t, err)

	pods := response["pods"].([]interface{})
	assert.NotEmpty(t, pods)
	assert.Equal(t, "test-pod", pods[0].(map[string]interface{})["name"])
}

func TestFindPodIssues(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/workloads/pod-issues", handler.FindPodIssues)

	scheme := newK8sScheme()
	// Pod with issues (e.g., CrashLoopBackOff)
	pod := &corev1.Pod{
		TypeMeta: metav1.TypeMeta{Kind: "Pod", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "failing-pod",
			Namespace: "default",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name: "c1",
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason:  "CrashLoopBackOff",
							Message: "back-off 5m0s restarting failed container=c1 pod=failing-pod_default",
						},
					},
				},
			},
		},
	}

	injectDynamicClusterWithObjects(env, "test-cluster", scheme, []runtime.Object{pod}, pod)

	req, err := http.NewRequest("GET", "/api/mcp/workloads/pod-issues?cluster=test-cluster&namespace=default", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var response map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &response)
	require.NoError(t, err)

	issues := response["issues"].([]interface{})
	assert.NotEmpty(t, issues)
	assert.Equal(t, "failing-pod", issues[0].(map[string]interface{})["name"])
}

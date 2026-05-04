package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
)

func TestServer_HandleKagentCRDAgents(t *testing.T) {
	// 1. Setup fake dynamic client with an Agent CR
	agent := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "kagent.dev/v1alpha2",
			"kind":       "Agent",
			"metadata": map[string]interface{}{
				"name":      "test-agent",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"type": "standard",
				"tools": []interface{}{
					map[string]interface{}{"name": "t1"},
				},
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   "Ready",
						"status": "True",
					},
				},
			},
		},
	}

	scheme := runtime.NewScheme()
	fakeDyn := fake.NewSimpleDynamicClient(scheme, agent)

	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetDynamicClient("cluster1", fakeDyn)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 2. Test request
	req := httptest.NewRequest("GET", "/kagent-crds/agents?cluster=cluster1", nil)
	w := httptest.NewRecorder()

	s.handleKagentCRDAgents(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp struct {
		Agents []kagentCRDAgent `json:"agents"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(resp.Agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(resp.Agents))
	}

	if resp.Agents[0].Name != "test-agent" || resp.Agents[0].Status != "Ready" {
		t.Errorf("Unexpected agent data: %+v", resp.Agents[0])
	}
}

func TestServer_HandleKagentCRDSummary(t *testing.T) {
	scheme := runtime.NewScheme()
	listKinds := map[schema.GroupVersionResource]string{
		agentGVR:               "AgentList",
		toolServerGVR:          "ToolServerList",
		remoteMCPServerGVR:     "RemoteMCPServerList",
		modelConfigGVR:         "ModelConfigList",
		modelProviderConfigGVR: "ModelProviderConfigList",
		memoryGVR:              "MemoryList",
	}
	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, listKinds)

	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetDynamicClient("cluster1", fakeDyn)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/kagent-crds/summary?cluster=cluster1", nil)
	w := httptest.NewRecorder()

	s.handleKagentCRDSummary(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	agentCount, ok := resp["agentCount"].(float64)
	require.True(t, ok, "agentCount field missing or wrong type in response")
	if agentCount != 0 {
		t.Errorf("Expected 0 agents, got %v", agentCount)
	}
}

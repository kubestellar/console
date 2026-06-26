package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
)

func TestKagentiHandlers(t *testing.T) {
	// 1. Setup mock k8s client and server
	m, _ := k8s.NewMultiClusterClient("")

	scheme := runtime.NewScheme()

	agentObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "agent.kagenti.dev/v1alpha1",
			"kind":       "Agent",
			"metadata": map[string]interface{}{
				"name":      "agent1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"framework": "langchain",
				"replicas":  int64(2),
			},
			"status": map[string]interface{}{
				"phase": "Running",
			},
		},
	}

	buildObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "agent.kagenti.dev/v1alpha1",
			"kind":       "AgentBuild",
			"metadata": map[string]interface{}{
				"name":      "build1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"source": map[string]interface{}{"url": "http://git.com"},
			},
			"status": map[string]interface{}{
				"phase": "Building",
			},
		},
	}

	cardObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "agent.kagenti.dev/v1alpha1",
			"kind":       "AgentCard",
			"metadata":   map[string]interface{}{"name": "card1", "namespace": "default"},
		},
	}

	toolObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "mcp.kagenti.com/v1alpha1",
			"kind":       "MCPServer",
			"metadata":   map[string]interface{}{"name": "tool1", "namespace": "default"},
		},
	}

	fakeDyn := fake.NewSimpleDynamicClient(scheme, agentObj, buildObj, cardObj, toolObj)
	m.InjectDynamicClient("c1", fakeDyn)

	s := &Server{k8sClient: m}

	// 2. Test handleKagentiAgents
	t.Run("Agents", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/kagenti/agents?cluster=c1", nil)
		rr := httptest.NewRecorder()
		s.handleKagentiAgents(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status OK, got %d", rr.Code)
		}

		var resp map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &resp)
		agents, _ := resp["agents"].([]any)
		if len(agents) != 1 {
			t.Errorf("Expected 1 agent, got %d", len(agents))
		}
	})

	// 3. Test handleKagentiBuilds
	t.Run("Builds", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/kagenti/builds?cluster=c1", nil)
		rr := httptest.NewRecorder()
		s.handleKagentiBuilds(rr, req)

		var resp map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &resp)
		builds, _ := resp["builds"].([]any)
		if len(builds) != 1 {
			t.Errorf("Expected 1 build, got %d", len(builds))
		}
	})

	// 4. Test handleKagentiSummary
	t.Run("Summary", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/kagenti/summary?cluster=c1", nil)
		rr := httptest.NewRecorder()
		s.handleKagentiSummary(rr, req)

		var resp map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &resp)
		if resp["agentCount"].(float64) != 1 {
			t.Errorf("Expected agentCount 1, got %v", resp["agentCount"])
		}
		if resp["activeBuilds"].(float64) != 1 {
			t.Errorf("Expected activeBuilds 1, got %v", resp["activeBuilds"])
		}
	})
}

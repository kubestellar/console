package kagent

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/fake"
)

// --- Mocks ---

type mockHandlerContext struct {
	tokenValid bool
}

func (m *mockHandlerContext) SetCORSHeaders(w http.ResponseWriter, _ *http.Request, _ ...string) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
}

func (m *mockHandlerContext) ValidateToken(_ *http.Request) bool {
	return m.tokenValid
}

type mockDynamicClientGetter struct {
	client dynamic.Interface
	err    error
}

func (m *mockDynamicClientGetter) GetDynamicClient(_ string) (dynamic.Interface, error) {
	return m.client, m.err
}

// --- Helper function tests ---

func TestNestedString(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   string
	}{
		{"nil map", nil, []string{"key"}, ""},
		{"missing key", map[string]any{"other": "val"}, []string{"key"}, ""},
		{"found", map[string]any{"key": "val"}, []string{"key"}, "val"},
		{"nested", map[string]any{"a": map[string]any{"b": "deep"}}, []string{"a", "b"}, "deep"},
		{"wrong type", map[string]any{"key": 42}, []string{"key"}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nestedString(tt.obj, tt.fields...)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestNestedInt64(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   int64
	}{
		{"nil map", nil, []string{"key"}, 0},
		{"missing key", map[string]any{"other": int64(5)}, []string{"key"}, 0},
		{"found", map[string]any{"key": int64(42)}, []string{"key"}, 42},
		{"wrong type", map[string]any{"key": "not-int"}, []string{"key"}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nestedInt64(tt.obj, tt.fields...)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestNestedStringSlice(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   []string
	}{
		{"nil map", nil, []string{"key"}, nil},
		{"missing key", map[string]any{"other": []string{"a"}}, []string{"key"}, nil},
		{"found", map[string]any{"key": []any{"a", "b"}}, []string{"key"}, []string{"a", "b"}},
		{"wrong type", map[string]any{"key": "not-slice"}, []string{"key"}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nestedStringSlice(tt.obj, tt.fields...)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExtractConditionStatus(t *testing.T) {
	tests := []struct {
		name          string
		statusMap     map[string]any
		conditionType string
		want          bool
	}{
		{"no conditions field", map[string]any{}, "Ready", false},
		{"empty conditions", map[string]any{"conditions": []any{}}, "Ready", false},
		{"condition not found", map[string]any{
			"conditions": []any{
				map[string]any{"type": "Accepted", "status": "True"},
			},
		}, "Ready", false},
		{"condition found True", map[string]any{
			"conditions": []any{
				map[string]any{"type": "Ready", "status": "True"},
			},
		}, "Ready", true},
		{"condition found False", map[string]any{
			"conditions": []any{
				map[string]any{"type": "Ready", "status": "False"},
			},
		}, "Ready", false},
		{"invalid condition item type", map[string]any{
			"conditions": []any{"not-a-map"},
		}, "Ready", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractConditionStatus(tt.statusMap, tt.conditionType)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestIsCRDNotInstalledErr(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"regular error", errors.New("something"), false},
		{"NoKindMatchError", &meta.NoKindMatchError{
			GroupKind:        schema.GroupKind{Group: "kagent.dev", Kind: "Agent"},
			SearchedVersions: []string{"v1alpha2"},
		}, true},
		{"server could not find", errors.New("the server could not find the requested resource"), true},
		{"no matches for kind", errors.New("no matches for kind \"Agent\" in version"), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isCRDNotInstalledErr(tt.err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExtractDiscoveredTools(t *testing.T) {
	tests := []struct {
		name string
		m    map[string]any
		want []DiscoveredTool
	}{
		{"nil map", nil, nil},
		{"no discoveredTools", map[string]any{}, nil},
		{"empty list", map[string]any{"discoveredTools": []any{}}, []DiscoveredTool{}},
		{"valid tools", map[string]any{
			"discoveredTools": []any{
				map[string]any{"name": "tool1", "description": "desc1"},
				map[string]any{"name": "tool2", "description": "desc2"},
			},
		}, []DiscoveredTool{
			{Name: "tool1", Description: "desc1"},
			{Name: "tool2", Description: "desc2"},
		}},
		{"invalid item type skipped", map[string]any{
			"discoveredTools": []any{"not-a-map", map[string]any{"name": "t1", "description": "d1"}},
		}, []DiscoveredTool{{Name: "t1", Description: "d1"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDiscoveredTools(tt.m)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExtractDiscoveredModels(t *testing.T) {
	tests := []struct {
		name string
		m    map[string]any
		want []DiscoveredModel
	}{
		{"nil map", nil, nil},
		{"no discoveredModels", map[string]any{}, nil},
		{"empty list", map[string]any{"discoveredModels": []any{}}, []DiscoveredModel{}},
		{"valid models", map[string]any{
			"discoveredModels": []any{
				map[string]any{"name": "gpt-4", "description": "GPT-4"},
			},
		}, []DiscoveredModel{{Name: "gpt-4", Description: "GPT-4"}}},
		{"invalid item type skipped", map[string]any{
			"discoveredModels": []any{"not-a-map", map[string]any{"name": "m1", "description": "d1"}},
		}, []DiscoveredModel{{Name: "m1", Description: "d1"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDiscoveredModels(tt.m)
			assert.Equal(t, tt.want, got)
		})
	}
}

// --- HTTP Handler tests ---

func newFakeDynamicClient(objects ...runtime.Object) *fake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	return fake.NewSimpleDynamicClientWithCustomListKinds(scheme,
		map[schema.GroupVersionResource]string{
			AgentGVR:        "AgentList",
			KagentiAgentGVR: "AgentList",
		},
		objects...)
}

func TestHandleCRDAgents_OPTIONS(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: true}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("OPTIONS", "/api/kagent/agents", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
}

func TestHandleCRDAgents_Unauthorized(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: false}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestHandleCRDAgents_NilClient(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: true}, Client: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Empty(t, resp["agents"])
}

func TestHandleCRDAgents_MissingCluster(t *testing.T) {
	dynClient := newFakeDynamicClient()
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleCRDAgents_ClientError(t *testing.T) {
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{err: errors.New("connection refused")},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents?cluster=test", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestHandleCRDAgents_Success(t *testing.T) {
	agentObj := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "kagent.dev/v1alpha2",
		"kind":       "Agent",
		"metadata":   map[string]any{"name": "my-agent", "namespace": "default"},
		"spec": map[string]any{
			"type":           "chat",
			"runtime":        "autogen",
			"modelConfigRef": "gpt-4",
			"tools":          []any{map[string]any{"name": "tool1"}},
		},
		"status": map[string]any{
			"conditions": []any{
				map[string]any{"type": "Ready", "status": "True"},
			},
		},
	}}
	dynClient := newFakeDynamicClient(agentObj)
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents?cluster=test&namespace=default", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "agent", resp["source"])
	agents := resp["agents"].([]any)
	require.Len(t, agents, 1)
	agent := agents[0].(map[string]any)
	assert.Equal(t, "my-agent", agent["name"])
	assert.Equal(t, "chat", agent["agentType"])
	assert.Equal(t, "Ready", agent["status"])
	assert.Equal(t, float64(1), agent["toolCount"])
}

func TestHandleCRDAgents_EmptyList(t *testing.T) {
	// When no agents exist, handler returns empty list
	dynClient := newFakeDynamicClient()
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagent/agents?cluster=test", nil)
	h.HandleCRDAgents(w, r)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	agents := resp["agents"].([]any)
	assert.Empty(t, agents)
	assert.Equal(t, "agent", resp["source"])
}

func TestHandleKagentiAgents_OPTIONS(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: true}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("OPTIONS", "/api/kagenti/agents", nil)
	h.HandleKagentiAgents(w, r)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestHandleKagentiAgents_Unauthorized(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: false}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/agents", nil)
	h.HandleKagentiAgents(w, r)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestHandleKagentiAgents_NilClient(t *testing.T) {
	h := &Handlers{Ctx: &mockHandlerContext{tokenValid: true}, Client: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/agents", nil)
	h.HandleKagentiAgents(w, r)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHandleKagentiAgents_MissingCluster(t *testing.T) {
	dynClient := newFakeDynamicClient()
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/agents", nil)
	h.HandleKagentiAgents(w, r)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleKagentiAgents_Success(t *testing.T) {
	agentObj := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "Agent",
		"metadata": map[string]any{
			"name":              "kagenti-agent",
			"namespace":         "agents",
			"creationTimestamp": "2024-01-01T00:00:00Z",
		},
		"spec": map[string]any{
			"framework": "langchain",
			"protocol":  "a2a",
			"replicas":  int64(2),
		},
		"status": map[string]any{
			"phase":         "Running",
			"readyReplicas": int64(2),
		},
	}}
	dynClient := newFakeDynamicClient(agentObj)
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/agents?cluster=prod&namespace=agents", nil)
	h.HandleKagentiAgents(w, r)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	agents := resp["agents"].([]any)
	require.Len(t, agents, 1)
	agent := agents[0].(map[string]any)
	assert.Equal(t, "kagenti-agent", agent["name"])
	assert.Equal(t, "langchain", agent["framework"])
}

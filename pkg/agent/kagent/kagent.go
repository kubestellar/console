// Package kagent provides HTTP handlers for kagent.dev and kagenti CRD
// listing endpoints. It is extracted from the monolithic pkg/agent package
// to reduce file count and improve testability (#17124).
package kagent

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/httputil"
	"github.com/kubestellar/console/pkg/safego"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// DynamicClientGetter abstracts the ability to obtain a dynamic Kubernetes
// client for a given cluster context. This is the only dependency on the
// broader k8s client system.
type DynamicClientGetter interface {
	GetDynamicClient(contextName string) (dynamic.Interface, error)
}

// Handlers provides HTTP handlers for KAgent CRD listing endpoints.
type Handlers struct {
	Ctx    httputil.HandlerContext
	Client DynamicClientGetter // nil means no cluster access
}

// --- Constants ---

const (
	crdTimeout        = 30 * time.Second
	crdPerCallTimeout = 15 * time.Second
)

// --- GVR definitions (kagent.dev) ---

var (
	AgentGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "agents",
	}
	ModelConfigGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "modelconfigs",
	}
	ModelProviderConfigGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "modelproviderconfigs",
	}
	ToolServerGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "toolservers",
	}
	RemoteMCPServerGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "remotemcpservers",
	}
	MemoryGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "memories",
	}
)

// --- GVR definitions (kagenti) ---

var (
	KagentiAgentGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agents",
	}
	KagentiBuildGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agentbuilds",
	}
	KagentiCardGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agentcards",
	}
	KagentiToolGVR = schema.GroupVersionResource{
		Group: "mcp.kagenti.com", Version: "v1alpha1", Resource: "mcpservers",
	}
)

// --- Response types (kagent CRDs) ---

type CRDAgent struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Cluster        string `json:"cluster"`
	AgentType      string `json:"agentType"`
	Runtime        string `json:"runtime"`
	Status         string `json:"status"`
	ModelConfigRef string `json:"modelConfigRef"`
	ToolCount      int    `json:"toolCount"`
}

type CRDTool struct {
	Name            string             `json:"name"`
	Namespace       string             `json:"namespace"`
	Cluster         string             `json:"cluster"`
	Kind            string             `json:"kind"`
	URL             string             `json:"url"`
	Config          string             `json:"config"`
	DiscoveredTools []DiscoveredTool   `json:"discoveredTools"`
}

type DiscoveredTool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CRDModel struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster"`
	Kind             string            `json:"kind"`
	Provider         string            `json:"provider"`
	Model            string            `json:"model"`
	DiscoveredModels []DiscoveredModel `json:"discoveredModels,omitempty"`
}

type DiscoveredModel struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CRDMemory struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Provider  string `json:"provider"`
}

// --- Response types (kagenti) ---

type Agent struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Replicas      int64  `json:"replicas"`
	ReadyReplicas int64  `json:"readyReplicas"`
	Framework     string `json:"framework"`
	Protocol      string `json:"protocol"`
	Image         string `json:"image"`
	CreatedAt     string `json:"createdAt"`
}

type Build struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Status         string `json:"status"`
	Source         string `json:"source"`
	Pipeline       string `json:"pipeline"`
	Mode           string `json:"mode"`
	StartTime      string `json:"startTime"`
	CompletionTime string `json:"completionTime"`
}

type Card struct {
	Name            string   `json:"name"`
	Namespace       string   `json:"namespace"`
	AgentName       string   `json:"agentName"`
	Skills          []string `json:"skills"`
	Capabilities    []string `json:"capabilities"`
	SyncPeriod      string   `json:"syncPeriod"`
	IdentityBinding string   `json:"identityBinding"`
}

type Tool struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	ToolPrefix    string `json:"toolPrefix"`
	TargetRef     string `json:"targetRef"`
	HasCredential bool   `json:"hasCredential"`
}

// --- Helpers ---

func nestedString(obj map[string]any, fields ...string) string {
	val, found, err := unstructured.NestedString(obj, fields...)
	if err != nil || !found {
		return ""
	}
	return val
}

func nestedInt64(obj map[string]any, fields ...string) int64 {
	val, found, err := unstructured.NestedInt64(obj, fields...)
	if err != nil || !found {
		return 0
	}
	return val
}

func nestedStringSlice(obj map[string]any, fields ...string) []string {
	val, found, err := unstructured.NestedStringSlice(obj, fields...)
	if err != nil || !found {
		return nil
	}
	return val
}

func extractConditionStatus(statusMap map[string]any, conditionType string) bool {
	conditions, found, _ := unstructured.NestedSlice(statusMap, "conditions")
	if !found {
		return false
	}
	for _, c := range conditions {
		cMap, ok := c.(map[string]any)
		if !ok {
			continue
		}
		if nestedString(cMap, "type") == conditionType {
			return nestedString(cMap, "status") == "True"
		}
	}
	return false
}

func isCRDNotInstalledErr(err error) bool {
	if err == nil {
		return false
	}
	if _, ok := err.(*meta.NoKindMatchError); ok {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "the server could not find the requested resource") ||
		strings.Contains(msg, "no matches for kind")
}

func extractDiscoveredTools(statusMap map[string]any) []DiscoveredTool {
	toolsList, found, _ := unstructured.NestedSlice(statusMap, "discoveredTools")
	if !found {
		return nil
	}
	tools := make([]DiscoveredTool, 0, len(toolsList))
	for _, item := range toolsList {
		toolMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tools = append(tools, DiscoveredTool{
			Name:        nestedString(toolMap, "name"),
			Description: nestedString(toolMap, "description"),
		})
	}
	return tools
}

func extractDiscoveredModels(statusMap map[string]any) []DiscoveredModel {
	modelsList, found, _ := unstructured.NestedSlice(statusMap, "discoveredModels")
	if !found {
		return nil
	}
	models := make([]DiscoveredModel, 0, len(modelsList))
	for _, item := range modelsList {
		modelMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		models = append(models, DiscoveredModel{
			Name:        nestedString(modelMap, "name"),
			Description: nestedString(modelMap, "description"),
		})
	}
	return models
}

// --- kagent.dev CRD Handlers ---

func (h *Handlers) HandleCRDAgents(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"agents": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"agents": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent agents for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"agents": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(AgentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(AgentGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		httputil.WriteJSON(w, map[string]any{"agents": []any{}})
		return
	}

	agents := make([]CRDAgent, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)
		statusMap, _ := item.Object["status"].(map[string]any)

		a := CRDAgent{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Cluster:   cluster,
			Status:    "Unknown",
		}
		if specMap != nil {
			a.AgentType = nestedString(specMap, "type")
			a.Runtime = nestedString(specMap, "runtime")
			a.ModelConfigRef = nestedString(specMap, "modelConfigRef")
			if toolsSlice, found, _ := unstructured.NestedSlice(specMap, "tools"); found {
				a.ToolCount = len(toolsSlice)
			}
		}
		if statusMap != nil {
			switch {
			case extractConditionStatus(statusMap, "Ready"):
				a.Status = "Ready"
			case extractConditionStatus(statusMap, "Accepted"):
				a.Status = "Accepted"
			default:
				if phase := nestedString(statusMap, "phase"); phase != "" {
					a.Status = phase
				}
			}
		}
		agents = append(agents, a)
	}

	httputil.WriteJSON(w, map[string]any{"agents": agents, "source": "agent"})
}

func (h *Handlers) HandleCRDTools(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"tools": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"tools": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent tools for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"tools": []any{}, "error": "internal server error"})
		return
	}

	tools := make([]CRDTool, 0)

	// ToolServers
	var tsList *unstructured.UnstructuredList
	if namespace != "" {
		tsList, err = dynClient.Resource(ToolServerGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		tsList, err = dynClient.Resource(ToolServerGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range tsList.Items {
			specMap, _ := item.Object["spec"].(map[string]any)
			statusMap, _ := item.Object["status"].(map[string]any)
			t := CRDTool{
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Cluster:   cluster,
				Kind:      "ToolServer",
			}
			if specMap != nil {
				t.URL = nestedString(specMap, "url")
				t.Config = nestedString(specMap, "config")
			}
			if statusMap != nil {
				t.DiscoveredTools = extractDiscoveredTools(statusMap)
			}
			tools = append(tools, t)
		}
	}

	// RemoteMCPServers
	var rmsList *unstructured.UnstructuredList
	if namespace != "" {
		rmsList, err = dynClient.Resource(RemoteMCPServerGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		rmsList, err = dynClient.Resource(RemoteMCPServerGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range rmsList.Items {
			specMap, _ := item.Object["spec"].(map[string]any)
			statusMap, _ := item.Object["status"].(map[string]any)
			t := CRDTool{
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Cluster:   cluster,
				Kind:      "RemoteMCPServer",
			}
			if specMap != nil {
				t.URL = nestedString(specMap, "url")
				t.Config = nestedString(specMap, "config")
			}
			if statusMap != nil {
				t.DiscoveredTools = extractDiscoveredTools(statusMap)
			}
			tools = append(tools, t)
		}
	}

	httputil.WriteJSON(w, map[string]any{"tools": tools, "source": "agent"})
}

func (h *Handlers) HandleCRDModels(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"models": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"models": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent models for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"models": []any{}, "error": "internal server error"})
		return
	}

	models := make([]CRDModel, 0)

	// ModelConfigs
	var mcList *unstructured.UnstructuredList
	if namespace != "" {
		mcList, err = dynClient.Resource(ModelConfigGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		mcList, err = dynClient.Resource(ModelConfigGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range mcList.Items {
			specMap, _ := item.Object["spec"].(map[string]any)
			m := CRDModel{
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Cluster:   cluster,
				Kind:      "ModelConfig",
			}
			if specMap != nil {
				m.Provider = nestedString(specMap, "provider")
				m.Model = nestedString(specMap, "model")
			}
			models = append(models, m)
		}
	}

	// ModelProviderConfigs
	var mpcList *unstructured.UnstructuredList
	if namespace != "" {
		mpcList, err = dynClient.Resource(ModelProviderConfigGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		mpcList, err = dynClient.Resource(ModelProviderConfigGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range mpcList.Items {
			specMap, _ := item.Object["spec"].(map[string]any)
			statusMap, _ := item.Object["status"].(map[string]any)
			m := CRDModel{
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Cluster:   cluster,
				Kind:      "ModelProviderConfig",
			}
			if specMap != nil {
				m.Provider = nestedString(specMap, "provider")
				m.Model = nestedString(specMap, "model")
			}
			if statusMap != nil {
				m.DiscoveredModels = extractDiscoveredModels(statusMap)
			}
			models = append(models, m)
		}
	}

	httputil.WriteJSON(w, map[string]any{"models": models, "source": "agent"})
}

func (h *Handlers) HandleCRDMemories(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"memories": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"memories": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent memories for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"memories": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(MemoryGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(MemoryGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		httputil.WriteJSON(w, map[string]any{"memories": []any{}})
		return
	}

	memories := make([]CRDMemory, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)
		m := CRDMemory{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Cluster:   cluster,
		}
		if specMap != nil {
			m.Provider = nestedString(specMap, "provider")
		}
		memories = append(memories, m)
	}

	httputil.WriteJSON(w, map[string]any{"memories": memories, "source": "agent"})
}

func (h *Handlers) HandleCRDSummary(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{
			"agentCount": 0, "toolServerCount": 0, "remoteMCPServerCount": 0,
			"modelConfigCount": 0, "modelProviderConfigCount": 0, "memoryCount": 0,
			"byCluster": map[string]any{}, "byProvider": map[string]int{},
		})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"error": "cluster parameter required"})
		return
	}

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent CRD summary for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{
			"agentCount": 0, "toolServerCount": 0, "remoteMCPServerCount": 0,
			"modelConfigCount": 0, "modelProviderConfigCount": 0, "memoryCount": 0,
			"byCluster": map[string]any{}, "byProvider": map[string]int{},
			"error": "internal server error",
		})
		return
	}

	var agentCount, toolServerCount, remoteMCPServerCount int
	var modelConfigCount, modelProviderConfigCount, memoryCount int
	var mu sync.Mutex
	byProvider := map[string]int{}

	const numCRDQueries = 6
	warnings := make([]string, 0, numCRDQueries)

	var wg sync.WaitGroup
	wg.Add(numCRDQueries)

	safego.GoWith("kagent-crds/agents", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		agentList, listErr := dynClient.Resource(AgentGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: agents query failed", "error", listErr)
			warnings = append(warnings, "agents query timed out or failed")
			return
		}
		agentCount = len(agentList.Items)
	})

	safego.GoWith("kagent-crds/tool-servers", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		tsList, listErr := dynClient.Resource(ToolServerGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: toolServers query failed", "error", listErr)
			warnings = append(warnings, "toolServers query timed out or failed")
			return
		}
		toolServerCount = len(tsList.Items)
	})

	safego.GoWith("kagent-crds/remote-mcp-servers", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		rmsList, listErr := dynClient.Resource(RemoteMCPServerGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: remoteMCPServers query failed", "error", listErr)
			warnings = append(warnings, "remoteMCPServers query timed out or failed")
			return
		}
		remoteMCPServerCount = len(rmsList.Items)
	})

	safego.GoWith("kagent-crds/model-configs", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		mcList, listErr := dynClient.Resource(ModelConfigGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: modelConfigs query failed", "error", listErr)
			warnings = append(warnings, "modelConfigs query timed out or failed")
			return
		}
		modelConfigCount = len(mcList.Items)
		for _, item := range mcList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if ok && specMap != nil {
				provider := nestedString(specMap, "provider")
				if provider != "" {
					byProvider[provider]++
				}
			}
		}
	})

	safego.GoWith("kagent-crds/model-provider-configs", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		mpcList, listErr := dynClient.Resource(ModelProviderConfigGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: modelProviderConfigs query failed", "error", listErr)
			warnings = append(warnings, "modelProviderConfigs query timed out or failed")
			return
		}
		modelProviderConfigCount = len(mpcList.Items)
		for _, item := range mpcList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if ok && specMap != nil {
				provider := nestedString(specMap, "provider")
				if provider != "" {
					byProvider[provider]++
				}
			}
		}
	})

	safego.GoWith("kagent-crds/memories", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		memList, listErr := dynClient.Resource(MemoryGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: memories query failed", "error", listErr)
			warnings = append(warnings, "memories query timed out or failed")
			return
		}
		memoryCount = len(memList.Items)
	})

	wg.Wait()

	byCluster := map[string]any{
		cluster: map[string]int{
			"agents":               agentCount,
			"toolServers":          toolServerCount,
			"remoteMCPServers":     remoteMCPServerCount,
			"modelConfigs":         modelConfigCount,
			"modelProviderConfigs": modelProviderConfigCount,
			"memories":             memoryCount,
		},
	}

	result := map[string]any{
		"agentCount":               agentCount,
		"toolServerCount":          toolServerCount,
		"remoteMCPServerCount":     remoteMCPServerCount,
		"modelConfigCount":         modelConfigCount,
		"modelProviderConfigCount": modelProviderConfigCount,
		"memoryCount":              memoryCount,
		"byCluster":                byCluster,
		"byProvider":               byProvider,
		"source":                   "agent",
	}
	if len(warnings) > 0 {
		result["warnings"] = warnings
	}

	httputil.WriteJSON(w, result)
}

// --- kagenti Handlers ---

func (h *Handlers) HandleKagentiAgents(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"agents": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"agents": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching agents", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"agents": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(KagentiAgentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(KagentiAgentGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			httputil.WriteJSON(w, map[string]any{"agents": []any{}})
			return
		}
		slog.Warn("error listing kagenti agents", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"agents": []any{}, "error": "internal server error"})
		return
	}

	agents := make([]Agent, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)
		statusMap, _ := item.Object["status"].(map[string]any)

		a := Agent{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			CreatedAt: item.GetCreationTimestamp().Format(time.RFC3339),
		}
		if specMap != nil {
			a.Framework = nestedString(specMap, "framework")
			a.Protocol = nestedString(specMap, "protocol")
			a.Image = nestedString(specMap, "image")
			if replicas, found, err := unstructured.NestedInt64(specMap, "replicas"); err == nil && found {
				a.Replicas = replicas
			} else {
				a.Replicas = 1
			}
		}
		if statusMap != nil {
			a.Status = nestedString(statusMap, "phase")
			a.ReadyReplicas = nestedInt64(statusMap, "readyReplicas")
		}
		if a.Status == "" {
			a.Status = "Unknown"
		}
		agents = append(agents, a)
	}

	httputil.WriteJSON(w, map[string]any{"agents": agents, "source": "agent"})
}

func (h *Handlers) HandleKagentiBuilds(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"builds": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"builds": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching builds", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"builds": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(KagentiBuildGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(KagentiBuildGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			httputil.WriteJSON(w, map[string]any{"builds": []any{}})
			return
		}
		slog.Warn("error listing kagenti builds", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"builds": []any{}, "error": "internal server error"})
		return
	}

	builds := make([]Build, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)
		statusMap, _ := item.Object["status"].(map[string]any)

		b := Build{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			b.Source = nestedString(specMap, "source")
			b.Pipeline = nestedString(specMap, "pipeline")
			b.Mode = nestedString(specMap, "mode")
		}
		if statusMap != nil {
			b.Status = nestedString(statusMap, "phase")
			b.StartTime = nestedString(statusMap, "startTime")
			b.CompletionTime = nestedString(statusMap, "completionTime")
		}
		if b.Status == "" {
			b.Status = "Unknown"
		}
		builds = append(builds, b)
	}

	httputil.WriteJSON(w, map[string]any{"builds": builds, "source": "agent"})
}

func (h *Handlers) HandleKagentiCards(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"cards": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"cards": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching cards", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"cards": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(KagentiCardGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(KagentiCardGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			httputil.WriteJSON(w, map[string]any{"cards": []any{}})
			return
		}
		slog.Warn("error listing kagenti cards", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"cards": []any{}, "error": "internal server error"})
		return
	}

	cards := make([]Card, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)

		c := Card{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			c.AgentName = nestedString(specMap, "agentName")
			c.Skills = nestedStringSlice(specMap, "skills")
			c.Capabilities = nestedStringSlice(specMap, "capabilities")
			c.SyncPeriod = nestedString(specMap, "syncPeriod")
			c.IdentityBinding = nestedString(specMap, "identityBinding")
		}
		cards = append(cards, c)
	}

	httputil.WriteJSON(w, map[string]any{"cards": cards, "source": "agent"})
}

func (h *Handlers) HandleKagentiTools(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{"tools": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"tools": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), crdTimeout)
	defer cancel()

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching tools", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"tools": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(KagentiToolGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(KagentiToolGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			httputil.WriteJSON(w, map[string]any{"tools": []any{}})
			return
		}
		slog.Warn("error listing kagenti tools", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{"tools": []any{}, "error": "internal server error"})
		return
	}

	tools := make([]Tool, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, _ := item.Object["spec"].(map[string]any)

		t := Tool{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			t.ToolPrefix = nestedString(specMap, "toolPrefix")
			t.TargetRef = nestedString(specMap, "targetRef")
			if _, found, _ := unstructured.NestedMap(specMap, "credential"); found {
				t.HasCredential = true
			}
		}
		tools = append(tools, t)
	}

	httputil.WriteJSON(w, map[string]any{"tools": tools, "source": "agent"})
}

func (h *Handlers) HandleKagentiSummary(w http.ResponseWriter, r *http.Request) {
	h.Ctx.SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !h.Ctx.ValidateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.Client == nil {
		httputil.WriteJSON(w, map[string]any{
			"agentCount": 0, "readyAgents": 0, "buildCount": 0,
			"activeBuilds": 0, "toolCount": 0, "cardCount": 0,
			"frameworks": map[string]int{},
		})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		httputil.WriteJSON(w, map[string]any{"error": "cluster parameter required"})
		return
	}

	dynClient, err := h.Client.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagenti summary", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		httputil.WriteJSON(w, map[string]any{
			"agentCount": 0, "readyAgents": 0, "buildCount": 0,
			"activeBuilds": 0, "toolCount": 0, "cardCount": 0,
			"frameworks": map[string]int{}, "error": "internal server error",
		})
		return
	}

	var (
		mu                                                sync.Mutex
		agentCount, readyAgents, buildCount, activeBuilds int
		toolCount, cardCount                              int
		frameworks                                        = map[string]int{}
		wg                                                sync.WaitGroup
	)
	const numKagentiCRDQueries = 4
	wg.Add(numKagentiCRDQueries)

	safego.GoWith("kagenti-summary/agents", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		agentList, listErr := dynClient.Resource(KagentiAgentGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: agents query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		agentCount = len(agentList.Items)
		for _, item := range agentList.Items {
			statusMap, _ := item.Object["status"].(map[string]any)
			specMap, _ := item.Object["spec"].(map[string]any)
			if statusMap != nil {
				phase := nestedString(statusMap, "phase")
				if phase == "Running" || phase == "Ready" {
					readyAgents++
				}
			}
			if specMap != nil {
				fw := nestedString(specMap, "framework")
				if fw != "" {
					frameworks[fw]++
				}
			}
		}
	})

	safego.GoWith("kagenti-summary/builds", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		buildList, listErr := dynClient.Resource(KagentiBuildGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: builds query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		buildCount = len(buildList.Items)
		for _, item := range buildList.Items {
			statusMap, _ := item.Object["status"].(map[string]any)
			if statusMap != nil {
				phase := nestedString(statusMap, "phase")
				if phase == "Building" || phase == "Pending" {
					activeBuilds++
				}
			}
		}
	})

	safego.GoWith("kagenti-summary/tools", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		toolList, listErr := dynClient.Resource(KagentiToolGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: tools query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		toolCount = len(toolList.Items)
	})

	safego.GoWith("kagenti-summary/cards", func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), crdPerCallTimeout)
		defer cancel()
		cardList, listErr := dynClient.Resource(KagentiCardGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: cards query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		cardCount = len(cardList.Items)
	})

	wg.Wait()

	httputil.WriteJSON(w, map[string]any{
		"agentCount":   agentCount,
		"readyAgents":  readyAgents,
		"buildCount":   buildCount,
		"activeBuilds": activeBuilds,
		"toolCount":    toolCount,
		"cardCount":    cardCount,
		"frameworks":   frameworks,
		"source":       "agent",
	})
}

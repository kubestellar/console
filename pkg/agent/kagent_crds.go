package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	// kagentCRDTimeout is the shared context timeout for sequential CRD operations
	kagentCRDTimeout = 30 * time.Second
	// kagentCRDPerCallTimeout is the per-call timeout when CRD calls run concurrently
	kagentCRDPerCallTimeout = 15 * time.Second
)

// kagent.dev CRD Group/Version/Resource definitions
var (
	// v1alpha2 resources
	agentGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha2",
		Resource: "agents",
	}
	modelConfigGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha2",
		Resource: "modelconfigs",
	}
	modelProviderConfigGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha2",
		Resource: "modelproviderconfigs",
	}

	// v1alpha1 resources
	toolServerGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha1",
		Resource: "toolservers",
	}
	remoteMCPServerGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha1",
		Resource: "remotemcpservers",
	}
	memoryGVR = schema.GroupVersionResource{
		Group:    "kagent.dev",
		Version:  "v1alpha1",
		Resource: "memories",
	}
)

// kagentCRDAgent is the JSON response shape for a kagent.dev Agent CR
type kagentCRDAgent struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Cluster        string `json:"cluster"`
	Type           string `json:"type"`
	Runtime        string `json:"runtime"`
	Ready          bool   `json:"ready"`
	Accepted       bool   `json:"accepted"`
	ModelConfigRef string `json:"modelConfigRef"`
	ToolCount      int    `json:"toolCount"`
}

// kagentCRDTool is the JSON response shape for a kagent.dev ToolServer or RemoteMCPServer CR
type kagentCRDTool struct {
	Name            string              `json:"name"`
	Namespace       string              `json:"namespace"`
	Cluster         string              `json:"cluster"`
	Kind            string              `json:"kind"`
	URL             string              `json:"url"`
	Config          string              `json:"config"`
	DiscoveredTools []discoveredToolRef `json:"discoveredTools"`
}

type discoveredToolRef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// kagentCRDModel is the JSON response shape for a kagent.dev ModelConfig or ModelProviderConfig CR
type kagentCRDModel struct {
	Name             string               `json:"name"`
	Namespace        string               `json:"namespace"`
	Cluster          string               `json:"cluster"`
	Kind             string               `json:"kind"`
	Provider         string               `json:"provider"`
	Model            string               `json:"model"`
	DiscoveredModels []discoveredModelRef `json:"discoveredModels,omitempty"`
}

type discoveredModelRef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// kagentCRDMemory is the JSON response shape for a kagent.dev Memory CR
type kagentCRDMemory struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Provider  string `json:"provider"`
}

// handleKagentCRDAgents returns kagent.dev Agent CRDs for a cluster
func (s *Server) handleKagentCRDAgents(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentCRDTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent agents for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(agentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(agentGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		// CRD not installed is expected — return empty list, not error
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}})
		return
	}

	agents := make([]kagentCRDAgent, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, ok := item.Object["spec"].(map[string]any)
		if !ok {
			specMap = nil
		}
		statusMap, ok := item.Object["status"].(map[string]any)
		if !ok {
			statusMap = nil
		}

		a := kagentCRDAgent{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Cluster:   cluster,
		}
		if specMap != nil {
			a.Type = nestedString(specMap, "type")
			a.Runtime = nestedString(specMap, "runtime")
			a.ModelConfigRef = nestedString(specMap, "modelConfigRef")
			// Count tools from spec.tools array
			if toolsSlice, found, _ := unstructured.NestedSlice(specMap, "tools"); found {
				a.ToolCount = len(toolsSlice)
			}
		}
		if statusMap != nil {
			a.Ready = extractConditionStatus(statusMap, "Ready")
			a.Accepted = extractConditionStatus(statusMap, "Accepted")
		}
		agents = append(agents, a)
	}

	json.NewEncoder(w).Encode(map[string]any{"agents": agents, "source": "agent"})
}

// extractConditionStatus checks status.conditions for a condition type and returns whether its status is "True"
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

// handleKagentCRDTools returns kagent.dev ToolServer and RemoteMCPServer CRDs for a cluster
func (s *Server) handleKagentCRDTools(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentCRDTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent tools for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": "internal server error"})
		return
	}

	tools := make([]kagentCRDTool, 0)

	// Query ToolServers
	var tsList *unstructured.UnstructuredList
	if namespace != "" {
		tsList, err = dynClient.Resource(toolServerGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		tsList, err = dynClient.Resource(toolServerGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range tsList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if !ok {
				specMap = nil
			}
			statusMap, ok := item.Object["status"].(map[string]any)
			if !ok {
				statusMap = nil
			}

			t := kagentCRDTool{
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

	// Query RemoteMCPServers
	var rmsList *unstructured.UnstructuredList
	if namespace != "" {
		rmsList, err = dynClient.Resource(remoteMCPServerGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		rmsList, err = dynClient.Resource(remoteMCPServerGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range rmsList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if !ok {
				specMap = nil
			}
			statusMap, ok := item.Object["status"].(map[string]any)
			if !ok {
				statusMap = nil
			}

			t := kagentCRDTool{
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

	json.NewEncoder(w).Encode(map[string]any{"tools": tools, "source": "agent"})
}

// extractDiscoveredTools extracts status.discoveredTools as a slice of {name, description}
func extractDiscoveredTools(statusMap map[string]any) []discoveredToolRef {
	items, found, _ := unstructured.NestedSlice(statusMap, "discoveredTools")
	if !found {
		return nil
	}
	result := make([]discoveredToolRef, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, discoveredToolRef{
			Name:        nestedString(m, "name"),
			Description: nestedString(m, "description"),
		})
	}
	return result
}

// handleKagentCRDModels returns kagent.dev ModelConfig and ModelProviderConfig CRDs for a cluster
func (s *Server) handleKagentCRDModels(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"models": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"models": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentCRDTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent models for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"models": []any{}, "error": "internal server error"})
		return
	}

	models := make([]kagentCRDModel, 0)

	// Query ModelConfigs
	var mcList *unstructured.UnstructuredList
	if namespace != "" {
		mcList, err = dynClient.Resource(modelConfigGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		mcList, err = dynClient.Resource(modelConfigGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range mcList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if !ok {
				specMap = nil
			}

			m := kagentCRDModel{
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

	// Query ModelProviderConfigs
	var mpcList *unstructured.UnstructuredList
	if namespace != "" {
		mpcList, err = dynClient.Resource(modelProviderConfigGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		mpcList, err = dynClient.Resource(modelProviderConfigGVR).List(ctx, metav1.ListOptions{})
	}
	if err == nil {
		for _, item := range mpcList.Items {
			specMap, ok := item.Object["spec"].(map[string]any)
			if !ok {
				specMap = nil
			}
			statusMap, ok := item.Object["status"].(map[string]any)
			if !ok {
				statusMap = nil
			}

			m := kagentCRDModel{
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

	json.NewEncoder(w).Encode(map[string]any{"models": models, "source": "agent"})
}

// extractDiscoveredModels extracts status.discoveredModels as a slice of {name, description}
func extractDiscoveredModels(statusMap map[string]any) []discoveredModelRef {
	items, found, _ := unstructured.NestedSlice(statusMap, "discoveredModels")
	if !found {
		return nil
	}
	result := make([]discoveredModelRef, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, discoveredModelRef{
			Name:        nestedString(m, "name"),
			Description: nestedString(m, "description"),
		})
	}
	return result
}

// handleKagentCRDMemories returns kagent.dev Memory CRDs for a cluster
func (s *Server) handleKagentCRDMemories(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"memories": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"memories": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentCRDTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent memories for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"memories": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(memoryGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(memoryGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"memories": []any{}})
		return
	}

	memories := make([]kagentCRDMemory, 0, len(list.Items))
	for _, item := range list.Items {
		specMap, ok := item.Object["spec"].(map[string]any)
		if !ok {
			specMap = nil
		}

		m := kagentCRDMemory{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Cluster:   cluster,
		}
		if specMap != nil {
			m.Provider = nestedString(specMap, "provider")
		}
		memories = append(memories, m)
	}

	json.NewEncoder(w).Encode(map[string]any{"memories": memories, "source": "agent"})
}

// handleKagentCRDSummary returns an aggregated summary of kagent.dev resources for a cluster.
// All 6 CRD queries run concurrently with per-call timeouts to prevent slow calls from
// starving later ones (fixes #5354).
func (s *Server) handleKagentCRDSummary(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{
			"agentCount": 0, "toolServerCount": 0, "remoteMCPServerCount": 0,
			"modelConfigCount": 0, "modelProviderConfigCount": 0, "memoryCount": 0,
			"byCluster": map[string]any{}, "byProvider": map[string]int{},
		})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"error": "cluster parameter required"})
		return
	}

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagent CRD summary for cluster", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
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
	var warnings []string

	var wg sync.WaitGroup
	const numCRDQueries = 6
	wg.Add(numCRDQueries)

	// Count agents
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		agentList, listErr := dynClient.Resource(agentGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: agents query failed", "error", listErr)
			warnings = append(warnings, "agents query timed out or failed")
			return
		}
		agentCount = len(agentList.Items)
	}()

	// Count tool servers
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		tsList, listErr := dynClient.Resource(toolServerGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: toolServers query failed", "error", listErr)
			warnings = append(warnings, "toolServers query timed out or failed")
			return
		}
		toolServerCount = len(tsList.Items)
	}()

	// Count remote MCP servers
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		rmsList, listErr := dynClient.Resource(remoteMCPServerGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: remoteMCPServers query failed", "error", listErr)
			warnings = append(warnings, "remoteMCPServers query timed out or failed")
			return
		}
		remoteMCPServerCount = len(rmsList.Items)
	}()

	// Count model configs and collect providers
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		mcList, listErr := dynClient.Resource(modelConfigGVR).List(ctx, metav1.ListOptions{})
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
	}()

	// Count model provider configs and collect providers
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		mpcList, listErr := dynClient.Resource(modelProviderConfigGVR).List(ctx, metav1.ListOptions{})
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
	}()

	// Count memories
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentCRDPerCallTimeout)
		defer cancel()
		memList, listErr := dynClient.Resource(memoryGVR).List(ctx, metav1.ListOptions{})
		mu.Lock()
		defer mu.Unlock()
		if listErr != nil {
			slog.Warn("kagent CRD summary: memories query failed", "error", listErr)
			warnings = append(warnings, "memories query timed out or failed")
			return
		}
		memoryCount = len(memList.Items)
	}()

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

	json.NewEncoder(w).Encode(result)
}

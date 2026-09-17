package kagent

import (
	"context"
	"log/slog"
	"net/http"
	"sync"

	"github.com/kubestellar/console/pkg/agent/httputil"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/sanitize"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

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
		slog.Warn("error fetching kagent agents for cluster", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error fetching kagent tools for cluster", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error fetching kagent models for cluster", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error fetching kagent memories for cluster", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error fetching kagent CRD summary for cluster", "error", sanitize.LogString(err.Error()))
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

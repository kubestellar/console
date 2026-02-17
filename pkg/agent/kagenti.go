package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	kagentiTimeout = 30 * time.Second
)

// Kagenti CRD Group/Version/Resource definitions
var (
	kagentiAgentGVR = schema.GroupVersionResource{
		Group:    "agent.kagenti.dev",
		Version:  "v1alpha1",
		Resource: "agents",
	}
	kagentiBuildGVR = schema.GroupVersionResource{
		Group:    "agent.kagenti.dev",
		Version:  "v1alpha1",
		Resource: "agentbuilds",
	}
	kagentiCardGVR = schema.GroupVersionResource{
		Group:    "agent.kagenti.dev",
		Version:  "v1alpha1",
		Resource: "agentcards",
	}
	kagentiToolGVR = schema.GroupVersionResource{
		Group:    "mcp.kagenti.com",
		Version:  "v1alpha1",
		Resource: "mcpservers",
	}
)

// kagentiAgent is the JSON response shape for a kagenti Agent CRD
type kagentiAgent struct {
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

// kagentiBuild is the JSON response shape for a kagenti AgentBuild CRD
type kagentiBuild struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Status         string `json:"status"`
	Source         string `json:"source"`
	Pipeline       string `json:"pipeline"`
	Mode           string `json:"mode"`
	StartTime      string `json:"startTime"`
	CompletionTime string `json:"completionTime"`
}

// kagentiCard is the JSON response shape for a kagenti AgentCard CRD
type kagentiCard struct {
	Name            string   `json:"name"`
	Namespace       string   `json:"namespace"`
	AgentName       string   `json:"agentName"`
	Skills          []string `json:"skills"`
	Capabilities    []string `json:"capabilities"`
	SyncPeriod      string   `json:"syncPeriod"`
	IdentityBinding string   `json:"identityBinding"`
}

// kagentiTool is the JSON response shape for a kagenti MCPServer CRD
type kagentiTool struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	ToolPrefix    string `json:"toolPrefix"`
	TargetRef     string `json:"targetRef"`
	HasCredential bool   `json:"hasCredential"`
}

// Helper to safely extract nested string fields from unstructured objects
func nestedString(obj map[string]any, fields ...string) string {
	val, found, err := unstructured.NestedString(obj, fields...)
	if err != nil || !found {
		return ""
	}
	return val
}

// Helper to safely extract nested int64 fields
func nestedInt64(obj map[string]any, fields ...string) int64 {
	val, found, err := unstructured.NestedInt64(obj, fields...)
	if err != nil || !found {
		return 0
	}
	return val
}

// Helper to extract a string slice from unstructured
func nestedStringSlice(obj map[string]any, fields ...string) []string {
	val, found, err := unstructured.NestedStringSlice(obj, fields...)
	if err != nil || !found {
		return nil
	}
	return val
}

// handleKagentiAgents returns kagenti Agent CRDs for a cluster
func (s *Server) handleKagentiAgents(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": err.Error()})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiAgentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiAgentGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		// CRD not installed is expected — return empty list, not error
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}})
		return
	}

	agents := make([]kagentiAgent, 0, len(list.Items))
	for _, item := range list.Items {
		spec := item.Object["spec"]
		specMap, _ := spec.(map[string]any)
		status := item.Object["status"]
		statusMap, _ := status.(map[string]any)

		a := kagentiAgent{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			CreatedAt: item.GetCreationTimestamp().Format(time.RFC3339),
		}
		if specMap != nil {
			a.Framework = nestedString(specMap, "framework")
			a.Protocol = nestedString(specMap, "protocol")
			a.Image = nestedString(specMap, "image")
			a.Replicas = nestedInt64(specMap, "replicas")
			if a.Replicas == 0 {
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

	json.NewEncoder(w).Encode(map[string]any{"agents": agents, "source": "agent"})
}

// handleKagentiBuilds returns kagenti AgentBuild CRDs for a cluster
func (s *Server) handleKagentiBuilds(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}, "error": err.Error()})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiBuildGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiBuildGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}})
		return
	}

	builds := make([]kagentiBuild, 0, len(list.Items))
	for _, item := range list.Items {
		spec := item.Object["spec"]
		specMap, _ := spec.(map[string]any)
		status := item.Object["status"]
		statusMap, _ := status.(map[string]any)

		b := kagentiBuild{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			b.Source = nestedString(specMap, "source", "url")
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

	json.NewEncoder(w).Encode(map[string]any{"builds": builds, "source": "agent"})
}

// handleKagentiCards returns kagenti AgentCard CRDs for a cluster
func (s *Server) handleKagentiCards(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}, "error": err.Error()})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiCardGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiCardGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}})
		return
	}

	cards := make([]kagentiCard, 0, len(list.Items))
	for _, item := range list.Items {
		spec := item.Object["spec"]
		specMap, _ := spec.(map[string]any)

		c := kagentiCard{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			c.AgentName = nestedString(specMap, "agentRef", "name")
			c.Skills = nestedStringSlice(specMap, "skills")
			c.Capabilities = nestedStringSlice(specMap, "capabilities")
			c.SyncPeriod = nestedString(specMap, "syncPeriod")
			c.IdentityBinding = nestedString(specMap, "identityBinding", "spiffeId")
		}
		cards = append(cards, c)
	}

	json.NewEncoder(w).Encode(map[string]any{"cards": cards, "source": "agent"})
}

// handleKagentiTools returns kagenti MCPServer CRDs for a cluster
func (s *Server) handleKagentiTools(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": err.Error()})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiToolGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiToolGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}})
		return
	}

	tools := make([]kagentiTool, 0, len(list.Items))
	for _, item := range list.Items {
		spec := item.Object["spec"]
		specMap, _ := spec.(map[string]any)

		t := kagentiTool{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
		}
		if specMap != nil {
			t.ToolPrefix = nestedString(specMap, "toolPrefix")
			t.TargetRef = nestedString(specMap, "targetRef", "name")
			// Check if credential secret is configured
			credName := nestedString(specMap, "credentialSecretRef", "name")
			t.HasCredential = credName != ""
		}
		tools = append(tools, t)
	}

	json.NewEncoder(w).Encode(map[string]any{"tools": tools, "source": "agent"})
}

// handleKagentiSummary returns an aggregated summary of kagenti resources for a cluster
func (s *Server) handleKagentiSummary(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{
			"agentCount": 0, "readyAgents": 0, "buildCount": 0,
			"activeBuilds": 0, "toolCount": 0, "cardCount": 0,
			"frameworks": map[string]int{},
		})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]any{"error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{
			"agentCount": 0, "readyAgents": 0, "buildCount": 0,
			"activeBuilds": 0, "toolCount": 0, "cardCount": 0,
			"frameworks": map[string]int{}, "error": err.Error(),
		})
		return
	}

	var agentCount, readyAgents, buildCount, activeBuilds, toolCount, cardCount int
	frameworks := map[string]int{}

	// Count agents
	if agentList, err := dynClient.Resource(kagentiAgentGVR).List(ctx, metav1.ListOptions{}); err == nil {
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
	}

	// Count builds
	if buildList, err := dynClient.Resource(kagentiBuildGVR).List(ctx, metav1.ListOptions{}); err == nil {
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
	}

	// Count tools
	if toolList, err := dynClient.Resource(kagentiToolGVR).List(ctx, metav1.ListOptions{}); err == nil {
		toolCount = len(toolList.Items)
	}

	// Count cards
	if cardList, err := dynClient.Resource(kagentiCardGVR).List(ctx, metav1.ListOptions{}); err == nil {
		cardCount = len(cardList.Items)
	}

	json.NewEncoder(w).Encode(map[string]any{
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

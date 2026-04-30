package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// isCRDNotInstalledErr reports whether err indicates that the requested
// custom resource definition is not installed on the target cluster.
// This is the only "not an error" condition the kagenti handlers should
// suppress — every other failure (RBAC denied, timeout, etc.) must be
// surfaced to the caller.
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

const (
	kagentiTimeout = 30 * time.Second
	// kagentiSummaryPerCallTimeout is the per-call timeout used when the
	// summary handler fans out its CRD queries concurrently. It mirrors
	// kagentCRDPerCallTimeout so a single slow CRD cannot starve the
	// others inside one shared 30-second budget (#7915).
	kagentiSummaryPerCallTimeout = 15 * time.Second
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

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching agents", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiAgentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiAgentGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			json.NewEncoder(w).Encode(map[string]any{"agents": []any{}})
			return
		}
		slog.Warn("error listing kagenti agents", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"agents": []any{}, "error": err.Error()})
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
			// Distinguish "field absent" (operator defaults to 1) from
			// "field explicitly set to 0" (agent intentionally paused).
			// nestedInt64 collapses both into 0, so call the underlying
			// helper directly and respect the found flag. See issue #7943.
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

	json.NewEncoder(w).Encode(map[string]any{"agents": agents, "source": "agent"})
}

// handleKagentiBuilds returns kagenti AgentBuild CRDs for a cluster
func (s *Server) handleKagentiBuilds(w http.ResponseWriter, r *http.Request) {
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
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching builds", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiBuildGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiBuildGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			json.NewEncoder(w).Encode(map[string]any{"builds": []any{}})
			return
		}
		slog.Warn("error listing kagenti builds", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"builds": []any{}, "error": err.Error()})
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
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching cards", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiCardGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiCardGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			json.NewEncoder(w).Encode(map[string]any{"cards": []any{}})
			return
		}
		slog.Warn("error listing kagenti cards", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"cards": []any{}, "error": err.Error()})
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
			// identityBinding is a top-level spec field (e.g. "strict", "permissive", "none"),
			// not nested under spiffeId. Fall back to "none" when the field is absent
			// so the frontend doesn't classify empty strings as SPIFFE-bound.
			c.IdentityBinding = nestedString(specMap, "identityBinding")
			if c.IdentityBinding == "" {
				c.IdentityBinding = "none"
			}
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

	ctx, cancel := context.WithTimeout(r.Context(), kagentiTimeout)
	defer cancel()

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching tools", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": "internal server error"})
		return
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(kagentiToolGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(kagentiToolGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		if apierrors.IsNotFound(err) || isCRDNotInstalledErr(err) {
			json.NewEncoder(w).Encode(map[string]any{"tools": []any{}})
			return
		}
		slog.Warn("error listing kagenti tools", "cluster", cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"tools": []any{}, "error": err.Error()})
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
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"error": "cluster parameter required"})
		return
	}

	dynClient, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		slog.Warn("error fetching kagenti summary", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"agentCount": 0, "readyAgents": 0, "buildCount": 0,
			"activeBuilds": 0, "toolCount": 0, "cardCount": 0,
			"frameworks": map[string]int{}, "error": "internal server error",
		})
		return
	}

	// Fan the 4 CRD list calls out concurrently, each with its own
	// per-call timeout, so a slow/unavailable CRD cannot starve the
	// others within one shared 30-second context budget. This matches
	// handleKagentCRDSummary's pattern (#7915).
	var (
		mu                                                       sync.Mutex
		agentCount, readyAgents, buildCount, activeBuilds        int
		toolCount, cardCount                                     int
		frameworks                                               = map[string]int{}
		wg                                                       sync.WaitGroup
	)
	const numKagentiCRDQueries = 4
	wg.Add(numKagentiCRDQueries)

	// Count agents + collect frameworks
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentiSummaryPerCallTimeout)
		defer cancel()
		agentList, listErr := dynClient.Resource(kagentiAgentGVR).List(ctx, metav1.ListOptions{})
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
	}()

	// Count builds
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentiSummaryPerCallTimeout)
		defer cancel()
		buildList, listErr := dynClient.Resource(kagentiBuildGVR).List(ctx, metav1.ListOptions{})
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
	}()

	// Count tools
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentiSummaryPerCallTimeout)
		defer cancel()
		toolList, listErr := dynClient.Resource(kagentiToolGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: tools query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		toolCount = len(toolList.Items)
	}()

	// Count cards
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(r.Context(), kagentiSummaryPerCallTimeout)
		defer cancel()
		cardList, listErr := dynClient.Resource(kagentiCardGVR).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Warn("kagenti summary: cards query failed", "error", listErr)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		cardCount = len(cardList.Items)
	}()

	wg.Wait()

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

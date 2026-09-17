package kagent

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/httputil"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/sanitize"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

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
		slog.Warn("error fetching agents", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error listing kagenti agents", "cluster", sanitize.LogString(cluster), "error", err)
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
		slog.Warn("error fetching builds", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error listing kagenti builds", "cluster", sanitize.LogString(cluster), "error", err)
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
		slog.Warn("error fetching cards", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error listing kagenti cards", "cluster", sanitize.LogString(cluster), "error", err)
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
		slog.Warn("error fetching tools", "error", sanitize.LogString(err.Error()))
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
		slog.Warn("error listing kagenti tools", "cluster", sanitize.LogString(cluster), "error", err)
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
		slog.Warn("error fetching kagenti summary", "error", sanitize.LogString(err.Error()))
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

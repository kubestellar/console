package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	clusterResourceRetryBaseDelay = 30 * time.Second
	clusterResourceRetryMaxDelay  = 5 * time.Minute
	clusterResourceRetryFactor    = 2
)

type clusterResourceRetryState struct {
	failures  int
	nextRetry time.Time
}

func (s *Server) clusterResourceRetryKey(resourceName, clusterName string) string {
	return resourceName + ":" + clusterName
}

func (s *Server) shouldSkipClusterResource(resourceName, clusterName string) bool {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		s.resourceRetryState = make(map[string]clusterResourceRetryState)
	}
	state, ok := s.resourceRetryState[s.clusterResourceRetryKey(resourceName, clusterName)]
	return ok && time.Now().Before(state.nextRetry)
}

func (s *Server) recordClusterResourceFailure(resourceName, clusterName string) time.Duration {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		s.resourceRetryState = make(map[string]clusterResourceRetryState)
	}
	key := s.clusterResourceRetryKey(resourceName, clusterName)
	state := s.resourceRetryState[key]
	state.failures++
	delay := clusterResourceRetryBaseDelay
	for attempt := 1; attempt < state.failures; attempt++ {
		delay *= clusterResourceRetryFactor
		if delay >= clusterResourceRetryMaxDelay {
			delay = clusterResourceRetryMaxDelay
			break
		}
	}
	state.nextRetry = time.Now().Add(delay)
	s.resourceRetryState[key] = state
	return delay
}

func (s *Server) recordClusterResourceSuccess(resourceName, clusterName string) {
	s.resourceRetryMu.Lock()
	defer s.resourceRetryMu.Unlock()
	if s.resourceRetryState == nil {
		return
	}
	delete(s.resourceRetryState, s.clusterResourceRetryKey(resourceName, clusterName))
}

func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for data endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Throttled reload: the frontend polls this endpoint and a full disk read
	// per request was wasteful. ReloadIfStale skips the load when the in-memory
	// snapshot is younger than kubectlReloadMinInterval. (#8075)
	s.kubectl.ReloadIfStale(kubectlReloadMinInterval)
	clusters, current := s.kubectl.ListContexts()
	writeJSON(w, protocol.ClustersPayload{Clusters: clusters, Current: current})
}

// handleGPUNodesHTTP returns GPU nodes across all clusters
func (s *Server) handleGPUNodesHTTP(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	allNodes := make([]k8s.GPUNode, 0)
	const resourceName = "gpu-nodes"

	if cluster != "" {
		if s.shouldSkipClusterResource(resourceName, cluster) {
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
		nodes, err := s.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			retryIn := s.recordClusterResourceFailure(resourceName, cluster)
			slog.Warn("error fetching nodes", "cluster", cluster, "error", err, "retryIn", retryIn)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
		s.recordClusterResourceSuccess(resourceName, cluster)
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Warn("error fetching nodes", "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		for _, cl := range clusters {
			if s.shouldSkipClusterResource(resourceName, cl.Name) {
				continue
			}
			wg.Add(1)
			safego.GoWith("gpu-nodes-fetch", func() {
				defer wg.Done()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetGPUNodes(clusterCtx, cl.Name)
				if err != nil {
					retryIn := s.recordClusterResourceFailure(resourceName, cl.Name)
					// #7750: Log per-cluster errors so GPU metric gaps are diagnosable.
					slog.Warn("[GPUNodes] failed to list GPU nodes for cluster", "cluster", cl.Name, "error", err, "retryIn", retryIn)
					return
				}
				s.recordClusterResourceSuccess(resourceName, cl.Name)
				if len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			})
		}
		wg.Wait()
	}

	writeJSON(w, map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleNodesHTTP returns nodes for a cluster or all clusters
func (s *Server) handleNodesHTTP(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	allNodes := make([]k8s.NodeInfo, 0)
	const resourceName = "nodes"

	if cluster != "" {
		if s.shouldSkipClusterResource(resourceName, cluster) {
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
		// Query specific cluster
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			retryIn := s.recordClusterResourceFailure(resourceName, cluster)
			slog.Warn("error fetching nodes", "cluster", cluster, "error", err, "retryIn", retryIn)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
		s.recordClusterResourceSuccess(resourceName, cluster)
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Warn("error fetching nodes", "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, cl := range clusters {
			if s.shouldSkipClusterResource(resourceName, cl.Name) {
				continue
			}
			wg.Add(1)
			safego.GoWith("nodes-fetch", func() {
				defer wg.Done()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetNodes(clusterCtx, cl.Name)
				if err != nil {
					retryIn := s.recordClusterResourceFailure(resourceName, cl.Name)
					slog.Warn("[Nodes] failed to list nodes for cluster", "cluster", cl.Name, "error", err, "retryIn", retryIn)
					return
				}
				s.recordClusterResourceSuccess(resourceName, cl.Name)
				if len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			})
		}
		wg.Wait()
	}

	writeJSON(w, map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleEventsHTTP returns events for a cluster/namespace/object
func (s *Server) handleEventsHTTP(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, map[string]interface{}{"events": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	objectName := r.URL.Query().Get("object")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > maxQueryLimit {
				l = maxQueryLimit
			}
			limit = l
		}
	}

	if cluster == "" {
		writeJSON(w, map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// When filtering by object name, use a server-side FieldSelector so the
	// limit is applied after filtering — prevents target events from being
	// pushed out of the result window in noisy namespaces (issue #10167).
	var fieldSelector string
	if objectName != "" {
		fieldSelector = fmt.Sprintf("involvedObject.name=%s", objectName)
	}

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit, fieldSelector)
	if err != nil {
		slog.Warn("error fetching events", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	// Filter by object name if specified. e.Object is formatted as
	// "Kind/Name" (see pkg/k8s/client_resources.go); compare the Name
	// segment exactly so a query like "my-app" does not match "my-app-v2".
	if objectName != "" {
		filtered := make([]k8s.Event, 0, len(events))
		for _, e := range events {
			name := e.Object
			if idx := strings.Index(name, "/"); idx >= 0 {
				name = name[idx+1:]
			}
			if name == objectName {
				filtered = append(filtered, e)
			}
		}
		events = filtered
	}

	writeJSON(w, map[string]interface{}{"events": events, "source": "agent"})
}

// handleNamespacesHTTP serves namespace operations for a cluster. GET lists
// namespaces (existing behavior). POST creates a namespace and DELETE removes
// one — both are user-initiated mutations that run under the user's kubeconfig
// via kc-agent instead of the backend's pod ServiceAccount (#7993 Phase 2).
//
// The GPU-reservation namespace-create path is NOT served here — it stays on
// the backend at `/mcp/resourcequotas` with `ensure_namespace: true` (see
// pkg/api/handlers/mcp_resources.go#CreateOrUpdateResourceQuota) because the
// reservation operator owns quota semantics and needs pod-SA access.
func (s *Server) handleNamespacesHTTP(w http.ResponseWriter, r *http.Request) {
	// #8201: GET list, POST create, DELETE remove — preflight must advertise all
	// three so browsers don't reject cross-origin POST/DELETE.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"namespaces": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	switch r.Method {
	case http.MethodPost:
		s.createNamespaceHTTP(w, r)
		return
	case http.MethodDelete:
		s.deleteNamespaceHTTP(w, r)
		return
	}

	// Default: GET list.
	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"namespaces": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	// Use context.Background() so the cluster query completes even if the
	// browser disconnects (prevents noisy "context canceled" log entries).
	ctx, cancel := context.WithTimeout(context.Background(), agentExtendedTimeout)
	defer cancel()

	namespaces, err := s.k8sClient.ListNamespacesWithDetails(ctx, cluster)
	if err != nil {
		slog.Warn("error fetching namespaces", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	writeJSON(w, map[string]interface{}{"namespaces": namespaces, "source": "agent"})
}

// createNamespaceHTTP handles POST /namespaces. Body shape matches the legacy
// backend NamespaceHandler.CreateNamespace request so the frontend can migrate
// with a pure URL swap.
func (s *Server) createNamespaceHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cluster string            `json:"cluster"`
		Name    string            `json:"name"`
		Labels  map[string]string `json:"labels,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "invalid request body"})
		return
	}
	// #8034 Copilot followup: field-level validation. Previously cluster+name
	// were only checked for emptiness and every other failure returned an
	// opaque 500. Reject malformed input at the HTTP boundary so the UI can
	// render a specific error and so we don't lean on the apiserver for
	// validation.
	if err := validateKubeContext(req.Cluster); err != nil {
		slog.Error("invalid cluster for create namespace request", "cluster", req.Cluster, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("", err)})
		return
	}
	if err := validateDNS1123Label("name", req.Name); err != nil {
		slog.Error("invalid namespace name for create request", "name", req.Name, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("", err)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	ns, err := s.k8sClient.CreateNamespace(ctx, req.Cluster, req.Name, req.Labels)
	if err != nil {
		slog.Warn("error creating namespace", "cluster", req.Cluster, "name", req.Name, "error", err)
		status, msg := mapK8sErrorToHTTP(err)
		w.WriteHeader(status)
		writeJSON(w, map[string]interface{}{"success": false, "error": msg, "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "namespace": ns, "source": "agent"})
}

// deleteNamespaceHTTP handles DELETE /namespaces. Takes `cluster` and `name`
// query parameters — kc-agent uses net/http mux so path params are not
// available (matches the legacy `DELETE /api/namespaces/:name?cluster=<c>`
// shape otherwise).
func (s *Server) deleteNamespaceHTTP(w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	name := r.URL.Query().Get("name")
	if cluster == "" || name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster and name query parameters are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteNamespace(ctx, cluster, name); err != nil {
		slog.Warn("error deleting namespace", "cluster", cluster, "name", name, "error", err)
		status, msg := mapK8sErrorToHTTP(err)
		w.WriteHeader(status)
		writeJSON(w, map[string]interface{}{"success": false, "error": msg, "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "cluster": cluster, "name": name, "source": "agent"})
}

// handleDeploymentsHTTP returns deployments for a cluster/namespace
func (s *Server) handleDeploymentsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"deployments": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"deployments": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// An empty namespace is passed through to client-go's Deployments("")
	// call, which lists deployments across all namespaces (#8121).
	deployments, err := s.k8sClient.GetDeployments(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching deployments", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	writeJSON(w, map[string]interface{}{"deployments": deployments, "source": "agent"})
}

// handleReplicaSetsHTTP returns replicasets for a cluster/namespace
func (s *Server) handleReplicaSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"replicasets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"replicasets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	replicasets, err := s.k8sClient.GetReplicaSets(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching replicasets", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"replicasets": replicasets, "source": "agent"})
}

// handleStatefulSetsHTTP returns statefulsets for a cluster/namespace
func (s *Server) handleStatefulSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"statefulsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"statefulsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	statefulsets, err := s.k8sClient.GetStatefulSets(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching statefulsets", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"statefulsets": statefulsets, "source": "agent"})
}

// handleDaemonSetsHTTP returns daemonsets for a cluster/namespace
func (s *Server) handleDaemonSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"daemonsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"daemonsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	daemonsets, err := s.k8sClient.GetDaemonSets(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching daemonsets", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"daemonsets": daemonsets, "source": "agent"})
}

// handleCronJobsHTTP returns cronjobs for a cluster/namespace
func (s *Server) handleCronJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"cronjobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"cronjobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	cronjobs, err := s.k8sClient.GetCronJobs(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching cronjobs", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"cronjobs": cronjobs, "source": "agent"})
}

// handleIngressesHTTP returns ingresses for a cluster/namespace
func (s *Server) handleIngressesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"ingresses": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"ingresses": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ingresses, err := s.k8sClient.GetIngresses(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching ingresses", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"ingresses": ingresses, "source": "agent"})
}

// handleNetworkPoliciesHTTP returns network policies for a cluster/namespace
func (s *Server) handleNetworkPoliciesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"networkpolicies": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"networkpolicies": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	policies, err := s.k8sClient.GetNetworkPolicies(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching networkpolicies", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"networkpolicies": policies, "source": "agent"})
}

// handleServicesHTTP returns services for a cluster/namespace
func (s *Server) handleServicesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"services": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"services": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	services, err := s.k8sClient.GetServices(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching services", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"services": services, "source": "agent"})
}

// handleConfigMapsHTTP returns configmaps for a cluster/namespace
func (s *Server) handleConfigMapsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"configmaps": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"configmaps": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	configmaps, err := s.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching configmaps", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"configmaps": configmaps, "source": "agent"})
}

// handleSecretsHTTP returns secrets for a cluster/namespace
func (s *Server) handleSecretsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for secrets endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"secrets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"secrets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	secrets, err := s.k8sClient.GetSecrets(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching secrets", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"secrets": secrets, "source": "agent"})
}

// handleServiceAccountsHTTP serves ServiceAccount operations for a
// cluster/namespace. GET reads the list (existing behavior). POST creates a
// new ServiceAccount, and DELETE removes one — both are user-initiated
// mutations that run under the user's kubeconfig via kc-agent rather than the
// backend's pod ServiceAccount (#7993 Phase 1.5 PR A).
func (s *Server) handleServiceAccountsHTTP(w http.ResponseWriter, r *http.Request) {
	// #8201: GET list, POST create, DELETE remove — preflight must advertise all
	// three so browsers don't reject cross-origin POST/DELETE.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	switch r.Method {
	case http.MethodPost:
		s.createServiceAccountHTTP(w, r)
		return
	case http.MethodDelete:
		s.deleteServiceAccountHTTP(w, r)
		return
	}
	// Default: GET list
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	serviceaccounts, err := s.k8sClient.GetServiceAccounts(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching serviceaccounts", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"serviceaccounts": serviceaccounts, "source": "agent"})
}

// createServiceAccountHTTP handles POST /serviceaccounts. The request body
// shape matches pkg/models.CreateServiceAccountRequest so the frontend
// migration from POST /api/rbac/service-accounts to
// POST ${LOCAL_AGENT_HTTP_URL}/serviceaccounts is a pure URL swap.
// Returns the created ServiceAccount as JSON on success.
func (s *Server) createServiceAccountHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Cluster   string `json:"cluster"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "invalid request body"})
		return
	}
	if req.Cluster == "" || req.Namespace == "" || req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster, namespace, and name are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	sa, err := s.k8sClient.CreateServiceAccount(ctx, req.Cluster, req.Namespace, req.Name)
	if err != nil {
		slog.Warn("error creating service account", "cluster", req.Cluster, "namespace", req.Namespace, "name", req.Name, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("create service account", err), "source": "agent"})
		return
	}
	writeJSON(w, sa)
}

// deleteServiceAccountHTTP handles DELETE /serviceaccounts. The cluster,
// namespace, and name are read from the query string (e.g.
// DELETE /serviceaccounts?cluster=prod&namespace=default&name=my-sa).
func (s *Server) deleteServiceAccountHTTP(w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster, namespace, and name query parameters are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteServiceAccount(ctx, cluster, namespace, name); err != nil {
		slog.Warn("error deleting service account", "cluster", cluster, "namespace", namespace, "name", name, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("delete service account", err), "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "cluster": cluster, "namespace": namespace, "name": name, "source": "agent"})
}

// handleServiceExportsHTTP serves MCS ServiceExport operations for a
// cluster/namespace. POST creates a new ServiceExport exporting an existing
// service across the ClusterSet; DELETE removes one. Both are user-initiated
// mutations that must run under the user's kubeconfig via kc-agent rather
// than the backend's pod ServiceAccount (#7993 Phase 1.5 PR B).
//
// The backend CreateServiceExport / DeleteServiceExport handlers had no
// frontend consumer and have been removed — any future UI that adds MCS
// export management should call this route.
func (s *Server) handleServiceExportsHTTP(w http.ResponseWriter, r *http.Request) {
	// #8201: POST create, DELETE remove — preflight must advertise both.
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodDelete, http.MethodOptions)
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
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}
	switch r.Method {
	case http.MethodPost:
		s.createServiceExportHTTP(w, r)
	case http.MethodDelete:
		s.deleteServiceExportHTTP(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// createServiceExportHTTP handles POST /serviceexports. Body shape matches
// the legacy backend CreateServiceExportRequest so the migration is a pure
// URL swap when a frontend consumer is added.
func (s *Server) createServiceExportHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cluster     string `json:"cluster"`
		Namespace   string `json:"namespace"`
		ServiceName string `json:"serviceName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "invalid request body"})
		return
	}
	if req.Cluster == "" || req.Namespace == "" || req.ServiceName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster, namespace, and serviceName are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.CreateServiceExport(ctx, req.Cluster, req.Namespace, req.ServiceName); err != nil {
		slog.Warn("error creating service export", "cluster", req.Cluster, "namespace", req.Namespace, "serviceName", req.ServiceName, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("create service export", err), "source": "agent"})
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]interface{}{
		"success":     true,
		"message":     "ServiceExport created successfully",
		"cluster":     req.Cluster,
		"namespace":   req.Namespace,
		"serviceName": req.ServiceName,
		"source":      "agent",
	})
}

// deleteServiceExportHTTP handles DELETE /serviceexports?cluster=...&namespace=...&name=...
// Uses query parameters so the route can share the path with POST.
func (s *Server) deleteServiceExportHTTP(w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster, namespace, and name query parameters are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteServiceExport(ctx, cluster, namespace, name); err != nil {
		slog.Warn("error deleting service export", "cluster", cluster, "namespace", namespace, "name", name, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("delete service export", err), "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"cluster":   cluster,
		"namespace": namespace,
		"name":      name,
		"source":    "agent",
	})
}

// handleJobsHTTP returns jobs for a cluster/namespace
func (s *Server) handleJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"jobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"jobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	jobs, err := s.k8sClient.GetJobs(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching jobs", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"jobs": jobs, "source": "agent"})
}

// handleHPAsHTTP returns HPAs for a cluster/namespace
func (s *Server) handleHPAsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for HPAs endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"hpas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"hpas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	hpas, err := s.k8sClient.GetHPAs(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching hpas", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"hpas": hpas, "source": "agent"})
}

// handlePVCsHTTP returns PVCs for a cluster/namespace
func (s *Server) handlePVCsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for PVCs endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"pvcs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"pvcs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	pvcs, err := s.k8sClient.GetPVCs(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching pvcs", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"pvcs": pvcs, "source": "agent"})
}

// handlePVsHTTP returns PersistentVolumes for a cluster
func (s *Server) handlePVsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for PVs endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"pvs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"pvs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	pvs, err := s.k8sClient.GetPVs(ctx, cluster)
	if err != nil {
		slog.Warn("error fetching pvs", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"pvs": pvs, "source": "agent"})
}

// handleRolesHTTP returns Roles for a cluster/namespace
func (s *Server) handleRolesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for Roles endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"roles": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"roles": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	roles, err := s.k8sClient.ListRoles(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching roles", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"roles": roles, "source": "agent"})
}

// handleRoleBindingsHTTP serves RoleBinding operations for a
// cluster/namespace. GET reads the list (existing behavior). POST creates a
// new RoleBinding or ClusterRoleBinding, and DELETE removes one — both are
// user-initiated mutations that run under the user's kubeconfig via kc-agent
// rather than the backend's pod ServiceAccount (#7993 Phase 1.5 PR A).
func (s *Server) handleRoleBindingsHTTP(w http.ResponseWriter, r *http.Request) {
	// #8201: GET list, POST create, DELETE remove — preflight must advertise all
	// three so browsers don't reject cross-origin POST/DELETE.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for RoleBindings endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"rolebindings": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	switch r.Method {
	case http.MethodPost:
		s.createRoleBindingHTTP(w, r)
		return
	case http.MethodDelete:
		s.deleteRoleBindingHTTP(w, r)
		return
	}
	// Default: GET list
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"rolebindings": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	bindings, err := s.k8sClient.ListRoleBindings(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching rolebindings", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"rolebindings": bindings, "source": "agent"})
}

// createRoleBindingHTTP handles POST /rolebindings. The body shape matches
// pkg/models.CreateRoleBindingRequest so frontend callers migrate from
// POST /api/rbac/bindings to POST ${LOCAL_AGENT_HTTP_URL}/rolebindings with a
// pure URL swap.
//
// It also accepts the GrantNamespaceAccess shape used by
// NamespaceManager/GrantAccessModal (cluster, subjectKind, subjectName,
// subjectNamespace, role, namespace) so namespace-access grants route
// through the same endpoint. Namespace-access bodies are normalized into a
// full RoleBinding spec before delegating to the shared pkg/k8s
// MultiClusterClient.CreateRoleBinding method.
func (s *Server) createRoleBindingHTTP(w http.ResponseWriter, r *http.Request) {
	// Accept a union of both shapes. Fields common to both (cluster,
	// namespace, subjectName, subjectNamespace) are shared; shape-specific
	// fields are read from dedicated fields. The grant-access path sets
	// `role` and leaves `name`/`roleName` unset; the rbac/bindings path sets
	// `name`/`roleName`/`roleKind`/`subjectKind` and may omit `role`.
	var req struct {
		Name        string `json:"name,omitempty"`
		Namespace   string `json:"namespace,omitempty"`
		Cluster     string `json:"cluster"`
		IsCluster   bool   `json:"isCluster,omitempty"`
		RoleName    string `json:"roleName,omitempty"`
		RoleKind    string `json:"roleKind,omitempty"`
		SubjectKind string `json:"subjectKind"`
		SubjectName string `json:"subjectName"`
		SubjectNS   string `json:"subjectNamespace,omitempty"`
		// Role is only set by GrantNamespaceAccess callers; shortcut
		// ("admin"/"edit"/"view") or a custom role name. Ignored when
		// roleName is supplied.
		Role string `json:"role,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "invalid request body"})
		return
	}
	// #8034 Copilot followup: validate cluster context at the HTTP boundary
	// so we return a specific 400 instead of passing empty/malformed values
	// down to the apiserver and getting back an opaque 500.
	if err := validateKubeContext(req.Cluster); err != nil {
		slog.Error("invalid cluster for role binding request", "cluster", req.Cluster, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": sanitizeAgentError("", err)})
		return
	}
	if req.SubjectKind == "" || req.SubjectName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "subjectKind and subjectName are required"})
		return
	}

	// Fill in defaults for the grant-namespace-access shape.
	roleName := req.RoleName
	if roleName == "" {
		roleName = req.Role
	}
	roleKind := req.RoleKind
	if roleKind == "" {
		// grant-access shortcuts ("admin"/"edit"/"view") map to
		// ClusterRoles in stock Kubernetes; custom role names default to
		// ClusterRole as well since GrantNamespaceAccess historically used
		// ClusterRole (see pkg/k8s/rbac.go GrantNamespaceAccess).
		roleKind = "ClusterRole"
	}
	if roleName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "roleName (or role) is required"})
		return
	}

	// Synthesize a binding name when the caller didn't provide one (the
	// grant-access shape doesn't include it). Format mirrors what the
	// backend GrantNamespaceAccess used: <subject>-<role>-<namespace>.
	bindingName := req.Name
	if bindingName == "" {
		bindingName = fmt.Sprintf("%s-%s-%s", req.SubjectName, roleName, req.Namespace)
	}

	k8sReq := models.CreateRoleBindingRequest{
		Name:        bindingName,
		Namespace:   req.Namespace,
		Cluster:     req.Cluster,
		IsCluster:   req.IsCluster,
		RoleName:    roleName,
		RoleKind:    roleKind,
		SubjectKind: models.K8sSubjectKind(req.SubjectKind),
		SubjectName: req.SubjectName,
		SubjectNS:   req.SubjectNS,
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.CreateRoleBinding(ctx, k8sReq); err != nil {
		slog.Warn("error creating role binding", "cluster", req.Cluster, "namespace", req.Namespace, "name", bindingName, "error", err)
		status, msg := mapK8sErrorToHTTP(err)
		w.WriteHeader(status)
		writeJSON(w, map[string]interface{}{"success": false, "error": msg, "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "roleBinding": bindingName, "source": "agent"})
}

// deleteRoleBindingHTTP handles DELETE /rolebindings. Cluster, namespace,
// name, and an optional isCluster flag are read from the query string.
// When isCluster=true the handler deletes a ClusterRoleBinding and namespace
// is ignored.
func (s *Server) deleteRoleBindingHTTP(w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	isCluster := r.URL.Query().Get("isCluster") == "true"
	if cluster == "" || name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "cluster and name query parameters are required"})
		return
	}
	if !isCluster && namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "namespace query parameter is required for non-cluster bindings"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteRoleBinding(ctx, cluster, namespace, name, isCluster); err != nil {
		slog.Warn("error deleting role binding", "cluster", cluster, "namespace", namespace, "name", name, "isCluster", isCluster, "error", err)
		status, msg := mapK8sErrorToHTTP(err)
		w.WriteHeader(status)
		writeJSON(w, map[string]interface{}{"success": false, "error": msg, "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "cluster": cluster, "namespace": namespace, "name": name, "isCluster": isCluster, "source": "agent"})
}

// handleResourceQuotasHTTP returns ResourceQuotas for a cluster/namespace
func (s *Server) handleResourceQuotasHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for ResourceQuotas endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"resourcequotas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"resourcequotas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	quotas, err := s.k8sClient.GetResourceQuotas(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching resourcequotas", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"resourcequotas": quotas, "source": "agent"})
}

// handleLimitRangesHTTP returns LimitRanges for a cluster/namespace
func (s *Server) handleLimitRangesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for LimitRanges endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{"limitranges": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"limitranges": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ranges, err := s.k8sClient.GetLimitRanges(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching limitranges", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}
	writeJSON(w, map[string]interface{}{"limitranges": ranges, "source": "agent"})
}

// handleResolveDepsHTTP resolves workload dependencies dynamically by walking
// the pod spec, RBAC, services, ingresses, PDBs, HPAs, etc.
func (s *Server) handleResolveDepsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// SECURITY: Validate token for ResolveDeps endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w, map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "k8s client not initialized",
		})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		writeJSON(w, map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "cluster, namespace, and name parameters required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	kind, bundle, err := s.k8sClient.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
	if err != nil {
		slog.Warn("error resolving dependencies", "namespace", namespace, "name", name, "cluster", cluster, "error", err)
		writeJSON(w, map[string]interface{}{
			"workload":     name,
			"kind":         "Deployment",
			"namespace":    namespace,
			"cluster":      cluster,
			"dependencies": []interface{}{},
			"warnings":     []string{sanitizeAgentError("resolve workload dependencies", err)},
			"source":       "agent",
		})
		return
	}

	deps := make([]map[string]interface{}, 0, len(bundle.Dependencies))
	for _, d := range bundle.Dependencies {
		deps = append(deps, map[string]interface{}{
			"kind":      string(d.Kind),
			"name":      d.Name,
			"namespace": d.Namespace,
			"optional":  d.Optional,
			"order":     d.Order,
		})
	}

	writeJSON(w, map[string]interface{}{
		"workload":     name,
		"kind":         kind,
		"namespace":    namespace,
		"cluster":      cluster,
		"dependencies": deps,
		"warnings":     bundle.Warnings,
		"source":       "agent",
	})
}

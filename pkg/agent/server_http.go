package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
)

// mapK8sErrorToHTTP translates a Kubernetes API error into the appropriate
// HTTP status + sanitized user-facing message. Opaque 500s leak apiserver
// internals; instead we map the well-known StatusError kinds so callers can
// render sensible UI (e.g. "already exists" -> 409 with a friendly message).
// Non-status errors fall through to 500 with a generic message — the real
// error is still logged by the caller via slog.Warn. #8034 Copilot followup
// to PR #8028.
func mapK8sErrorToHTTP(err error) (int, string) {
	switch {
	case k8serrors.IsAlreadyExists(err):
		return http.StatusConflict, err.Error()
	case k8serrors.IsForbidden(err):
		return http.StatusForbidden, err.Error()
	case k8serrors.IsInvalid(err):
		return http.StatusBadRequest, err.Error()
	case k8serrors.IsNotFound(err):
		return http.StatusNotFound, err.Error()
	case k8serrors.IsUnauthorized(err):
		return http.StatusUnauthorized, err.Error()
	case k8serrors.IsConflict(err):
		return http.StatusConflict, err.Error()
	case k8serrors.IsTimeout(err), k8serrors.IsServerTimeout(err):
		return http.StatusGatewayTimeout, err.Error()
	case k8serrors.IsServiceUnavailable(err):
		return http.StatusServiceUnavailable, err.Error()
	default:
		return http.StatusInternalServerError, "internal server error"
	}
}

// writeJSON encodes v as JSON to w and logs any encoding error.
// After headers have been written, the only safe action is to log the failure.
func writeJSON(w http.ResponseWriter, v interface{}) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("[HTTP] failed to encode JSON response", "error", err)
	}
}

// writeJSONError writes an error response with the appropriate HTTP status code.
// Use this instead of writeJSON for error cases to ensure clients see a non-200
// status (#7275). The response body includes an "error" field with the message.
func writeJSONError(w http.ResponseWriter, statusCode int, msg string) {
	w.WriteHeader(statusCode)
	writeJSON(w, map[string]string{"error": msg})
}

func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.GPUNode

	if cluster != "" {
		nodes, err := s.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			slog.Warn("error fetching nodes", "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
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
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						slog.Error("[GPUNodes] recovered from panic", "cluster", clusterName, "panic", r)
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetGPUNodes(clusterCtx, clusterName)
				if err != nil {
					// #7750: Log per-cluster errors so GPU metric gaps are diagnosable.
					slog.Warn("[GPUNodes] failed to list GPU nodes for cluster", "cluster", clusterName, "error", err)
					return
				}
				if len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			}(cl.Name)
		}
		wg.Wait()
	}

	writeJSON(w,map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleNodesHTTP returns nodes for a cluster or all clusters
func (s *Server) handleNodesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.NodeInfo

	if cluster != "" {
		// Query specific cluster
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			slog.Warn("error fetching nodes", "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
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
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						slog.Error("[Nodes] recovered from panic", "cluster", clusterName, "panic", r)
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetNodes(clusterCtx, clusterName)
				if err == nil && len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			}(cl.Name)
		}
		wg.Wait()
	}

	writeJSON(w,map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleEventsHTTP returns events for a cluster/namespace/object
func (s *Server) handleEventsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"events": []interface{}{}, "error": "k8s client not initialized"})
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
		writeJSON(w,map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit)
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

	writeJSON(w,map[string]interface{}{"events": events, "source": "agent"})
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
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
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
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("name", req.Name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
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
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"deployments": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"deployments": []interface{}{}, "error": "cluster parameter required"})
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

	writeJSON(w,map[string]interface{}{"deployments": deployments, "source": "agent"})
}

// handleReplicaSetsHTTP returns replicasets for a cluster/namespace
func (s *Server) handleReplicaSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"replicasets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"replicasets": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"replicasets": replicasets, "source": "agent"})
}

// handleStatefulSetsHTTP returns statefulsets for a cluster/namespace
func (s *Server) handleStatefulSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"statefulsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"statefulsets": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"statefulsets": statefulsets, "source": "agent"})
}

// handleDaemonSetsHTTP returns daemonsets for a cluster/namespace
func (s *Server) handleDaemonSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"daemonsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"daemonsets": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"daemonsets": daemonsets, "source": "agent"})
}

// handleCronJobsHTTP returns cronjobs for a cluster/namespace
func (s *Server) handleCronJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"cronjobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"cronjobs": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"cronjobs": cronjobs, "source": "agent"})
}

// handleIngressesHTTP returns ingresses for a cluster/namespace
func (s *Server) handleIngressesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"ingresses": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"ingresses": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"ingresses": ingresses, "source": "agent"})
}

// handleNetworkPoliciesHTTP returns network policies for a cluster/namespace
func (s *Server) handleNetworkPoliciesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"networkpolicies": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"networkpolicies": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"networkpolicies": policies, "source": "agent"})
}

// handleServicesHTTP returns services for a cluster/namespace
func (s *Server) handleServicesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"services": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"services": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"services": services, "source": "agent"})
}

// handleConfigMapsHTTP returns configmaps for a cluster/namespace
func (s *Server) handleConfigMapsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"configmaps": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"configmaps": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"configmaps": configmaps, "source": "agent"})
}

// handleSecretsHTTP returns secrets for a cluster/namespace
func (s *Server) handleSecretsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for secrets endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"secrets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"secrets": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"secrets": secrets, "source": "agent"})
}

// handleServiceAccountsHTTP serves ServiceAccount operations for a
// cluster/namespace. GET reads the list (existing behavior). POST creates a
// new ServiceAccount, and DELETE removes one — both are user-initiated
// mutations that run under the user's kubeconfig via kc-agent rather than the
// backend's pod ServiceAccount (#7993 Phase 1.5 PR A).
func (s *Server) handleServiceAccountsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error(), "source": "agent"})
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
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error(), "source": "agent"})
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
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error(), "source": "agent"})
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
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error(), "source": "agent"})
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
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token when configured (#7000)
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"jobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"jobs": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"jobs": jobs, "source": "agent"})
}

// handleHPAsHTTP returns HPAs for a cluster/namespace
func (s *Server) handleHPAsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for HPAs endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"hpas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"hpas": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"hpas": hpas, "source": "agent"})
}

// handlePVCsHTTP returns PVCs for a cluster/namespace
func (s *Server) handlePVCsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for PVCs endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"pvcs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"pvcs": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"pvcs": pvcs, "source": "agent"})
}

// handleRolesHTTP returns Roles for a cluster/namespace
func (s *Server) handleRolesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for Roles endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"roles": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"roles": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"roles": roles, "source": "agent"})
}

// handleRoleBindingsHTTP serves RoleBinding operations for a
// cluster/namespace. GET reads the list (existing behavior). POST creates a
// new RoleBinding or ClusterRoleBinding, and DELETE removes one — both are
// user-initiated mutations that run under the user's kubeconfig via kc-agent
// rather than the backend's pod ServiceAccount (#7993 Phase 1.5 PR A).
func (s *Server) handleRoleBindingsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
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
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for ResourceQuotas endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"resourcequotas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"resourcequotas": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"resourcequotas": quotas, "source": "agent"})
}

// handleLimitRangesHTTP returns LimitRanges for a cluster/namespace
func (s *Server) handleLimitRangesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for LimitRanges endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"limitranges": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"limitranges": []interface{}{}, "error": "cluster parameter required"})
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
	writeJSON(w,map[string]interface{}{"limitranges": ranges, "source": "agent"})
}

// handleResolveDepsHTTP resolves workload dependencies dynamically by walking
// the pod spec, RBAC, services, ingresses, PDBs, HPAs, etc.
func (s *Server) handleResolveDepsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// SECURITY: Validate token for ResolveDeps endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "k8s client not initialized",
		})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		writeJSON(w,map[string]interface{}{
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
		writeJSON(w,map[string]interface{}{
			"workload":     name,
			"kind":         "Deployment",
			"namespace":    namespace,
			"cluster":      cluster,
			"dependencies": []interface{}{},
			"warnings":     []string{err.Error()},
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

	writeJSON(w,map[string]interface{}{
		"workload":     name,
		"kind":         kind,
		"namespace":    namespace,
		"cluster":      cluster,
		"dependencies": deps,
		"warnings":     bundle.Warnings,
		"source":       "agent",
	})
}

// handleScaleHTTP scales a workload (Deployment or StatefulSet) to the given
// replica count via the Kubernetes API. Only POST with a JSON body is accepted;
// GET-based mutations are rejected to prevent CSRF-style attacks (#4150).
func (s *Server) handleScaleHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	// setCORSHeaders defaults Access-Control-Allow-Methods to "GET, OPTIONS".
	// This is a mutating POST endpoint — browsers would otherwise reject the
	// cross-origin POST preflight (#8019, #8021).
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — scaling is a mutating operation (#4150).
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w,map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF (#4150).
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	// The frontend (useWorkloads.useScaleWorkload) sends:
	//   { workloadName, namespace, targetClusters: []string, replicas }
	// Older agent callers used { cluster, namespace, name, replicas }.
	// Accept both shapes so we remain backward compatible while migrating
	// /api/workloads/scale off the backend pod SA (#7993 Phase 1 PR A).
	var req struct {
		// New shape (frontend → agent)
		WorkloadName   string   `json:"workloadName"`
		TargetClusters []string `json:"targetClusters"`

		// Legacy shape (kept for backward compat with existing direct agent callers)
		Cluster string `json:"cluster"`
		Name    string `json:"name"`

		// Shared fields
		Namespace string `json:"namespace"`
		Replicas  int32  `json:"replicas"`
	}
	// Cap request body to avoid OOM from oversized payloads (#8021).
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	// Normalize the two shapes to a single (name, targetClusters) pair.
	name := req.WorkloadName
	if name == "" {
		name = req.Name
	}
	targetClusters := req.TargetClusters
	if len(targetClusters) == 0 && req.Cluster != "" {
		targetClusters = []string{req.Cluster}
	}
	namespace := req.Namespace
	replicas := req.Replicas

	if replicas < 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "replicas must be a non-negative integer",
		})
		return
	}

	if name == "" || namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "workloadName and namespace are required",
		})
		return
	}

	// Require at least one target cluster. An empty targetClusters used to
	// be interpreted by MultiClusterClient.ScaleWorkload as "scale in every
	// known cluster", which is surprising and dangerous for a mutating call
	// driven by user input (#8019).
	if len(targetClusters) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "at least one targetCluster (or legacy 'cluster') is required",
		})
		return
	}

	if err := validateDNS1123Label("namespace", namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("workloadName", name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	for _, tc := range targetClusters {
		if err := validateKubeContext(tc); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w,map[string]interface{}{"success": false, "error": fmt.Sprintf("targetCluster: %v", err)})
			return
		}
	}

	if s.k8sClient == nil {
		// 503 so fetch callers hit their !res.ok branch (#8021).
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.ScaleWorkload(ctx, namespace, name, targetClusters, replicas)
	if err != nil {
		slog.Warn("error scaling resource", "namespace", namespace, "name", name, "targetClusters", targetClusters, "error", err)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	writeJSON(w,map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"source":         "agent",
	})
}

// handleDeployWorkloadHTTP deploys a workload from a source cluster to one or
// more target clusters via the shared pkg/k8s MultiClusterClient.DeployWorkload
// method. The agent uses the user's kubeconfig rather than the backend's pod
// ServiceAccount, so this endpoint is the user-kubeconfig path for
// `/api/workloads/deploy` (#7993 Phase 1 PR B).
//
// Only POST with a JSON body is accepted; GET-based mutations are rejected to
// prevent CSRF-style attacks (#4150 pattern, same as handleScaleHTTP).
func (s *Server) handleDeployWorkloadHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	// setCORSHeaders defaults Methods to "GET, OPTIONS"; override for POST (#8021).
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — deploying is a mutating operation.
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF.
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	// Matches the backend's DeployWorkload request shape so the frontend can
	// send the same payload to either endpoint during migration.
	var req struct {
		WorkloadName   string   `json:"workloadName"`
		Namespace      string   `json:"namespace"`
		SourceCluster  string   `json:"sourceCluster"`
		TargetClusters []string `json:"targetClusters"`
		Replicas       int32    `json:"replicas,omitempty"`
		GroupName      string   `json:"groupName,omitempty"`
		// Optional informational annotation. The agent runs under the user's
		// own kubeconfig so the "deployedBy" label is not security-relevant;
		// it's only used to annotate created resources. If unset, falls back
		// to the anonymous marker used by MultiClusterClient.DeployWorkload.
		DeployedBy string `json:"deployedBy,omitempty"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	if req.WorkloadName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "workloadName is required"})
		return
	}
	if req.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "namespace is required"})
		return
	}
	if req.SourceCluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "sourceCluster is required"})
		return
	}
	if len(req.TargetClusters) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "at least one targetCluster is required"})
		return
	}

	if err := validateDNS1123Label("workloadName", req.WorkloadName); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateKubeContext(req.SourceCluster); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("sourceCluster: %v", err)})
		return
	}
	for _, tc := range req.TargetClusters {
		if err := validateKubeContext(tc); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("targetCluster: %v", err)})
			return
		}
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	opts := &k8s.DeployOptions{
		DeployedBy: req.DeployedBy,
		GroupName:  req.GroupName,
	}
	if opts.DeployedBy == "" {
		opts.DeployedBy = deployedByAnonymousMarker
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.DeployWorkload(ctx, req.SourceCluster, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas, opts)
	if err != nil {
		slog.Warn("error deploying workload", "namespace", req.Namespace, "name", req.WorkloadName, "sourceCluster", req.SourceCluster, "targetClusters", req.TargetClusters, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	// Preserve dependencies and warnings from the MultiClusterClient response —
	// the UI surfaces deploy warnings and dependency-action links (#8021).
	writeJSON(w, map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"dependencies":   result.Dependencies,
		"warnings":       result.Warnings,
		"source":         "agent",
	})
}

// handleDeleteWorkloadHTTP deletes a workload (Deployment / StatefulSet /
// DaemonSet) from a single managed cluster via the shared pkg/k8s
// MultiClusterClient.DeleteWorkload method. Runs under the user's kubeconfig
// instead of the backend's pod ServiceAccount (#7993 Phase 1 PR B).
//
// Only POST with a JSON body is accepted. The backend previously used
// `DELETE /api/workloads/:cluster/:namespace/:name`, but kc-agent's convention
// is POST-with-body for all mutations (same as /scale), so the frontend sends
// a POST with {cluster, namespace, name} in the body.
func (s *Server) handleDeleteWorkloadHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	// setCORSHeaders defaults Methods to "GET, OPTIONS"; override for POST (#8021).
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — delete is a destructive mutating operation.
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF.
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	var req struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	if req.Cluster == "" || req.Namespace == "" || req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "cluster, namespace, and name are required",
		})
		return
	}

	if err := validateKubeContext(req.Cluster); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("cluster: %v", err)})
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("name", req.Name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteWorkload(ctx, req.Cluster, req.Namespace, req.Name); err != nil {
		slog.Warn("error deleting workload", "cluster", req.Cluster, "namespace", req.Namespace, "name", req.Name, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"success":   true,
		"message":   "Workload deleted successfully",
		"cluster":   req.Cluster,
		"namespace": req.Namespace,
		"name":      req.Name,
		"source":    "agent",
	})
}

// handlePodsHTTP returns pods for a cluster/namespace
func (s *Server) handlePodsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"pods": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"pods": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentCommandTimeout)
	defer cancel()

	pods, err := s.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching pods", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	writeJSON(w,map[string]interface{}{"pods": pods, "source": "agent"})
}

// handleClusterHealthHTTP returns health info for a cluster
func (s *Server) handleClusterHealthHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		writeJSON(w,map[string]interface{}{"error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		writeJSON(w,map[string]interface{}{"error": "cluster parameter required"})
		return
	}

	// Use background context instead of request context so the health check
	// continues even if the frontend disconnects. Results are cached, so
	// completing the check benefits subsequent requests.
	ctx, cancel := context.WithTimeout(context.Background(), agentExtendedTimeout)
	defer cancel()

	health, err := s.k8sClient.GetClusterHealth(ctx, cluster)
	if err != nil {
		slog.Error("request error", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w,health)
}

// setCORSHeaders sets common CORS headers for HTTP endpoints
func (s *Server) setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

// watchdogPidFileStat is indirected through a package variable so unit tests
// can substitute a fake stat without touching the real /tmp path. Production
// callers always use os.Stat.
var watchdogPidFileStat = func(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

// resolveBackendPort returns the port the backend is actually listening on.
//
// Resolution priority (highest first):
//  1. BACKEND_PORT env var (set by startup-oauth.sh when the watchdog is in use).
//  2. backendPortWatchdogMode (8081) if the watchdog PID file exists on disk.
//  3. backendPortLegacyDefault (8080) for no-watchdog deployments.
//
// Historically this file hard-coded 8080 for both the kill and health-check
// paths (#7945). That was correct before the watchdog landed, but after the
// watchdog architecture (cmd/console/watchdog.go) port 8080 became the
// reverse-proxy listener and the real backend moved to 8081. The old code
// therefore killed the watchdog instead of the backend on restart, leaving
// the real backend alive — the exact opposite of the intent.
func resolveBackendPort() int {
	if v := os.Getenv(backendPortEnvVar); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			return p
		}
	}
	if _, err := watchdogPidFileStat(watchdogPidFilePath); err == nil {
		return backendPortWatchdogMode
	}
	return backendPortLegacyDefault
}

// backendHealthURL returns the /health URL for the currently resolved backend port.
func backendHealthURL() string {
	return fmt.Sprintf("%s://%s:%d%s", backendHealthScheme, backendHealthHost, resolveBackendPort(), backendHealthPath)
}

// handleRestartBackend kills the existing backend on its resolved listen port and starts a new one.
func (s *Server) handleRestartBackend(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,map[string]string{"error": "POST required"})
		return
	}

	s.backendMux.Lock()
	defer s.backendMux.Unlock()

	killed := s.killBackendProcess()

	if err := s.startBackendProcess(); err != nil {
		slog.Error("[RestartBackend] failed to start backend", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w,map[string]interface{}{
			"success": false,
			"message": "operation failed",
		})
		return
	}

	// Wait for backend to become healthy
	time.Sleep(stabilizationDelay)
	healthy := s.checkBackendHealth()

	slog.Info("[RestartBackend] backend restarted", "killed", killed, "healthy", healthy)
	writeJSON(w,map[string]interface{}{
		"success": true,
		"killed":  killed,
		"healthy": healthy,
	})
}

// killBackendProcess finds and kills the process listening on the backend's
// resolved listen port. See resolveBackendPort for how the port is chosen —
// in watchdog deployments this is 8081, not 8080 (#7945).
func (s *Server) killBackendProcess() bool {
	// If we have a tracked process, kill it
	if s.backendCmd != nil && s.backendCmd.Process != nil {
		s.backendCmd.Process.Kill()
		s.backendCmd.Wait()
		s.backendCmd = nil
		return true
	}

	// Fallback: find only the LISTEN process on the resolved backend port
	// (not connected clients). Using -sTCP:LISTEN ensures we only kill the
	// server, not browsers/proxies.
	// NOTE: lsof is Unix-only; on Windows this falls through to return false (#7263).
	portArg := fmt.Sprintf(":%d", resolveBackendPort())
	out, err := exec.Command("lsof", "-ti", portArg, "-sTCP:LISTEN").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		// No process found — return false so callers know nothing was killed (#7264)
		return false
	}

	killed := false
	for _, pidStr := range strings.Fields(strings.TrimSpace(string(out))) {
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
			killed = true
		}
	}

	if !killed {
		return false
	}

	time.Sleep(startupDelay)
	return true
}

// consoleBinaryEnvVar lets operators override the path to the `console` backend
// binary used when restarting the backend from kc-agent. Needed for non-standard
// installs where the binary is not next to kc-agent or on $PATH.
const consoleBinaryEnvVar = "KC_CONSOLE_BINARY"

// consoleBinaryName is the canonical filename of the backend binary produced by
// `go build ./cmd/console`.
const consoleBinaryName = "console"

// resolveConsoleBinary locates the `console` backend binary for startBackendProcess.
//
// The previous implementation re-execed `os.Executable()` which, in the
// kc-agent process, returns the kc-agent binary — NOT `cmd/console`. That
// spawned a second kc-agent that failed to bind port 8585 and never restored
// the backend (#7945). Search order:
//  1. KC_CONSOLE_BINARY env var if set.
//  2. A `console` binary next to os.Executable() — brew installs put both
//     binaries side-by-side under $(brew --prefix)/bin/.
//  3. `console` on $PATH (exec.LookPath).
//
// Returns an error if none resolve; callers must NOT fall back to self-exec
// because that silently restarts the wrong process.
func resolveConsoleBinary() (string, error) {
	if v := os.Getenv(consoleBinaryEnvVar); v != "" {
		return v, nil
	}
	if execPath, err := os.Executable(); err == nil {
		candidate := execPath[:len(execPath)-len(filepathBase(execPath))] + consoleBinaryName
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	if p, err := exec.LookPath(consoleBinaryName); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("console binary not found — cannot restart backend; please restart via startup-oauth.sh or your package manager")
}

// filepathBase is a tiny inlined replacement for filepath.Base to avoid adding
// a new import in this file — it only handles Unix-style separators because
// kc-agent's restart-backend path is Unix-only (lsof fallback already gates
// Windows out in killBackendProcess).
func filepathBase(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' || p[i] == '\\' {
			return p[i+1:]
		}
	}
	return p
}

// envWithBackendPort returns a copy of the current environment with
// BACKEND_PORT set to the resolved backend port. If BACKEND_PORT is already
// present it is replaced in place (no duplicate entries, per the Go docs on
// exec.Cmd.Env where the last value wins but duplicates are discouraged).
func envWithBackendPort(extra ...string) []string {
	backendPortKV := fmt.Sprintf("%s=%d", backendPortEnvVar, resolveBackendPort())
	src := os.Environ()
	out := make([]string, 0, len(src)+1+len(extra))
	prefix := backendPortEnvVar + "="
	replaced := false
	for _, kv := range src {
		if strings.HasPrefix(kv, prefix) {
			out = append(out, backendPortKV)
			replaced = true
			continue
		}
		out = append(out, kv)
	}
	if !replaced {
		out = append(out, backendPortKV)
	}
	out = append(out, extra...)
	return out
}

// startBackendProcess restarts the backend process.
//
// When KC_DEV_MODE=1 is set, runs `go run ./cmd/console` (dev path). Otherwise
// it locates the prebuilt `console` binary (see resolveConsoleBinary) and
// execs it. The resolved BACKEND_PORT is injected into the child environment
// so the child binds the same port the watchdog proxies to.
//
// Historically (#7265) this function re-execed os.Executable() on the
// assumption that kc-agent and the backend were the same binary. They are
// not — fixed in #7945.
func (s *Server) startBackendProcess() error {
	var cmd *exec.Cmd
	if os.Getenv("KC_DEV_MODE") == "1" {
		cmd = exec.Command("go", "run", "./cmd/console")
		cmd.Env = envWithBackendPort("GOWORK=off")
	} else {
		binary, err := resolveConsoleBinary()
		if err != nil {
			slog.Error("[Backend] cannot locate console binary for restart", "error", err)
			return err
		}
		cmd = exec.Command(binary)
		cmd.Env = envWithBackendPort()
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start backend: %w", err)
	}

	s.backendCmd = cmd

	// Reap process in background to avoid zombies
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[Backend] recovered from panic in process reaper", "panic", r)
			}
		}()
		cmd.Wait()
		s.backendMux.Lock()
		if s.backendCmd == cmd {
			s.backendCmd = nil
		}
		s.backendMux.Unlock()
	}()

	return nil
}

// checkBackendHealth verifies the backend is responding on its resolved
// listen port (see resolveBackendPort). Previously this was pinned to 8080,
// which in watchdog deployments is the reverse proxy and NOT the real
// backend, yielding false-positive health results after a restart (#7945).
func (s *Server) checkBackendHealth() bool {
	client := &http.Client{Timeout: healthCheckTimeout}
	resp, err := client.Get(backendHealthURL())
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// handleAutoUpdateConfig handles GET/POST for auto-update configuration.
func (s *Server) handleAutoUpdateConfig(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w,map[string]string{"error": "unauthorized"})
		return
	}

	switch r.Method {
	case "GET":
		mgr := settings.GetSettingsManager()
		all, _ := mgr.GetAll()
		enabled := false
		channel := "stable"
		if all != nil {
			enabled = all.AutoUpdateEnabled
			if all.AutoUpdateChannel != "" {
				channel = all.AutoUpdateChannel
			}
		}
		writeJSON(w,AutoUpdateConfigRequest{
			Enabled: enabled,
			Channel: channel,
		})

	case "POST":
		// Limit request body to prevent OOM from oversized payloads (#7268)
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		var req AutoUpdateConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w,map[string]string{"error": "invalid request body"})
			return
		}

		// Validate channel
		switch req.Channel {
		case "stable", "unstable", "developer":
			// ok
		default:
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w,map[string]string{"error": "invalid channel"})
			return
		}

		// Persist to settings
		mgr := settings.GetSettingsManager()
		if all, err := mgr.GetAll(); err == nil {
			all.AutoUpdateEnabled = req.Enabled
			all.AutoUpdateChannel = req.Channel
			mgr.SaveAll(all)
		}

		// Apply to running checker
		if s.updateChecker != nil {
			s.updateChecker.Configure(req.Enabled, req.Channel)
		}

		writeJSON(w,map[string]interface{}{"success": true})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleAutoUpdateStatus returns the current auto-update status.
func (s *Server) handleAutoUpdateStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w,map[string]string{"error": "update checker not initialized"})
		return
	}

	writeJSON(w,s.updateChecker.Status())
}

// handleAutoUpdateTrigger triggers an immediate update check.
func (s *Server) handleAutoUpdateTrigger(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w,map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w,map[string]string{"error": "update checker not initialized"})
		return
	}

	// Accept optional channel override from frontend.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var body struct {
		Channel string `json:"channel"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w,map[string]string{"error": "invalid JSON body"})
			return
		}
	}
	if !s.updateChecker.TriggerNow(body.Channel) {
		w.WriteHeader(http.StatusConflict)
		writeJSON(w,map[string]interface{}{"success": false, "error": "update already in progress"})
		return
	}
	writeJSON(w,map[string]interface{}{"success": true, "message": "update check triggered"})
}

// handleAutoUpdateCancel cancels an in-progress update. Cancellation is
// best-effort: the currently-running step may complete before the abort is
// honored, and the update cannot be cancelled once the restart step has begun
// (startup-oauth.sh is spawned as a detached process).
func (s *Server) handleAutoUpdateCancel(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "update checker not initialized"})
		return
	}

	if !s.updateChecker.CancelUpdate() {
		w.WriteHeader(http.StatusConflict)
		writeJSON(w, map[string]interface{}{"success": false, "error": "no update in progress"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "message": "cancellation requested"})
}

// handleRenameContextHTTP renames a kubeconfig context
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for mutation endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req protocol.RenameContextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.OldName == "" || req.NewName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_names", Message: "Both oldName and newName required"})
		return
	}

	if err := s.kubectl.RenameContext(req.OldName, req.NewName); err != nil {
		slog.Error("rename context error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w,protocol.ErrorPayload{Code: "rename_failed", Message: "failed to rename context"})
		return
	}

	slog.Info("renamed context", "from", req.OldName, "to", req.NewName)
	writeJSON(w,protocol.RenameContextResponse{Success: true, OldName: req.OldName, NewName: req.NewName})
}

// kubeconfigImportRequest is the JSON body for kubeconfig import/preview
type kubeconfigImportRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

// kubeconfigImportResponse is the response from kubeconfig import
type kubeconfigImportResponse struct {
	Success bool     `json:"success"`
	Added   []string `json:"added"`
	Skipped []string `json:"skipped"`
	Error   string   `json:"error,omitempty"`
}

// kubeconfigPreviewResponse is the response from kubeconfig preview
type kubeconfigPreviewResponse struct {
	Contexts []KubeconfigPreviewEntry `json:"contexts"`
}

// handleKubeconfigPreviewHTTP returns a dry-run preview of which contexts would be imported
func (s *Server) handleKubeconfigPreviewHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	entries, err := s.kubectl.PreviewKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error("kubeconfig preview error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "preview_failed", Message: err.Error()})
		return
	}

	writeJSON(w,kubeconfigPreviewResponse{Contexts: entries})
}

// handleKubeconfigImportHTTP merges new contexts from a kubeconfig YAML into the local kubeconfig
func (s *Server) handleKubeconfigImportHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	added, skipped, err := s.kubectl.ImportKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error("kubeconfig import error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w,kubeconfigImportResponse{Success: false, Error: "failed to import kubeconfig"})
		return
	}

	slog.Info("kubeconfig import complete", "added", len(added), "skipped", len(skipped))
	writeJSON(w,kubeconfigImportResponse{Success: true, Added: added, Skipped: skipped})
}

// kubeconfigAddResponse is the response from the add cluster endpoint
type kubeconfigAddResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// handleKubeconfigRemoveHTTP removes a cluster context from the kubeconfig (#5658).
func (s *Server) handleKubeconfigRemoveHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS") // Copilot: setCORSHeaders defaults to GET
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "Unauthorized"})
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "Method not allowed"})
		return
	}

	var req struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Context == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Missing 'context' field"})
		return
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "k8s client not initialized"})
		return
	}

	if err := s.k8sClient.RemoveContext(req.Context); err != nil {
		slog.Error("[kubeconfig] failed to remove context", "context", req.Context, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, map[string]interface{}{"ok": true, "removed": req.Context})
}

// handleKubeconfigAddHTTP adds a cluster from structured form fields
func (s *Server) handleKubeconfigAddHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req AddClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if err := s.kubectl.AddCluster(req); err != nil {
		slog.Error("add cluster error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,kubeconfigAddResponse{Success: false, Error: err.Error()})
		return
	}

	slog.Info("added cluster via form", "context", req.ContextName, "cluster", req.ClusterName)
	writeJSON(w,kubeconfigAddResponse{Success: true})
}

// handleKubeconfigTestHTTP tests a connection to a Kubernetes API server
func (s *Server) handleKubeconfigTestHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w,protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	result, err := s.kubectl.TestClusterConnection(req)
	if err != nil {
		slog.Error("test connection error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w,TestConnectionResult{Reachable: false, Error: "connection test failed"})
		return
	}

	writeJSON(w,result)
}

// handleWebSocket handles WebSocket connections

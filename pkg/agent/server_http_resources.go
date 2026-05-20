package agent

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
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

		allNodes = fanOutClusters(s, ctx, resourceName, clusters, func(clusterCtx context.Context, clusterName string) ([]k8s.GPUNode, error) {
			return s.k8sClient.GetGPUNodes(clusterCtx, clusterName)
		})
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

		allNodes = fanOutClusters(s, ctx, resourceName, clusters, func(clusterCtx context.Context, clusterName string) ([]k8s.NodeInfo, error) {
			return s.k8sClient.GetNodes(clusterCtx, clusterName)
		})
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

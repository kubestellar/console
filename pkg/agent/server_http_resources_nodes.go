package agent

import (
	"context"
	"log/slog"
	"net/http"
	"sync"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

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

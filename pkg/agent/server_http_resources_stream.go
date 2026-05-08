package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
)

const resourceStreamPerClusterTimeout = 15 * time.Second
const resourceStreamSSETimeout = 2 * time.Minute

// handleNodesStreamSSE streams node data per cluster via Server-Sent Events.
func (s *Server) handleNodesStreamSSE(w http.ResponseWriter, r *http.Request) {
	handleClusterResourceStreamSSE(s, w, r, "nodes", func(ctx context.Context, cluster string) ([]k8s.NodeInfo, error) {
		return s.k8sClient.GetNodes(ctx, cluster)
	})
}

// handleGPUNodesStreamSSE streams GPU node data per cluster via Server-Sent Events.
func (s *Server) handleGPUNodesStreamSSE(w http.ResponseWriter, r *http.Request) {
	handleClusterResourceStreamSSE(s, w, r, "nodes", func(ctx context.Context, cluster string) ([]k8s.GPUNode, error) {
		return s.k8sClient.GetGPUNodes(ctx, cluster)
	})
}

func handleClusterResourceStreamSSE[T any](s *Server, w http.ResponseWriter, r *http.Request, itemsKey string, fetch func(context.Context, string) ([]T, error)) {
	s.setCORSHeaders(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		http.Error(w, "k8s client not initialized", http.StatusServiceUnavailable)
		return
	}

	if s.kubectl == nil {
		http.Error(w, "kubectl proxy not initialized", http.StatusServiceUnavailable)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	clusterFilter := r.URL.Query().Get("cluster")

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Now().Add(resourceStreamSSETimeout))

	bw := bufio.NewWriter(w)
	clusters, _ := s.kubectl.ListContexts()
	clusters = filterStreamClusters(clusters, clusterFilter)

	var mu sync.Mutex
	var wg sync.WaitGroup
	totalItems := 0

	for _, cl := range clusters {
		wg.Add(1)
		go func(clusterName string) {
			defer wg.Done()

			ctx, cancel := context.WithTimeout(r.Context(), resourceStreamPerClusterTimeout)
			defer cancel()

			items, err := fetch(ctx, clusterName)
			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				slog.Warn("[SSE] cluster resource fetch failed", "cluster", clusterName, "resource", itemsKey, "error", err)
				payload := map[string]string{"cluster": clusterName, "error": err.Error()}
				data, _ := json.Marshal(payload)
				fmt.Fprintf(bw, "event: cluster_error\ndata: %s\n\n", data)
				bw.Flush()
				flusher.Flush()
				return
			}

			totalItems += len(items)
			payload := map[string]interface{}{"cluster": clusterName, itemsKey: items}
			data, marshalErr := json.Marshal(payload)
			if marshalErr != nil {
				slog.Error("[SSE] failed to marshal cluster resource payload", "cluster", clusterName, "resource", itemsKey, "error", marshalErr)
				return
			}
			fmt.Fprintf(bw, "event: cluster_data\ndata: %s\n\n", data)
			bw.Flush()
			flusher.Flush()
		}(cl.Name)
	}

	wg.Wait()

	summary := map[string]interface{}{"total": totalItems, "clusters": len(clusters)}
	data, _ := json.Marshal(summary)
	fmt.Fprintf(bw, "event: done\ndata: %s\n\n", data)
	bw.Flush()
	flusher.Flush()
}

func filterStreamClusters(clusters []protocol.ClusterInfo, clusterFilter string) []protocol.ClusterInfo {
	if clusterFilter == "" {
		return clusters
	}

	filtered := make([]protocol.ClusterInfo, 0, 1)
	for _, cl := range clusters {
		if cl.Name == clusterFilter {
			filtered = append(filtered, cl)
			break
		}
	}
	return filtered
}

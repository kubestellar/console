package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"k8s.io/client-go/rest"
)

const (
	prometheusQueryTimeout = 10 * time.Second
	prometheusServicePort  = "9090"
	prometheusServiceName  = "prometheus"
)

// handlePrometheusQuery proxies a Prometheus query through the K8s API server.
// It uses the cluster's REST config to authenticate and routes through the
// API server's service proxy: /api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/api/v1/query
func (s *Server) handlePrometheusQuery(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, `{"error":"k8s client not initialized"}`, http.StatusServiceUnavailable)
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	query := r.URL.Query().Get("query")

	if cluster == "" || namespace == "" || query == "" {
		http.Error(w, `{"error":"cluster, namespace, and query parameters are required"}`, http.StatusBadRequest)
		return
	}

	// Optional: specific evaluation time
	queryTime := r.URL.Query().Get("time")

	// Optional: custom Prometheus service name (default: "prometheus")
	serviceName := r.URL.Query().Get("service")
	if serviceName == "" {
		serviceName = prometheusServiceName
	}

	config, err := s.k8sClient.GetRestConfig(cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  fmt.Sprintf("failed to get cluster config: %v", err),
		})
		return
	}

	// Build the K8s API server proxy URL to reach Prometheus
	proxyPath := fmt.Sprintf("/api/v1/namespaces/%s/services/%s:%s/proxy/api/v1/query",
		url.PathEscape(namespace),
		url.PathEscape(serviceName),
		prometheusServicePort,
	)

	params := url.Values{}
	params.Set("query", query)
	if queryTime != "" {
		params.Set("time", queryTime)
	}

	fullURL := fmt.Sprintf("%s%s?%s", config.Host, proxyPath, params.Encode())

	// Create an HTTP client with the cluster's TLS/auth config
	transport, err := rest.TransportFor(config)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  fmt.Sprintf("failed to create transport: %v", err),
		})
		return
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   prometheusQueryTimeout,
	}

	resp, err := client.Get(fullURL)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  fmt.Sprintf("prometheus query failed: %v", err),
		})
		return
	}
	defer resp.Body.Close()

	// Stream the raw Prometheus response back to the caller
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

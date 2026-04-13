package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"k8s.io/client-go/rest"
)

// promClientCache reuses http.Client instances keyed by cluster API server URL.
// Creating a new TLS transport per Prometheus query leaks connections and
// performs redundant TLS handshakes (#7024).
var promClientCache struct {
	sync.RWMutex
	clients map[string]*http.Client
}

const (
	prometheusQueryTimeout = 10 * time.Second
	prometheusServicePort  = "9090"
	prometheusServiceName  = "prometheus"
	// maxPromQLQueryLength is the maximum allowed length for a PromQL query string.
	// This prevents users from crafting arbitrarily large queries that could cause
	// excessive resource consumption on the Prometheus server (#4721).
	maxPromQLQueryLength = 2048
)

// writePrometheusError writes a JSON error response and logs the underlying
// json.Encode error if writing fails (#6691). Previously the three error
// branches in handlePrometheusQuery silently discarded json.NewEncoder().Encode
// errors, so when the response body write failed (e.g. client disconnected,
// broken transport) the operator had no record of it and the caller could
// receive a malformed/empty body with a 200 status line.
func writePrometheusError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "error",
		"error":  message,
	}); err != nil {
		slog.Error("failed to encode prometheus error response",
			"status", status, "message", message, "encodeErr", err)
		// Body may already be partially written; best we can do is log.
	}
}

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

	// SECURITY: Validate cluster and namespace against safe character sets to
	// prevent SSRF and path-traversal via crafted query parameters (#7175).
	if err := validateKubeContext(cluster); err != nil {
		writePrometheusError(w, http.StatusBadRequest, fmt.Sprintf("invalid cluster parameter: %v", err))
		return
	}
	if err := validateDNS1123Label("namespace", namespace); err != nil {
		writePrometheusError(w, http.StatusBadRequest, fmt.Sprintf("invalid namespace parameter: %v", err))
		return
	}

	// SECURITY: Length-limit the PromQL query to prevent arbitrarily expensive
	// queries from consuming excessive Prometheus resources (#4721).
	if len(query) > maxPromQLQueryLength {
		http.Error(w, `{"error":"query exceeds maximum allowed length"}`, http.StatusBadRequest)
		return
	}

	// Optional: specific evaluation time
	queryTime := r.URL.Query().Get("time")

	// Optional: custom Prometheus service name (default: "prometheus")
	serviceName := r.URL.Query().Get("service")
	if serviceName == "" {
		serviceName = prometheusServiceName
	}
	// SECURITY: Validate service name to prevent path traversal (#7175).
	if err := validateDNS1123Label("service", serviceName); err != nil {
		writePrometheusError(w, http.StatusBadRequest, fmt.Sprintf("invalid service parameter: %v", err))
		return
	}

	config, err := s.k8sClient.GetRestConfig(cluster)
	if err != nil {
		writePrometheusError(w, http.StatusBadGateway,
			fmt.Sprintf("failed to get cluster config: %v", err))
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

	// Reuse an HTTP client per cluster API server URL to avoid creating a new
	// TLS transport (and leaking connections) on every query (#7024).
	client, err := getOrCreatePromClient(config)
	if err != nil {
		writePrometheusError(w, http.StatusInternalServerError,
			fmt.Sprintf("failed to create transport: %v", err))
		return
	}

	resp, err := client.Get(fullURL)
	if err != nil {
		writePrometheusError(w, http.StatusBadGateway,
			fmt.Sprintf("prometheus query failed: %v", err))
		return
	}
	defer resp.Body.Close()

	// Stream the raw Prometheus response back to the caller
	w.WriteHeader(resp.StatusCode)
	if _, copyErr := io.Copy(w, resp.Body); copyErr != nil {
		slog.Error("failed to stream Prometheus response", "error", copyErr)
	}
}

// getOrCreatePromClient returns a cached http.Client for the given REST config,
// keyed by the API server Host URL. Clients are created once and reused to
// avoid per-query TLS handshakes and connection leaks (#7024).
func getOrCreatePromClient(config *rest.Config) (*http.Client, error) {
	key := config.Host

	promClientCache.RLock()
	if promClientCache.clients != nil {
		if c, ok := promClientCache.clients[key]; ok {
			promClientCache.RUnlock()
			return c, nil
		}
	}
	promClientCache.RUnlock()

	// Miss — create under write lock (double-check)
	promClientCache.Lock()
	defer promClientCache.Unlock()

	if promClientCache.clients == nil {
		promClientCache.clients = make(map[string]*http.Client)
	}
	if c, ok := promClientCache.clients[key]; ok {
		return c, nil
	}

	transport, err := rest.TransportFor(config)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   prometheusQueryTimeout,
	}
	promClientCache.clients[key] = client
	return client, nil
}

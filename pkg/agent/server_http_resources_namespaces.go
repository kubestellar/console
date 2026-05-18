package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

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

package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

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

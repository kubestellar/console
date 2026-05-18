package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/kubestellar/console/pkg/models"
)

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

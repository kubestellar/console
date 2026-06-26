package agent

import (
	"github.com/kubestellar/console/pkg/agent/kube"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/kubestellar/console/pkg/models"
)

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
	if err := kube.ValidateKubeContext(req.Cluster); err != nil {
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

package agent

// RBAC / permissions-introspection handlers for kc-agent.
//
// These endpoints are the kc-agent side of Phase 6 of #7993: user-facing
// permission checks (SelfSubjectAccessReview + permission summaries) must
// run under the user's kubeconfig, not the backend pod ServiceAccount.
//
// Before #8185 the backend's CheckCanI / GetClusterPermissions /
// GetAllPermissionsSummaries paths executed against the pod ServiceAccount,
// so the UI displayed the pod SA's permissions instead of the caller's —
// a misleading RBAC display, not a real privilege-escalation vector
// (mutations already flowed through kc-agent under the user's identity).
// The practical impact was cosmetic/UX: users saw permission summaries
// that didn't match what they could actually do. Routing these reads
// through kc-agent makes the displayed permissions reflect the caller.
//
// kc-agent loads `s.k8sClient` from the user's kubeconfig at startup, so
// calling the existing pkg/k8s.MultiClusterClient methods here is already
// running under the right identity — no duplication of the shared logic.

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
)

// rbacAnalysisTimeout is the per-request deadline for cross-cluster
// permission summaries, which fan out over every context in the user's
// kubeconfig and can be slow on large installs. Matches
// pkg/api/handlers/rbac.go rbacAnalysisTimeout.
const rbacAnalysisTimeout = 60 * time.Second

// handleCanIHTTP runs a SelfSubjectAccessReview for the caller on the
// requested cluster/verb/resource. The result reflects the permissions of
// the user whose kubeconfig kc-agent was started with — which is what the
// UI actually wants to show.
func (s *Server) handleCanIHTTP(w http.ResponseWriter, r *http.Request) {
	// This is a POST endpoint, so we must advertise POST in
	// Access-Control-Allow-Methods or browser preflight requests will fail.
	// setCORSHeaders defaults to "GET, OPTIONS" when no methods are supplied.
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	var req models.CanIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Cluster == "" || req.Verb == "" || req.Resource == "" {
		writeJSONError(w, http.StatusBadRequest, "cluster, verb, and resource are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), k8s.RBACDefaultTimeout)
	defer cancel()

	result, err := s.k8sClient.CheckCanI(ctx, req.Cluster, req)
	if err != nil {
		slog.Error("failed to check permissions", "cluster", req.Cluster, "verb", req.Verb, "resource", req.Resource, "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("check permissions", err))
		return
	}
	writeJSON(w, models.CanIResponse{
		Allowed: result.Allowed,
		Reason:  result.Reason,
	})
}

// handleClusterPermissionsHTTP returns the caller's permissions on a single
// cluster (when `?cluster=` is provided) or on every cluster in the user's
// kubeconfig.
func (s *Server) handleClusterPermissionsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), k8s.RBACDefaultTimeout)
	defer cancel()

	cluster := r.URL.Query().Get("cluster")
	if cluster != "" {
		perms, err := s.k8sClient.GetClusterPermissions(ctx, cluster)
		if err != nil {
			slog.Error("failed to get cluster permissions", "cluster", cluster, "error", err)
			writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("get cluster permissions", err))
			return
		}
		writeJSON(w, perms)
		return
	}
	perms, err := s.k8sClient.GetAllClusterPermissions(ctx)
	if err != nil {
		slog.Error("failed to list cluster permissions", "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("list cluster permissions", err))
		return
	}
	writeJSON(w, perms)
}

// handlePermissionsSummaryHTTP returns a cross-cluster permissions summary
// (is-cluster-admin flags, namespace lists, etc.) for the caller. This is
// what usePermissions() in the frontend uses to build its RBAC gates.
func (s *Server) handlePermissionsSummaryHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), rbacAnalysisTimeout)
	defer cancel()

	summaries, err := s.k8sClient.GetAllPermissionsSummaries(ctx)
	if err != nil {
		slog.Error("failed to summarize permissions", "error", err)
		writeJSONError(w, http.StatusInternalServerError, sanitizeAgentError("summarize permissions", err))
		return
	}

	response := models.PermissionsSummaryResponse{
		Clusters: make(map[string]models.ClusterPermissionsSummary),
	}
	for _, summary := range summaries {
		response.Clusters[summary.Cluster] = models.ClusterPermissionsSummary{
			IsClusterAdmin:       summary.IsClusterAdmin,
			CanListNodes:         summary.CanListNodes,
			CanListNamespaces:    summary.CanListNamespaces,
			CanCreateNamespaces:  summary.CanCreateNamespaces,
			CanManageRBAC:        summary.CanManageRBAC,
			CanViewSecrets:       summary.CanViewSecrets,
			AccessibleNamespaces: summary.AccessibleNamespaces,
		}
	}
	writeJSON(w, response)
}

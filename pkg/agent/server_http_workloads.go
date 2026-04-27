package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/kubestellar/console/pkg/k8s"
)

// handleScaleHTTP scales a workload (Deployment or StatefulSet) to the given
// replica count via the Kubernetes API. Only POST with a JSON body is accepted;
// GET-based mutations are rejected to prevent CSRF-style attacks (#4150).
func (s *Server) handleScaleHTTP(w http.ResponseWriter, r *http.Request) {
	// POST-only mutating endpoint — preflight must advertise POST so browsers
	// don't reject the cross-origin request (#8019, #8021, #8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — scaling is a mutating operation (#4150).
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF (#4150).
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	// The frontend (useWorkloads.useScaleWorkload) sends:
	//   { workloadName, namespace, targetClusters: []string, replicas }
	// Older agent callers used { cluster, namespace, name, replicas }.
	// Accept both shapes so we remain backward compatible while migrating
	// /api/workloads/scale off the backend pod SA (#7993 Phase 1 PR A).
	var req struct {
		// New shape (frontend → agent)
		WorkloadName   string   `json:"workloadName"`
		TargetClusters []string `json:"targetClusters"`

		// Legacy shape (kept for backward compat with existing direct agent callers)
		Cluster string `json:"cluster"`
		Name    string `json:"name"`

		// Shared fields
		Namespace string `json:"namespace"`
		Replicas  int32  `json:"replicas"`
	}
	// Cap request body to avoid OOM from oversized payloads (#8021).
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	// Normalize the two shapes to a single (name, targetClusters) pair.
	name := req.WorkloadName
	if name == "" {
		name = req.Name
	}
	targetClusters := req.TargetClusters
	if len(targetClusters) == 0 && req.Cluster != "" {
		targetClusters = []string{req.Cluster}
	}
	namespace := req.Namespace
	replicas := req.Replicas

	if replicas < 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "replicas must be a non-negative integer",
		})
		return
	}

	if name == "" || namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "workloadName and namespace are required",
		})
		return
	}

	// Require at least one target cluster. An empty targetClusters used to
	// be interpreted by MultiClusterClient.ScaleWorkload as "scale in every
	// known cluster", which is surprising and dangerous for a mutating call
	// driven by user input (#8019).
	if len(targetClusters) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "at least one targetCluster (or legacy 'cluster') is required",
		})
		return
	}

	if err := validateDNS1123Label("namespace", namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("workloadName", name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	for _, tc := range targetClusters {
		if err := validateKubeContext(tc); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("targetCluster: %v", err)})
			return
		}
	}

	if s.k8sClient == nil {
		// 503 so fetch callers hit their !res.ok branch (#8021).
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.ScaleWorkload(ctx, namespace, name, targetClusters, replicas)
	if err != nil {
		slog.Warn("error scaling resource", "namespace", namespace, "name", name, "targetClusters", targetClusters, "error", err)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"source":         "agent",
	})
}

// handleDeployWorkloadHTTP deploys a workload from a source cluster to one or
// more target clusters via the shared pkg/k8s MultiClusterClient.DeployWorkload
// method. The agent uses the user's kubeconfig rather than the backend's pod
// ServiceAccount, so this endpoint is the user-kubeconfig path for
// `/api/workloads/deploy` (#7993 Phase 1 PR B).
//
// Only POST with a JSON body is accepted; GET-based mutations are rejected to
// prevent CSRF-style attacks (#4150 pattern, same as handleScaleHTTP).
func (s *Server) handleDeployWorkloadHTTP(w http.ResponseWriter, r *http.Request) {
	// POST-only deploy endpoint — preflight must advertise POST (#8021, #8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — deploying is a mutating operation.
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF.
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	// Matches the backend's DeployWorkload request shape so the frontend can
	// send the same payload to either endpoint during migration.
	var req struct {
		WorkloadName   string   `json:"workloadName"`
		Namespace      string   `json:"namespace"`
		SourceCluster  string   `json:"sourceCluster"`
		TargetClusters []string `json:"targetClusters"`
		Replicas       int32    `json:"replicas,omitempty"`
		GroupName      string   `json:"groupName,omitempty"`
		// Optional informational annotation. The agent runs under the user's
		// own kubeconfig so the "deployedBy" label is not security-relevant;
		// it's only used to annotate created resources. If unset, falls back
		// to the anonymous marker used by MultiClusterClient.DeployWorkload.
		DeployedBy string `json:"deployedBy,omitempty"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	if req.WorkloadName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "workloadName is required"})
		return
	}
	if req.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "namespace is required"})
		return
	}
	if req.SourceCluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "sourceCluster is required"})
		return
	}
	if len(req.TargetClusters) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": "at least one targetCluster is required"})
		return
	}

	if err := validateDNS1123Label("workloadName", req.WorkloadName); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateKubeContext(req.SourceCluster); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("sourceCluster: %v", err)})
		return
	}
	for _, tc := range req.TargetClusters {
		if err := validateKubeContext(tc); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("targetCluster: %v", err)})
			return
		}
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	opts := &k8s.DeployOptions{
		DeployedBy: req.DeployedBy,
		GroupName:  req.GroupName,
	}
	if opts.DeployedBy == "" {
		opts.DeployedBy = deployedByAnonymousMarker
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.DeployWorkload(ctx, req.SourceCluster, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas, opts)
	if err != nil {
		slog.Warn("error deploying workload", "namespace", req.Namespace, "name", req.WorkloadName, "sourceCluster", req.SourceCluster, "targetClusters", req.TargetClusters, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	// Preserve dependencies and warnings from the MultiClusterClient response —
	// the UI surfaces deploy warnings and dependency-action links (#8021).
	writeJSON(w, map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"dependencies":   result.Dependencies,
		"warnings":       result.Warnings,
		"source":         "agent",
	})
}

// handleDeleteWorkloadHTTP deletes a workload (Deployment / StatefulSet /
// DaemonSet) from a single managed cluster via the shared pkg/k8s
// MultiClusterClient.DeleteWorkload method. Runs under the user's kubeconfig
// instead of the backend's pod ServiceAccount (#7993 Phase 1 PR B).
//
// Only POST with a JSON body is accepted. The backend previously used
// `DELETE /api/workloads/:cluster/:namespace/:name`, but kc-agent's convention
// is POST-with-body for all mutations (same as /scale), so the frontend sends
// a POST with {cluster, namespace, name} in the body.
func (s *Server) handleDeleteWorkloadHTTP(w http.ResponseWriter, r *http.Request) {
	// POST-only delete endpoint — preflight must advertise POST (#8021, #8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — delete is a destructive mutating operation.
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF.
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	var req struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	if req.Cluster == "" || req.Namespace == "" || req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "cluster, namespace, and name are required",
		})
		return
	}

	if err := validateKubeContext(req.Cluster); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": fmt.Sprintf("cluster: %v", err)})
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	if err := validateDNS1123Label("name", req.Name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.DeleteWorkload(ctx, req.Cluster, req.Namespace, req.Name); err != nil {
		slog.Warn("error deleting workload", "cluster", req.Cluster, "namespace", req.Namespace, "name", req.Name, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"success":   true,
		"message":   "Workload deleted successfully",
		"cluster":   req.Cluster,
		"namespace": req.Namespace,
		"name":      req.Name,
		"source":    "agent",
	})
}

// handlePodsHTTP returns pods for a cluster/namespace
func (s *Server) handlePodsHTTP(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, map[string]interface{}{"pods": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"pods": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentCommandTimeout)
	defer cancel()

	pods, err := s.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Warn("error fetching pods", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
		return
	}

	writeJSON(w, map[string]interface{}{"pods": pods, "source": "agent"})
}

// handleClusterHealthHTTP returns health info for a cluster
func (s *Server) handleClusterHealthHTTP(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, map[string]interface{}{"error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		writeJSON(w, map[string]interface{}{"error": "cluster parameter required"})
		return
	}

	// Use background context instead of request context so the health check
	// continues even if the frontend disconnects. Results are cached, so
	// completing the check benefits subsequent requests.
	ctx, cancel := context.WithTimeout(context.Background(), agentExtendedTimeout)
	defer cancel()

	health, err := s.k8sClient.GetClusterHealth(ctx, cluster)
	if err != nil {
		slog.Error("request error", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, health)
}

package agent

// Console Resource (CR) write handlers for kc-agent.
//
// These endpoints are the kc-agent side of Phase 2.5 of #7993: user-initiated
// writes to the console's own CRDs (ManagedWorkload / ClusterGroup /
// WorkloadDeployment) must run under the user's kubeconfig, not the backend
// pod ServiceAccount. The backend continues to host the *reconcilers*
// (console_persistence.go StartWatcher / reconcileDeployment) because those
// are system-internal — they react to CR state changes without a human in
// the loop and legitimately run as the pod SA.
//
// The frontend passes the persistence cluster context name and the
// persistence namespace as query parameters (both already exposed by
// usePersistence()'s `activeCluster` + `config.namespace`). kc-agent then
// resolves the dynamic client for that context from the user's kubeconfig
// and delegates to the shared pkg/k8s.ConsolePersistence methods so there is
// zero duplication of the CR CRUD logic.

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// consoleCRRequestTimeout is the per-request deadline applied to CR writes.
// It matches the existing agentExtendedTimeout used by other mutation
// handlers (service accounts, role bindings, workload deploy) so that a slow
// apiserver does not block the kc-agent request loop indefinitely.
const consoleCRRequestTimeout = 30 * time.Second

// resolveConsoleCRTarget reads the `cluster` and `namespace` query parameters
// that the frontend passes on every console-cr request and returns a
// dynamic.Interface authenticated against the user's kubeconfig for that
// cluster context, along with the validated namespace. Returns a rendered
// 400 response and `false` when either parameter is missing; returns a
// rendered error and `false` when the k8s client cannot be resolved.
func (s *Server) resolveConsoleCRTarget(w http.ResponseWriter, r *http.Request) (k8s.ConsolePersistence, string, bool) {
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" || namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   "cluster and namespace query parameters are required",
		})
		return nil, "", false
	}
	if s.k8sClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "k8s client not initialized")
		return nil, "", false
	}
	dyn, err := s.k8sClient.GetDynamicClient(cluster)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return nil, "", false
	}
	return k8s.NewConsolePersistence(dyn), namespace, true
}

// handleConsoleCRManagedWorkloads serves POST/PUT/DELETE for ManagedWorkload
// CRs. POST creates with a body-supplied spec. PUT updates by name (name
// also in query). DELETE removes by name.
func (s *Server) handleConsoleCRManagedWorkloads(w http.ResponseWriter, r *http.Request) {
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

	persistence, namespace, ok := s.resolveConsoleCRTarget(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), consoleCRRequestTimeout)
	defer cancel()

	switch r.Method {
	case http.MethodPost:
		var mw v1alpha1.ManagedWorkload
		if err := json.NewDecoder(r.Body).Decode(&mw); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		mw.Namespace = namespace
		if mw.APIVersion == "" {
			mw.APIVersion = v1alpha1.GroupVersion.String()
		}
		if mw.Kind == "" {
			mw.Kind = "ManagedWorkload"
		}
		if mw.CreationTimestamp.IsZero() {
			mw.CreationTimestamp = metav1.Now()
		}
		created, err := persistence.CreateManagedWorkload(ctx, &mw)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, created)

	case http.MethodPut:
		name := r.URL.Query().Get("name")
		if name == "" {
			writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
			return
		}
		var mw v1alpha1.ManagedWorkload
		if err := json.NewDecoder(r.Body).Decode(&mw); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		mw.Name = name
		mw.Namespace = namespace
		updated, err := persistence.UpdateManagedWorkload(ctx, &mw)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, updated)

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if name == "" {
			writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
			return
		}
		if err := persistence.DeleteManagedWorkload(ctx, namespace, name); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, map[string]interface{}{"success": true, "name": name})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleConsoleCRClusterGroups serves POST/PUT/DELETE for ClusterGroup CRs.
func (s *Server) handleConsoleCRClusterGroups(w http.ResponseWriter, r *http.Request) {
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

	persistence, namespace, ok := s.resolveConsoleCRTarget(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), consoleCRRequestTimeout)
	defer cancel()

	switch r.Method {
	case http.MethodPost:
		var cg v1alpha1.ClusterGroup
		if err := json.NewDecoder(r.Body).Decode(&cg); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		cg.Namespace = namespace
		if cg.APIVersion == "" {
			cg.APIVersion = v1alpha1.GroupVersion.String()
		}
		if cg.Kind == "" {
			cg.Kind = "ClusterGroup"
		}
		if cg.CreationTimestamp.IsZero() {
			cg.CreationTimestamp = metav1.Now()
		}
		created, err := persistence.CreateClusterGroup(ctx, &cg)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, created)

	case http.MethodPut:
		name := r.URL.Query().Get("name")
		if name == "" {
			writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
			return
		}
		var cg v1alpha1.ClusterGroup
		if err := json.NewDecoder(r.Body).Decode(&cg); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		cg.Name = name
		cg.Namespace = namespace
		updated, err := persistence.UpdateClusterGroup(ctx, &cg)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, updated)

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if name == "" {
			writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
			return
		}
		if err := persistence.DeleteClusterGroup(ctx, namespace, name); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, map[string]interface{}{"success": true, "name": name})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleConsoleCRWorkloadDeployments serves POST/DELETE for WorkloadDeployment
// CRs. The general PUT path is intentionally absent — the backend only ever
// exposed status updates (see handleConsoleCRWorkloadDeploymentStatus), and
// spec updates are reserved for the system-internal reconciler.
func (s *Server) handleConsoleCRWorkloadDeployments(w http.ResponseWriter, r *http.Request) {
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

	persistence, namespace, ok := s.resolveConsoleCRTarget(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), consoleCRRequestTimeout)
	defer cancel()

	switch r.Method {
	case http.MethodPost:
		var wd v1alpha1.WorkloadDeployment
		if err := json.NewDecoder(r.Body).Decode(&wd); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		wd.Namespace = namespace
		if wd.APIVersion == "" {
			wd.APIVersion = v1alpha1.GroupVersion.String()
		}
		if wd.Kind == "" {
			wd.Kind = "WorkloadDeployment"
		}
		if wd.CreationTimestamp.IsZero() {
			wd.CreationTimestamp = metav1.Now()
		}
		created, err := persistence.CreateWorkloadDeployment(ctx, &wd)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, created)

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if name == "" {
			writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
			return
		}
		if err := persistence.DeleteWorkloadDeployment(ctx, namespace, name); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, map[string]interface{}{"success": true, "name": name})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleConsoleCRWorkloadDeploymentStatus handles PUT for the status subresource
// of WorkloadDeployment CRs. The frontend sends a partial spec containing only
// the status field, merged with the current resource on the apiserver side.
func (s *Server) handleConsoleCRWorkloadDeploymentStatus(w http.ResponseWriter, r *http.Request) {
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
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	persistence, namespace, ok := s.resolveConsoleCRTarget(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), consoleCRRequestTimeout)
	defer cancel()

	name := r.URL.Query().Get("name")
	if name == "" {
		writeJSONError(w, http.StatusBadRequest, "name query parameter is required")
		return
	}

	// Fetch the current WD, apply the status from the request body, and
	// update. The backend handler does the same shape: the frontend sends
	// just a WorkloadDeploymentStatus, not the whole WD.
	current, err := persistence.GetWorkloadDeployment(ctx, namespace, name)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	var status v1alpha1.WorkloadDeploymentStatus
	if err := json.NewDecoder(r.Body).Decode(&status); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	current.Status = status
	updated, err := persistence.UpdateWorkloadDeploymentStatus(ctx, current)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, updated)
}

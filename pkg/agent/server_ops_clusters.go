package agent

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os/exec"
)

// handleCloudCLIStatus detects installed cloud CLIs (aws, gcloud, az, oc)
// so the frontend can show provider-specific IAM auth guidance.
func (s *Server) handleCloudCLIStatus(w http.ResponseWriter, r *http.Request) {
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

	clis := []cloudCLI{
		{Name: "aws", Provider: "AWS EKS"},
		{Name: "gcloud", Provider: "Google GKE"},
		{Name: "az", Provider: "Azure AKS"},
		{Name: "oc", Provider: "OpenShift"},
	}

	for i := range clis {
		if p, err := exec.LookPath(clis[i].Name); err == nil {
			clis[i].Found = true
			clis[i].Path = p
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clis": clis,
	})
}

// sanitizeClusterError produces a user-facing error message from an internal
// error.  It strips absolute filesystem paths and long stack traces while
// preserving the meaningful part of the message so the UI can show actionable
// guidance instead of a generic "operation failed".
func sanitizeClusterError(err error) string {
	if err == nil {
		return "unknown error"
	}
	msg := err.Error()

	// Cap length so a huge stderr dump doesn't flood the WebSocket payload.
	const maxLen = 512
	if len(msg) > maxLen {
		msg = msg[:maxLen] + "..."
	}

	return msg
}

// handleLocalClusterTools returns detected local cluster tools
func (s *Server) handleLocalClusterTools(w http.ResponseWriter, r *http.Request) {
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

	tools := s.localClusters.DetectTools()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tools": tools,
	})
}

// handleLocalClusters handles local cluster operations (list, create, delete)
func (s *Server) handleLocalClusters(w http.ResponseWriter, r *http.Request) {
	// #8201: GET list, POST create, DELETE remove — preflight must advertise all.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		// List all local clusters
		clusters := s.localClusters.ListClusters()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"clusters": clusters,
		})

	case "POST":
		// Create a new cluster
		var req struct {
			Tool string `json:"tool"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Tool == "" || req.Name == "" {
			http.Error(w, "tool and name are required", http.StatusBadRequest)
			return
		}

		// SECURITY: Validate cluster name against DNS-1123 to prevent command
		// injection via crafted names that flow into exec.Command args (#7171).
		if err := validateDNS1123Label("cluster name", req.Name); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Create cluster in background and return immediately
		s.clusterOpsWG.Add(1)
		go func() {
			defer s.clusterOpsWG.Done()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[LocalClusters] recovered from panic creating cluster", "cluster", req.Name, "panic", r)
				}
			}()
			if err := s.localClusters.CreateCluster(req.Tool, req.Name); err != nil {
				slog.Error("[LocalClusters] failed to create cluster", "cluster", req.Name, "tool", req.Tool, "error", err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  req.Tool,
					"name":  req.Name,
					"error": errMsg,
				})
			} else {
				slog.Info("[LocalClusters] created cluster", "cluster", req.Name, "tool", req.Tool)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' created successfully", req.Name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_created", map[string]string{
					"tool": req.Tool,
					"name": req.Name,
				})
				// Kubeconfig watcher will automatically pick up the new cluster
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "creating",
			"tool":    req.Tool,
			"name":    req.Name,
			"message": "Cluster creation started. You will be notified when it completes.",
		})

	case "DELETE":
		// Delete a cluster
		tool := r.URL.Query().Get("tool")
		name := r.URL.Query().Get("name")
		if tool == "" || name == "" {
			http.Error(w, "tool and name query parameters are required", http.StatusBadRequest)
			return
		}

		// SECURITY: Validate cluster name against DNS-1123 (#7171).
		if err := validateDNS1123Label("cluster name", name); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Delete cluster in background
		s.clusterOpsWG.Add(1)
		go func() {
			defer s.clusterOpsWG.Done()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[LocalClusters] recovered from panic deleting cluster", "cluster", name, "panic", r)
				}
			}()
			if err := s.localClusters.DeleteCluster(tool, name); err != nil {
				slog.Error("[LocalClusters] failed to delete cluster", "cluster", name, "error", err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  tool,
					"name":  name,
					"error": errMsg,
				})
			} else {
				slog.Info("[LocalClusters] deleted cluster", "cluster", name)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' deleted successfully", name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_deleted", map[string]string{
					"tool": tool,
					"name": name,
				})
				// Kubeconfig watcher will automatically pick up the change
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "deleting",
			"tool":    tool,
			"name":    name,
			"message": "Cluster deletion started. You will be notified when it completes.",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleLocalClusterLifecycle handles start/stop/restart for local clusters
func (s *Server) handleLocalClusterLifecycle(w http.ResponseWriter, r *http.Request) {
	// POST-only lifecycle action — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Tool   string `json:"tool"`
		Name   string `json:"name"`
		Action string `json:"action"` // "start", "stop", "restart"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Tool == "" || req.Name == "" || req.Action == "" {
		http.Error(w, "tool, name, and action are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate cluster name against DNS-1123 (#7171).
	if err := validateDNS1123Label("cluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		http.Error(w, "action must be start, stop, or restart", http.StatusBadRequest)
		return
	}

	s.clusterOpsWG.Add(1)
	go func() {
		defer s.clusterOpsWG.Done()
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[LocalClusters] recovered from panic during lifecycle action", "action", req.Action, "cluster", req.Name, "panic", r)
			}
		}()

		var err error
		switch req.Action {
		case "start":
			err = s.localClusters.StartCluster(req.Tool, req.Name)
		case "stop":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
		case "restart":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
			if err == nil {
				err = s.localClusters.StartCluster(req.Tool, req.Name)
			}
		}

		if err != nil {
			slog.Error("[LocalClusters] lifecycle action failed", "action", req.Action, "cluster", req.Name, "error", err)
			errMsg := sanitizeClusterError(err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "failed",
				"message":  errMsg,
				"progress": 0,
			})
		} else {
			slog.Info("[LocalClusters] lifecycle action completed", "action", req.Action, "cluster", req.Name)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("Cluster '%s' %sed successfully", req.Name, req.Action),
				"progress": 100,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  req.Action + "ing",
		"tool":    req.Tool,
		"name":    req.Name,
		"message": fmt.Sprintf("Cluster %s started. You will be notified when it completes.", req.Action),
	})
}

// handleVClusterList returns all vCluster instances
func (s *Server) handleVClusterList(w http.ResponseWriter, r *http.Request) {
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

	instances, err := s.localClusters.ListVClusters()
	if err != nil {
		slog.Error("[vCluster] failed to list vclusters", "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"vclusters": instances,
	})
}

// handleVClusterCreate creates a new vCluster
func (s *Server) handleVClusterCreate(w http.ResponseWriter, r *http.Request) {
	// POST-only vCluster create — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create vCluster in background and return immediately
	s.clusterOpsWG.Add(1)
	go func() {
		defer s.clusterOpsWG.Done()
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[vCluster] recovered from panic creating vcluster", "name", req.Name, "panic", r)
			}
		}()
		if err := s.localClusters.CreateVCluster(req.Name, req.Namespace); err != nil {
			slog.Error("[vCluster] failed to create vcluster", "name", req.Name, "error", err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			slog.Info("[vCluster] created vcluster", "name", req.Name, "namespace", req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' created successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "creating",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster creation started. You will be notified when it completes.",
	})
}

// handleVClusterConnect connects to an existing vCluster
func (s *Server) handleVClusterConnect(w http.ResponseWriter, r *http.Request) {
	// POST-only vCluster connect — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.localClusters.ConnectVCluster(req.Name, req.Namespace); err != nil {
		slog.Error("[vCluster] failed to connect to vcluster", "name", req.Name, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	slog.Info("[vCluster] connected to vcluster", "name", req.Name, "namespace", req.Namespace)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "connected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Connected to vCluster '%s'", req.Name),
	})
}

// handleVClusterDisconnect disconnects from a vCluster
func (s *Server) handleVClusterDisconnect(w http.ResponseWriter, r *http.Request) {
	// POST-only vCluster disconnect — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.localClusters.DisconnectVCluster(req.Name, req.Namespace); err != nil {
		slog.Error("[vCluster] failed to disconnect from vcluster", "name", req.Name, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	slog.Info("[vCluster] disconnected from vcluster", "name", req.Name)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "disconnected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Disconnected from vCluster '%s'", req.Name),
	})
}

// handleVClusterDelete deletes a vCluster
func (s *Server) handleVClusterDelete(w http.ResponseWriter, r *http.Request) {
	// POST-only vCluster delete — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Delete vCluster in background and return immediately
	s.clusterOpsWG.Add(1)
	go func() {
		defer s.clusterOpsWG.Done()
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[vCluster] recovered from panic deleting vcluster", "name", req.Name, "panic", r)
			}
		}()
		if err := s.localClusters.DeleteVCluster(req.Name, req.Namespace); err != nil {
			slog.Error("[vCluster] failed to delete vcluster", "name", req.Name, "error", err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			slog.Info("[vCluster] deleted vcluster", "name", req.Name, "namespace", req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' deleted successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "deleting",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster deletion started. You will be notified when it completes.",
	})
}

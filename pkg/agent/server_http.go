package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/settings"
)

func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for data endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	s.kubectl.Reload()
	clusters, current := s.kubectl.ListContexts()
	json.NewEncoder(w).Encode(protocol.ClustersPayload{Clusters: clusters, Current: current})
}

// handleGPUNodesHTTP returns GPU nodes across all clusters
func (s *Server) handleGPUNodesHTTP(w http.ResponseWriter, r *http.Request) {
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
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.GPUNode

	if cluster != "" {
		nodes, err := s.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			slog.Info(fmt.Sprintf("error fetching nodes: %v", err))
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Info(fmt.Sprintf("error fetching nodes: %v", err))
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						slog.Info(fmt.Sprintf("[GPUNodes] recovered from panic for cluster %s: %v", clusterName, r))
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetGPUNodes(clusterCtx, clusterName)
				if err == nil && len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			}(cl.Name)
		}
		wg.Wait()
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleNodesHTTP returns nodes for a cluster or all clusters
func (s *Server) handleNodesHTTP(w http.ResponseWriter, r *http.Request) {
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
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.NodeInfo

	if cluster != "" {
		// Query specific cluster
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			slog.Info(fmt.Sprintf("error fetching nodes: %v", err))
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Info(fmt.Sprintf("error fetching nodes: %v", err))
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						slog.Info(fmt.Sprintf("[Nodes] recovered from panic for cluster %s: %v", clusterName, r))
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetNodes(clusterCtx, clusterName)
				if err == nil && len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			}(cl.Name)
		}
		wg.Wait()
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleEventsHTTP returns events for a cluster/namespace/object
func (s *Server) handleEventsHTTP(w http.ResponseWriter, r *http.Request) {
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
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	objectName := r.URL.Query().Get("object")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > maxQueryLimit {
				l = maxQueryLimit
			}
			limit = l
		}
	}

	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching events: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "internal server error"})
		return
	}

	// Filter by object name if specified
	if objectName != "" {
		var filtered []k8s.Event
		for _, e := range events {
			if strings.Contains(e.Object, objectName) {
				filtered = append(filtered, e)
			}
		}
		events = filtered
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"events": events, "source": "agent"})
}

// handleNamespacesHTTP returns namespaces for a cluster
func (s *Server) handleNamespacesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	namespaces, err := s.k8sClient.ListNamespacesWithDetails(ctx, cluster)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching namespaces: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "internal server error"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": namespaces, "source": "agent"})
}

// handleDeploymentsHTTP returns deployments for a cluster/namespace
func (s *Server) handleDeploymentsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// If namespace not specified, get deployments from all namespaces
	if namespace == "" {
		namespace = ""
	}

	deployments, err := s.k8sClient.GetDeployments(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching deployments: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "internal server error"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"deployments": deployments, "source": "agent"})
}

// handleReplicaSetsHTTP returns replicasets for a cluster/namespace
func (s *Server) handleReplicaSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	replicasets, err := s.k8sClient.GetReplicaSets(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching replicasets: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": replicasets, "source": "agent"})
}

// handleStatefulSetsHTTP returns statefulsets for a cluster/namespace
func (s *Server) handleStatefulSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	statefulsets, err := s.k8sClient.GetStatefulSets(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching statefulsets: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": statefulsets, "source": "agent"})
}

// handleDaemonSetsHTTP returns daemonsets for a cluster/namespace
func (s *Server) handleDaemonSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	daemonsets, err := s.k8sClient.GetDaemonSets(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching daemonsets: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": daemonsets, "source": "agent"})
}

// handleCronJobsHTTP returns cronjobs for a cluster/namespace
func (s *Server) handleCronJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	cronjobs, err := s.k8sClient.GetCronJobs(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching cronjobs: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": cronjobs, "source": "agent"})
}

// handleIngressesHTTP returns ingresses for a cluster/namespace
func (s *Server) handleIngressesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ingresses, err := s.k8sClient.GetIngresses(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching ingresses: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": ingresses, "source": "agent"})
}

// handleNetworkPoliciesHTTP returns network policies for a cluster/namespace
func (s *Server) handleNetworkPoliciesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	policies, err := s.k8sClient.GetNetworkPolicies(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching networkpolicies: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": policies, "source": "agent"})
}

// handleServicesHTTP returns services for a cluster/namespace
func (s *Server) handleServicesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	services, err := s.k8sClient.GetServices(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching services: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"services": services, "source": "agent"})
}

// handleConfigMapsHTTP returns configmaps for a cluster/namespace
func (s *Server) handleConfigMapsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	configmaps, err := s.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching configmaps: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": configmaps, "source": "agent"})
}

// handleSecretsHTTP returns secrets for a cluster/namespace
func (s *Server) handleSecretsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for secrets endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	secrets, err := s.k8sClient.GetSecrets(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching secrets: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"secrets": secrets, "source": "agent"})
}

// handleServiceAccountsHTTP returns service accounts for a cluster/namespace
func (s *Server) handleServiceAccountsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	serviceaccounts, err := s.k8sClient.GetServiceAccounts(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching serviceaccounts: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": serviceaccounts, "source": "agent"})
}

// handleJobsHTTP returns jobs for a cluster/namespace
func (s *Server) handleJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	jobs, err := s.k8sClient.GetJobs(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching jobs: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs, "source": "agent"})
}

// handleHPAsHTTP returns HPAs for a cluster/namespace
func (s *Server) handleHPAsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	hpas, err := s.k8sClient.GetHPAs(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching hpas: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"hpas": hpas, "source": "agent"})
}

// handlePVCsHTTP returns PVCs for a cluster/namespace
func (s *Server) handlePVCsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	pvcs, err := s.k8sClient.GetPVCs(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching pvcs: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": pvcs, "source": "agent"})
}

// handleRolesHTTP returns Roles for a cluster/namespace
func (s *Server) handleRolesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	roles, err := s.k8sClient.ListRoles(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching roles: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"roles": roles, "source": "agent"})
}

// handleRoleBindingsHTTP returns RoleBindings for a cluster/namespace
func (s *Server) handleRoleBindingsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	bindings, err := s.k8sClient.ListRoleBindings(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching rolebindings: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": bindings, "source": "agent"})
}

// handleResourceQuotasHTTP returns ResourceQuotas for a cluster/namespace
func (s *Server) handleResourceQuotasHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	quotas, err := s.k8sClient.GetResourceQuotas(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching resourcequotas: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": quotas, "source": "agent"})
}

// handleLimitRangesHTTP returns LimitRanges for a cluster/namespace
func (s *Server) handleLimitRangesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ranges, err := s.k8sClient.GetLimitRanges(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching limitranges: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": ranges, "source": "agent"})
}

// handleResolveDepsHTTP resolves workload dependencies dynamically by walking
// the pod spec, RBAC, services, ingresses, PDBs, HPAs, etc.
func (s *Server) handleResolveDepsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "k8s client not initialized",
		})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "cluster, namespace, and name parameters required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	kind, bundle, err := s.k8sClient.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
	if err != nil {
		slog.Info(fmt.Sprintf("error resolving dependencies for %s/%s in %s: %v", namespace, name, cluster, err))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"workload":     name,
			"kind":         "Deployment",
			"namespace":    namespace,
			"cluster":      cluster,
			"dependencies": []interface{}{},
			"warnings":     []string{err.Error()},
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

	json.NewEncoder(w).Encode(map[string]interface{}{
		"workload":     name,
		"kind":         kind,
		"namespace":    namespace,
		"cluster":      cluster,
		"dependencies": deps,
		"warnings":     bundle.Warnings,
		"source":       "agent",
	})
}

// handleScaleHTTP scales a workload (Deployment or StatefulSet) to the given
// replica count via the Kubernetes API. Only POST with a JSON body is accepted;
// GET-based mutations are rejected to prevent CSRF-style attacks (#4150).
func (s *Server) handleScaleHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — scaling is a mutating operation (#4150).
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF (#4150).
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	var req struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Replicas  int32  `json:"replicas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	var cluster, namespace, name string
	var replicas int32

	cluster = req.Cluster
	namespace = req.Namespace
	name = req.Name
	replicas = req.Replicas

	if replicas < 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "replicas must be a non-negative integer",
		})
		return
	}

	if cluster == "" || namespace == "" || name == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "cluster, namespace, and name are required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.ScaleWorkload(ctx, namespace, name, []string{cluster}, replicas)
	if err != nil {
		slog.Info(fmt.Sprintf("error scaling %s/%s in %s: %v", namespace, name, cluster, err))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"source":         "agent",
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
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentCommandTimeout)
	defer cancel()

	pods, err := s.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Info(fmt.Sprintf("error fetching pods: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "internal server error"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"pods": pods, "source": "agent"})
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
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "cluster parameter required"})
		return
	}

	// Use background context instead of request context so the health check
	// continues even if the frontend disconnects. Results are cached, so
	// completing the check benefits subsequent requests.
	ctx, cancel := context.WithTimeout(context.Background(), agentExtendedTimeout)
	defer cancel()

	health, err := s.k8sClient.GetClusterHealth(ctx, cluster)
	if err != nil {
		slog.Error(fmt.Sprintf("request error: %v", err))
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "internal server error"})
		return
	}

	json.NewEncoder(w).Encode(health)
}

// setCORSHeaders sets common CORS headers for HTTP endpoints
func (s *Server) setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

// handleRestartBackend kills the existing backend on port 8080 and starts a new one
func (s *Server) handleRestartBackend(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "POST required"})
		return
	}

	s.backendMux.Lock()
	defer s.backendMux.Unlock()

	killed := s.killBackendProcess()

	if err := s.startBackendProcess(); err != nil {
		slog.Error(fmt.Sprintf("[RestartBackend] Failed to start backend: %v", err))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "operation failed",
		})
		return
	}

	// Wait for backend to become healthy
	time.Sleep(stabilizationDelay)
	healthy := s.checkBackendHealth()

	slog.Info(fmt.Sprintf("[RestartBackend] Backend restarted (killed=%v, healthy=%v)", killed, healthy))
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"killed":  killed,
		"healthy": healthy,
	})
}

// killBackendProcess finds and kills the process listening on port 8080
func (s *Server) killBackendProcess() bool {
	// If we have a tracked process, kill it
	if s.backendCmd != nil && s.backendCmd.Process != nil {
		s.backendCmd.Process.Kill()
		s.backendCmd.Wait()
		s.backendCmd = nil
		return true
	}

	// Fallback: find only the LISTEN process on port 8080 (not connected clients)
	// Using -sTCP:LISTEN ensures we only kill the server, not browsers/proxies
	out, err := exec.Command("lsof", "-ti", ":8080", "-sTCP:LISTEN").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		return false
	}

	for _, pidStr := range strings.Fields(strings.TrimSpace(string(out))) {
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
	}

	time.Sleep(startupDelay)
	return true
}

// startBackendProcess starts the backend via `go run ./cmd/console`
func (s *Server) startBackendProcess() error {
	cmd := exec.Command("go", "run", "./cmd/console")
	cmd.Env = append(os.Environ(), "GOWORK=off")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start backend: %w", err)
	}

	s.backendCmd = cmd

	// Reap process in background to avoid zombies
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Info(fmt.Sprintf("[Backend] recovered from panic in process reaper: %v", r))
			}
		}()
		cmd.Wait()
		s.backendMux.Lock()
		if s.backendCmd == cmd {
			s.backendCmd = nil
		}
		s.backendMux.Unlock()
	}()

	return nil
}

// checkBackendHealth verifies the backend is responding on port 8080
func (s *Server) checkBackendHealth() bool {
	client := &http.Client{Timeout: healthCheckTimeout}
	resp, err := client.Get(defaultHealthCheckURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// handleAutoUpdateConfig handles GET/POST for auto-update configuration.
func (s *Server) handleAutoUpdateConfig(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	switch r.Method {
	case "GET":
		mgr := settings.GetSettingsManager()
		all, _ := mgr.GetAll()
		enabled := false
		channel := "stable"
		if all != nil {
			enabled = all.AutoUpdateEnabled
			if all.AutoUpdateChannel != "" {
				channel = all.AutoUpdateChannel
			}
		}
		json.NewEncoder(w).Encode(AutoUpdateConfigRequest{
			Enabled: enabled,
			Channel: channel,
		})

	case "POST":
		var req AutoUpdateConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		// Validate channel
		switch req.Channel {
		case "stable", "unstable", "developer":
			// ok
		default:
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid channel"})
			return
		}

		// Persist to settings
		mgr := settings.GetSettingsManager()
		if all, err := mgr.GetAll(); err == nil {
			all.AutoUpdateEnabled = req.Enabled
			all.AutoUpdateChannel = req.Channel
			mgr.SaveAll(all)
		}

		// Apply to running checker
		if s.updateChecker != nil {
			s.updateChecker.Configure(req.Enabled, req.Channel)
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleAutoUpdateStatus returns the current auto-update status.
func (s *Server) handleAutoUpdateStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "update checker not initialized"})
		return
	}

	json.NewEncoder(w).Encode(s.updateChecker.Status())
}

// handleAutoUpdateTrigger triggers an immediate update check.
func (s *Server) handleAutoUpdateTrigger(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "update checker not initialized"})
		return
	}

	// Accept optional channel override from frontend.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var body struct {
		Channel string `json:"channel"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
			return
		}
	}
	if !s.updateChecker.TriggerNow(body.Channel) {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "update already in progress"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "update check triggered"})
}

// handleRenameContextHTTP renames a kubeconfig context
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for mutation endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req protocol.RenameContextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.OldName == "" || req.NewName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_names", Message: "Both oldName and newName required"})
		return
	}

	if err := s.kubectl.RenameContext(req.OldName, req.NewName); err != nil {
		slog.Error(fmt.Sprintf("rename context error: %v", err))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "rename_failed", Message: "failed to rename context"})
		return
	}

	slog.Info(fmt.Sprintf("Renamed context: %s -> %s", req.OldName, req.NewName))
	json.NewEncoder(w).Encode(protocol.RenameContextResponse{Success: true, OldName: req.OldName, NewName: req.NewName})
}

// kubeconfigImportRequest is the JSON body for kubeconfig import/preview
type kubeconfigImportRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

// kubeconfigImportResponse is the response from kubeconfig import
type kubeconfigImportResponse struct {
	Success bool     `json:"success"`
	Added   []string `json:"added"`
	Skipped []string `json:"skipped"`
	Error   string   `json:"error,omitempty"`
}

// kubeconfigPreviewResponse is the response from kubeconfig preview
type kubeconfigPreviewResponse struct {
	Contexts []KubeconfigPreviewEntry `json:"contexts"`
}

// handleKubeconfigPreviewHTTP returns a dry-run preview of which contexts would be imported
func (s *Server) handleKubeconfigPreviewHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	entries, err := s.kubectl.PreviewKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error(fmt.Sprintf("kubeconfig preview error: %v", err))
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "preview_failed", Message: "invalid kubeconfig"})
		return
	}

	json.NewEncoder(w).Encode(kubeconfigPreviewResponse{Contexts: entries})
}

// handleKubeconfigImportHTTP merges new contexts from a kubeconfig YAML into the local kubeconfig
func (s *Server) handleKubeconfigImportHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	added, skipped, err := s.kubectl.ImportKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error(fmt.Sprintf("kubeconfig import error: %v", err))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(kubeconfigImportResponse{Success: false, Error: "failed to import kubeconfig"})
		return
	}

	slog.Info(fmt.Sprintf("Kubeconfig import: added %d contexts, skipped %d", len(added), len(skipped)))
	json.NewEncoder(w).Encode(kubeconfigImportResponse{Success: true, Added: added, Skipped: skipped})
}

// kubeconfigAddResponse is the response from the add cluster endpoint
type kubeconfigAddResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// handleKubeconfigAddHTTP adds a cluster from structured form fields
func (s *Server) handleKubeconfigAddHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req AddClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if err := s.kubectl.AddCluster(req); err != nil {
		slog.Error(fmt.Sprintf("add cluster error: %v", err))
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(kubeconfigAddResponse{Success: false, Error: "failed to add cluster"})
		return
	}

	slog.Info(fmt.Sprintf("Added cluster via form: context=%s cluster=%s", req.ContextName, req.ClusterName))
	json.NewEncoder(w).Encode(kubeconfigAddResponse{Success: true})
}

// handleKubeconfigTestHTTP tests a connection to a Kubernetes API server
func (s *Server) handleKubeconfigTestHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	result, err := s.kubectl.TestClusterConnection(req)
	if err != nil {
		slog.Error(fmt.Sprintf("test connection error: %v", err))
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TestConnectionResult{Reachable: false, Error: "connection test failed"})
		return
	}

	json.NewEncoder(w).Encode(result)
}

// handleWebSocket handles WebSocket connections

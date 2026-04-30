package agent

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Well-known namespaces and resource names for NVIDIA GPU operator detection.
const (
	nvidiaGPUOperatorNamespace     = "gpu-operator"
	nvidiaGPUOperatorNamespaceAlt  = "nvidia-gpu-operator"
	nvidiaNetworkOperatorNamespace = "nvidia-network-operator"

	nvidiaDevicePluginDaemonSet = "nvidia-device-plugin-daemonset"
	gpuFeatureDiscoveryDaemonSet = "gpu-feature-discovery"

	clusterPolicyCRDName        = "clusterpolicies.nvidia.com"
	nicClusterPolicyCRDName     = "nicclusterpolicies.mellanox.com"

	nvidiaOperatorLabelKey      = "app.kubernetes.io/managed-by"
	nvidiaOperatorLabelValue    = "gpu-operator"
)

// nvidiaOperatorStatus is the per-cluster NVIDIA operator status returned to the frontend.
type nvidiaOperatorStatus struct {
	Cluster         string            `json:"cluster"`
	GPUOperator     *gpuOperatorInfo     `json:"gpuOperator,omitempty"`
	NetworkOperator *networkOperatorInfo `json:"networkOperator,omitempty"`
}

type gpuOperatorInfo struct {
	Installed     bool                `json:"installed"`
	Version       string              `json:"version,omitempty"`
	State         string              `json:"state,omitempty"`
	Ready         bool                `json:"ready"`
	Components    []operatorComponent `json:"components,omitempty"`
	DriverVersion string              `json:"driverVersion,omitempty"`
	CUDAVersion   string              `json:"cudaVersion,omitempty"`
	Namespace     string              `json:"namespace,omitempty"`
}

type networkOperatorInfo struct {
	Installed  bool                `json:"installed"`
	Version    string              `json:"version,omitempty"`
	State      string              `json:"state,omitempty"`
	Ready      bool                `json:"ready"`
	Components []operatorComponent `json:"components,omitempty"`
	Namespace  string              `json:"namespace,omitempty"`
}

type operatorComponent struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

// handleNvidiaOperatorsHTTP returns NVIDIA operator status for one or all clusters.
func (s *Server) handleNvidiaOperatorsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
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
		writeJSON(w, map[string]interface{}{"operators": []interface{}{}})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	results := make([]nvidiaOperatorStatus, 0)

	if cluster != "" {
		client, err := s.k8sClient.GetClient(cluster)
		if err != nil {
			slog.Warn("[NvidiaOperators] failed to get client", "cluster", cluster, "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
			return
		}
		status := detectNvidiaOperators(ctx, cluster, client)
		results = []nvidiaOperatorStatus{status}
	} else {
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Warn("[NvidiaOperators] failed to list clusters", "error", err)
			writeJSONError(w, http.StatusServiceUnavailable, "cluster temporarily unavailable")
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
						slog.Error("[NvidiaOperators] recovered from panic", "cluster", clusterName, "panic", r)
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
				defer clusterCancel()

				client, err := s.k8sClient.GetClient(clusterName)
				if err != nil {
					slog.Warn("[NvidiaOperators] failed to get client", "cluster", clusterName, "error", err)
					return
				}
				status := detectNvidiaOperators(clusterCtx, clusterName, client)
				mu.Lock()
				results = append(results, status)
				mu.Unlock()
			}(cl.Name)
		}
		wg.Wait()
	}

	writeJSON(w, map[string]interface{}{"operators": results})
}

// detectNvidiaOperators probes a single cluster for NVIDIA GPU Operator and
// Network Operator installations by checking well-known namespaces, DaemonSets,
// and Deployments.
func detectNvidiaOperators(ctx context.Context, clusterName string, client kubernetes.Interface) nvidiaOperatorStatus {
	status := nvidiaOperatorStatus{Cluster: clusterName}

	gpuOp := detectGPUOperator(ctx, client)
	if gpuOp != nil {
		status.GPUOperator = gpuOp
	}

	netOp := detectNetworkOperator(ctx, client)
	if netOp != nil {
		status.NetworkOperator = netOp
	}

	return status
}

// detectGPUOperator checks for the NVIDIA GPU Operator by looking for its
// well-known namespace (gpu-operator or nvidia-gpu-operator) and key DaemonSets.
func detectGPUOperator(ctx context.Context, client kubernetes.Interface) *gpuOperatorInfo {
	// Find the operator namespace
	ns := findOperatorNamespace(ctx, client, nvidiaGPUOperatorNamespace, nvidiaGPUOperatorNamespaceAlt)
	if ns == "" {
		return &gpuOperatorInfo{Installed: false}
	}

	info := &gpuOperatorInfo{
		Installed: true,
		Namespace: ns,
		Ready:     true, // assume ready, downgrade if components are unhealthy
	}

	var components []operatorComponent

	// Check for GPU operator deployment
	deps, err := client.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, dep := range deps.Items {
			name := dep.Name
			if strings.Contains(name, "gpu-operator") || strings.Contains(name, "nvidia") {
				ready := dep.Status.ReadyReplicas >= dep.Status.Replicas && dep.Status.Replicas > 0
				compStatus := "Running"
				if !ready {
					compStatus = "NotReady"
					info.Ready = false
				}
				components = append(components, operatorComponent{
					Name:   name,
					Status: compStatus,
				})
				// Extract version from image tag
				if info.Version == "" {
					for _, c := range dep.Spec.Template.Spec.Containers {
						if tag := extractImageTag(c.Image); tag != "" {
							info.Version = tag
							break
						}
					}
				}
			}
		}
	}

	// Check device plugin DaemonSet
	if ds, err := client.AppsV1().DaemonSets(ns).Get(ctx, nvidiaDevicePluginDaemonSet, metav1.GetOptions{}); err == nil {
		ready := ds.Status.NumberReady >= ds.Status.DesiredNumberScheduled && ds.Status.DesiredNumberScheduled > 0
		compStatus := "Running"
		if !ready {
			compStatus = "NotReady"
			info.Ready = false
		}
		components = append(components, operatorComponent{
			Name:   nvidiaDevicePluginDaemonSet,
			Status: compStatus,
		})
		// Try to get driver version from container env vars
		for _, c := range ds.Spec.Template.Spec.Containers {
			for _, env := range c.Env {
				if env.Name == "DRIVER_VERSION" && env.Value != "" {
					info.DriverVersion = env.Value
				}
			}
		}
	}

	// Check GPU feature discovery DaemonSet
	if ds, err := client.AppsV1().DaemonSets(ns).Get(ctx, gpuFeatureDiscoveryDaemonSet, metav1.GetOptions{}); err == nil {
		ready := ds.Status.NumberReady >= ds.Status.DesiredNumberScheduled && ds.Status.DesiredNumberScheduled > 0
		compStatus := "Running"
		if !ready {
			compStatus = "NotReady"
			info.Ready = false
		}
		components = append(components, operatorComponent{
			Name:   gpuFeatureDiscoveryDaemonSet,
			Status: compStatus,
		})
	}

	info.Components = components
	return info
}

// detectNetworkOperator checks for the NVIDIA Network Operator by looking for
// its well-known namespace and Deployments.
func detectNetworkOperator(ctx context.Context, client kubernetes.Interface) *networkOperatorInfo {
	ns := findOperatorNamespace(ctx, client, nvidiaNetworkOperatorNamespace)
	if ns == "" {
		return nil
	}

	info := &networkOperatorInfo{
		Installed: true,
		Namespace: ns,
		Ready:     true,
	}

	var components []operatorComponent

	deps, err := client.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, dep := range deps.Items {
			ready := dep.Status.ReadyReplicas >= dep.Status.Replicas && dep.Status.Replicas > 0
			compStatus := "Running"
			if !ready {
				compStatus = "NotReady"
				info.Ready = false
			}
			components = append(components, operatorComponent{
				Name:   dep.Name,
				Status: compStatus,
			})
			if info.Version == "" {
				for _, c := range dep.Spec.Template.Spec.Containers {
					if tag := extractImageTag(c.Image); tag != "" {
						info.Version = tag
						break
					}
				}
			}
		}
	}

	info.Components = components
	return info
}

// findOperatorNamespace returns the first namespace that exists from the
// given candidates, or "" if none exist.
func findOperatorNamespace(ctx context.Context, client kubernetes.Interface, candidates ...string) string {
	for _, ns := range candidates {
		if _, err := client.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{}); err == nil {
			return ns
		}
	}
	return ""
}

// extractImageTag returns the tag portion of a container image reference,
// e.g. "nvcr.io/nvidia/gpu-operator:v23.9.1" -> "v23.9.1".
func extractImageTag(image string) string {
	// Handle digest references (image@sha256:...)
	if idx := strings.LastIndex(image, "@"); idx != -1 {
		return ""
	}
	if idx := strings.LastIndex(image, ":"); idx != -1 {
		tag := image[idx+1:]
		// Avoid returning "latest" as a meaningful version
		if tag != "latest" && tag != "" {
			return tag
		}
	}
	return ""
}

package agent

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Cilium-specific constants — no magic numbers.
const (
	// ciliumNamespace is the Kubernetes namespace where Cilium components run.
	ciliumNamespace = "kube-system"

	// ciliumDaemonSetName is the DaemonSet that runs the Cilium agent on each node.
	ciliumDaemonSetName = "cilium"

	// hubbleRelayDeployment is the Deployment that provides Hubble relay connectivity.
	hubbleRelayDeployment = "hubble-relay"

	// ciliumLabelK8sApp is the legacy label selector for Cilium agent pods.
	ciliumLabelK8sApp = "k8s-app=cilium"

	// ciliumEndpointResource is the plural resource name for the CiliumEndpoint CRD.
	ciliumEndpointResource = "ciliumendpoints"

	// ciliumEndpointGroup is the API group for Cilium CRDs.
	ciliumEndpointGroup = "cilium.io"

	// ciliumEndpointVersion is the API version for Cilium CRDs.
	ciliumEndpointVersion = "v2"

	// unknownVersion is the fallback when a container image has no parsable tag.
	unknownVersion = "unknown"
)

// ciliumStatusResponse is the JSON response shape for the /cilium-status endpoint.
type ciliumStatusResponse struct {
	Status          string       `json:"status"`
	Nodes           []ciliumNode `json:"nodes"`
	NetworkPolicies int          `json:"networkPolicies"`
	Endpoints       int          `json:"endpoints"`
	Hubble          ciliumHubble `json:"hubble"`
}

// ciliumNode represents a single node running the Cilium agent.
type ciliumNode struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Version string `json:"version"`
}

// ciliumHubble represents Hubble observability status.
type ciliumHubble struct {
	Enabled        bool                `json:"enabled"`
	FlowsPerSecond int                 `json:"flowsPerSecond"`
	Metrics        ciliumHubbleMetrics `json:"metrics"`
}

// ciliumHubbleMetrics holds Hubble flow counters (populated via Prometheus in the future).
type ciliumHubbleMetrics struct {
	Forwarded int `json:"forwarded"`
	Dropped   int `json:"dropped"`
}

// ciliumClusterResult holds the per-cluster Cilium status before aggregation.
type ciliumClusterResult struct {
	nodes           []ciliumNode
	networkPolicies int
	endpoints       int
	hubbleEnabled   bool
	hasCilium       bool
	allReady        bool
	someNotReady    bool
}

// handleCiliumStatus aggregates Cilium status across all deduplicated clusters.
// Route: GET /cilium-status
func (s *Server) handleCiliumStatus(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, ciliumStatusResponse{
			Status: "Unhealthy",
			Nodes:  []ciliumNode{},
			Hubble: ciliumHubble{Metrics: ciliumHubbleMetrics{}},
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	// Use DeduplicatedClusters to avoid double-counting the same physical cluster
	// reachable via multiple kubeconfig contexts.
	clusters, err := s.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		slog.Warn("cilium: failed to list clusters", "error", err)
		writeJSONError(w, http.StatusServiceUnavailable, "unable to list clusters")
		return
	}

	// Fan out queries to all clusters concurrently.
	var mu sync.Mutex
	var wg sync.WaitGroup
	var results []ciliumClusterResult

	for _, cl := range clusters {
		wg.Add(1)
		go func(ctxName string) {
			defer wg.Done()
			result := s.queryCiliumCluster(ctx, ctxName)
			mu.Lock()
			results = append(results, result)
			mu.Unlock()
		}(cl.Context)
	}
	wg.Wait()

	// Aggregate results across all clusters.
	resp := aggregateCiliumResults(results)
	writeJSON(w, resp)
}

// queryCiliumCluster queries a single cluster for Cilium components.
func (s *Server) queryCiliumCluster(ctx context.Context, contextName string) ciliumClusterResult {
	result := ciliumClusterResult{}

	client, err := s.k8sClient.GetClient(contextName)
	if err != nil {
		slog.Debug("cilium: cannot get client", "cluster", contextName, "error", err)
		return result
	}

	// 1. Query Cilium DaemonSet — if missing, Cilium is not installed on this cluster.
	ds, err := client.AppsV1().DaemonSets(ciliumNamespace).Get(ctx, ciliumDaemonSetName, metav1.GetOptions{})
	if err != nil {
		slog.Debug("cilium: DaemonSet not found", "cluster", contextName, "error", err)
		return result
	}
	result.hasCilium = true

	// 2. Query Cilium agent pods for per-node status and version.
	pods, err := client.CoreV1().Pods(ciliumNamespace).List(ctx, metav1.ListOptions{
		LabelSelector: ciliumLabelK8sApp,
	})
	if err != nil {
		slog.Debug("cilium: failed to list pods", "cluster", contextName, "error", err)
	} else {
		allReady := true
		someNotReady := false
		for i := range pods.Items {
			pod := &pods.Items[i]
			nodeStatus := "Healthy"
			if !isCiliumPodReady(pod) {
				nodeStatus = "Unhealthy"
				someNotReady = true
				allReady = false
			}

			version := extractCiliumImageTag(pod.Spec.Containers)

			result.nodes = append(result.nodes, ciliumNode{
				Name:    pod.Spec.NodeName,
				Status:  nodeStatus,
				Version: version,
			})
		}
		// If no pods matched label but DaemonSet exists, fall back to DS status.
		if len(pods.Items) == 0 {
			allReady = ds.Status.NumberReady == ds.Status.DesiredNumberScheduled && ds.Status.DesiredNumberScheduled > 0
			someNotReady = !allReady
		}
		result.allReady = allReady
		result.someNotReady = someNotReady
	}

	// 3. Query NetworkPolicy count across all namespaces.
	netpols, err := client.NetworkingV1().NetworkPolicies("").List(ctx, metav1.ListOptions{})
	if err != nil {
		slog.Debug("cilium: failed to list network policies", "cluster", contextName, "error", err)
	} else {
		result.networkPolicies = len(netpols.Items)
	}

	// 4. Query CiliumEndpoint CRD count (gracefully skip if CRD not installed).
	dynClient, err := s.k8sClient.GetDynamicClient(contextName)
	if err == nil {
		gvr := schema.GroupVersionResource{
			Group:    ciliumEndpointGroup,
			Version:  ciliumEndpointVersion,
			Resource: ciliumEndpointResource,
		}
		endpointList, listErr := dynClient.Resource(gvr).Namespace("").List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Debug("cilium: CiliumEndpoint CRD not available", "cluster", contextName, "error", listErr)
		} else {
			result.endpoints = len(endpointList.Items)
		}
	}

	// 5. Check for Hubble relay deployment.
	_, err = client.AppsV1().Deployments(ciliumNamespace).Get(ctx, hubbleRelayDeployment, metav1.GetOptions{})
	if err == nil {
		result.hubbleEnabled = true
	}

	return result
}

// aggregateCiliumResults merges per-cluster results into a single response.
func aggregateCiliumResults(results []ciliumClusterResult) ciliumStatusResponse {
	resp := ciliumStatusResponse{
		Status: "Unhealthy",
		Nodes:  []ciliumNode{},
		Hubble: ciliumHubble{Metrics: ciliumHubbleMetrics{}},
	}

	hasCiliumAnywhere := false
	allClustersHealthy := true

	for _, r := range results {
		if !r.hasCilium {
			continue
		}
		hasCiliumAnywhere = true
		resp.Nodes = append(resp.Nodes, r.nodes...)
		resp.NetworkPolicies += r.networkPolicies
		resp.Endpoints += r.endpoints

		if r.hubbleEnabled {
			resp.Hubble.Enabled = true
		}

		if r.someNotReady {
			allClustersHealthy = false
		}
	}

	if !hasCiliumAnywhere {
		resp.Status = "Unhealthy"
	} else if allClustersHealthy {
		resp.Status = "Healthy"
	} else {
		resp.Status = "Degraded"
	}

	return resp
}

// isCiliumPodReady checks whether all containers in a Cilium pod report Ready.
func isCiliumPodReady(pod *corev1.Pod) bool {
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady {
			return cond.Status == corev1.ConditionTrue
		}
	}
	return false
}

// extractCiliumImageTag returns the image tag from the first container, or unknownVersion.
func extractCiliumImageTag(containers []corev1.Container) string {
	if len(containers) == 0 {
		return unknownVersion
	}
	image := containers[0].Image
	if idx := strings.LastIndex(image, ":"); idx >= 0 {
		tag := image[idx+1:]
		// Strip leading "v" prefix (e.g. "v1.14.4" → "1.14.4") for consistency.
		return strings.TrimPrefix(tag, "v")
	}
	return unknownVersion
}

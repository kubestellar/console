package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
	k8sErrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// GetIngresses returns Ingresses from clusters
func (h *MCPHandlers) GetIngresses(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "ingresses", handlers.GetDemoIngresses(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.Ingress, error) {
			return client.GetIngresses(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "ingresses", items, errTracker)
	})
}

// GetNetworkPolicies returns NetworkPolicies from clusters
func (h *MCPHandlers) GetNetworkPolicies(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "networkpolicies", handlers.GetDemoNetworkPolicies(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.NetworkPolicy, error) {
			return client.GetNetworkPolicies(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "networkpolicies", items, errTracker)
	})
}

// podNetworkStatsTimeout is the per-cluster timeout for network stats queries.
// Kept short because kubelet stats/summary can be slow on large clusters.
const podNetworkStatsTimeout = 10 * time.Second

// multiTenancyLabels are the app-label values for multi-tenancy infrastructure pods
// whose network stats we want to collect.
var multiTenancyLabels = []string{"virt-launcher", "k3s", "ovnkube-node"}

// classifyComponent maps a pod's app label to a topology component name.
func classifyComponent(labels map[string]string) string {
	app, ok := labels["app"]
	if !ok {
		return ""
	}
	switch {
	case app == "virt-launcher":
		return "kubevirt"
	case app == "k3s":
		return "k3s"
	case app == "ovnkube-node":
		return "ovn"
	default:
		return ""
	}
}

// GetPodNetworkStats returns network interface stats for pods with
// multi-tenancy labels (KubeVirt virt-launcher, K3s server, OVN).
// Data comes from the kubelet stats/summary API via the Kubernetes proxy.
// When stats are unavailable, the handler returns an empty list so the
// frontend can fall back to demo values.
func (h *MCPHandlers) GetPodNetworkStats(c *fiber.Ctx) error {
	// Demo mode: return realistic sample data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "stats", handlers.GetDemoPodNetworkStats())
	}

	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		slog.Error("[MCP] internal error listing healthy clusters for network stats", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	allStats := make([]handlers.PodNetworkStats, 0, len(clusters)*8)
	var errTracker clusterErrorTracker

	clusterCtx, clusterCancel := context.WithCancel(c.Context())
	defer clusterCancel()

	sem := make(chan struct{}, maxConcurrentClusterQueries)
	for _, cl := range clusters {
		wg.Add(1)
		clusterName := cl.Name
		sem <- struct{}{}
		safego.GoWith("mcp-resources/"+clusterName, func() {
			defer func() { <-sem }()
			defer wg.Done()

			ctx, cancel := context.WithTimeout(clusterCtx, podNetworkStatsTimeout)
			defer cancel()

			client, clientErr := h.k8sClient.GetClient(clusterName)
			if clientErr != nil {
				errTracker.add(clusterName, clientErr)
				return
			}

			// Query pods matching each multi-tenancy label in all namespaces
			for _, label := range multiTenancyLabels {
				pods, listErr := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
					LabelSelector: fmt.Sprintf("app=%s", label),
				})
				if listErr != nil {
					// 401/403 — permissions issue, skip silently
					if statusErr, ok := listErr.(*k8sErrors.StatusError); ok {
						code := statusErr.ErrStatus.Code
						if code == 401 || code == 403 {
							continue
						}
					}
					slog.Warn("[MCP] network stats: list pods failed", "app", label, "cluster", clusterName, "error", listErr)
					continue
				}

				for _, pod := range pods.Items {
					component := classifyComponent(pod.Labels)
					if component == "" {
						continue
					}

					// Try kubelet stats/summary API for this pod's node
					nodeName := pod.Spec.NodeName
					if nodeName == "" {
						continue
					}

					ifaceStats := fetchPodInterfaceStats(ctx, client, nodeName, pod.Namespace, pod.Name)
					if len(ifaceStats) == 0 {
						continue
					}

					stat := handlers.PodNetworkStats{
						PodName:    pod.Name,
						Namespace:  pod.Namespace,
						Component:  component,
						Interfaces: ifaceStats,
					}

					mu.Lock()
					allStats = append(allStats, stat)
					mu.Unlock()
				}
			}
		})
	}

	waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
	return c.JSON(errTracker.annotate(fiber.Map{"stats": allStats, "source": "k8s"}))
}

// kubeletStatsSummary is a minimal representation of the kubelet /stats/summary response.
// We only extract the pod-level network interface data.
type kubeletStatsSummary struct {
	Pods []kubeletPodStats `json:"pods"`
}

type kubeletPodStats struct {
	PodRef struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	} `json:"podRef"`
	Network *kubeletNetworkStats `json:"network,omitempty"`
}

type kubeletNetworkStats struct {
	Interfaces []kubeletInterfaceStats `json:"interfaces"`
}

type kubeletInterfaceStats struct {
	Name    string `json:"name"`
	RxBytes *int64 `json:"rxBytes,omitempty"`
	TxBytes *int64 `json:"txBytes,omitempty"`
}

// fetchPodInterfaceStats queries the kubelet stats/summary API via the Kubernetes
// API server proxy and extracts per-interface byte counters for the given pod.
// Returns an empty slice if the kubelet endpoint is unavailable or the pod is not found.
func fetchPodInterfaceStats(
	ctx context.Context,
	client kubernetes.Interface,
	nodeName, podNamespace, podName string,
) []handlers.InterfaceStats {
	// Proxy request: GET /api/v1/nodes/{node}/proxy/stats/summary
	raw, err := client.CoreV1().RESTClient().Get().
		AbsPath(fmt.Sprintf("/api/v1/nodes/%s/proxy/stats/summary", nodeName)).
		DoRaw(ctx)
	if err != nil {
		// Don't log 401/403 — this is expected on locked-down clusters
		return nil
	}

	var summary kubeletStatsSummary
	if jsonErr := json.Unmarshal(raw, &summary); jsonErr != nil {
		slog.Error("[MCP] network stats: failed to parse kubelet summary", "node", nodeName, "error", jsonErr)
		return nil
	}

	// Find the target pod in the summary
	for _, ps := range summary.Pods {
		if ps.PodRef.Name == podName && ps.PodRef.Namespace == podNamespace && ps.Network != nil {
			result := make([]handlers.InterfaceStats, 0, len(ps.Network.Interfaces))
			for _, iface := range ps.Network.Interfaces {
				var rxBytes, txBytes int64
				if iface.RxBytes != nil {
					rxBytes = *iface.RxBytes
				}
				if iface.TxBytes != nil {
					txBytes = *iface.TxBytes
				}
				result = append(result, handlers.InterfaceStats{
					Name:    iface.Name,
					RxBytes: rxBytes,
					TxBytes: txBytes,
					// Rate estimation: the kubelet stats/summary gives cumulative
					// byte counters, not per-second rates. The frontend computes
					// deltas between successive polls.  We provide a rough estimate
					// here by dividing by the expected poll interval.
					RxBytesPerSec: rxBytes / handlers.NetworkStatsPollIntervalSec,
					TxBytesPerSec: txBytes / handlers.NetworkStatsPollIntervalSec,
				})
			}
			return result
		}
	}

	return nil
}

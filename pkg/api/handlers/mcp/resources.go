package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"

	"github.com/kubestellar/console/pkg/api/audit"

	k8sErrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/kubestellar/console/pkg/k8s"
)

func (h *MCPHandlers) GetConfigMaps(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "configmaps", handlers.GetDemoConfigMaps(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ConfigMap, error) {
			return client.GetConfigMaps(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "configmaps", items, errTracker)
	})
}

// GetSecrets returns Secrets from clusters.
// Requires editor or admin role — Secrets contain sensitive data (CWE-862, #16731).
func (h *MCPHandlers) GetSecrets(c *fiber.Ctx) error {
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "secrets", handlers.GetDemoSecrets(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.Secret, error) {
			return client.GetSecrets(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "secrets", items, errTracker)
	})
}

// GetServiceAccounts returns ServiceAccounts from clusters
func (h *MCPHandlers) GetServiceAccounts(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "serviceAccounts", handlers.GetDemoServiceAccounts(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ServiceAccount, error) {
			return client.GetServiceAccounts(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "serviceAccounts", items, errTracker)
	})
}

// GetPVCs returns PersistentVolumeClaims from clusters
func (h *MCPHandlers) GetPVCs(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "pvcs", handlers.GetDemoPVCs(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.PVC, error) {
			return client.GetPVCs(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "pvcs", items, errTracker)
	})
}

// GetPVs returns PersistentVolumes from clusters
func (h *MCPHandlers) GetPVs(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	return h.withDemoFallback(c, "pvs", handlers.GetDemoPVs(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.PV, error) {
			return client.GetPVs(ctx, clusterName)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "pvs", items, errTracker)
	})
}

// GetResourceQuotas returns resource quotas from clusters
func (h *MCPHandlers) GetResourceQuotas(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "resourceQuotas", handlers.GetDemoResourceQuotas(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ResourceQuota, error) {
			return client.GetResourceQuotas(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "resourceQuotas", items, errTracker)
	})
}

// GetLimitRanges returns limit ranges from clusters
func (h *MCPHandlers) GetLimitRanges(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "limitRanges", handlers.GetDemoLimitRanges(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.LimitRange, error) {
			return client.GetLimitRanges(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "limitRanges", items, errTracker)
	})
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota
func (h *MCPHandlers) CreateOrUpdateResourceQuota(c *fiber.Ctx) error {
	// SECURITY (#7490, #7492): mutating endpoint requires editor or admin role.
	// This also covers the ensure_namespace path (#7492) since the whole handler
	// is gated before any namespace or quota creation occurs.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	var req struct {
		Cluster         string            `json:"cluster"`
		Name            string            `json:"name"`
		Namespace       string            `json:"namespace"`
		Hard            map[string]string `json:"hard"`
		Labels          map[string]string `json:"labels,omitempty"`
		Annotations     map[string]string `json:"annotations,omitempty"`
		EnsureNamespace bool              `json:"ensure_namespace,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Cluster == "" || req.Name == "" || req.Namespace == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, name, and namespace are required"})
	}
	if err := mcpValidateClusterAndNamespace(req.Cluster, req.Namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", req.Name); err != nil {
		return err
	}

	if len(req.Hard) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "At least one resource limit is required in 'hard'"})
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		// Auto-create namespace if requested (used by GPU reservation flow)
		if req.EnsureNamespace {
			if err := h.k8sClient.EnsureNamespaceExists(ctx, req.Cluster, req.Namespace); err != nil {
				slog.Error("[MCP] failed to create namespace", "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
			}
		}

		spec := k8s.ResourceQuotaSpec{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Hard:        req.Hard,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		}

		quota, err := h.k8sClient.CreateOrUpdateResourceQuota(ctx, req.Cluster, spec)
		if err != nil {
			return HandleK8sError(c, err)
		}

		audit.Log(c, audit.ActionCreateResourceQuota, "resource_quota", req.Name,
			"cluster="+req.Cluster, "namespace="+req.Namespace)

		return c.JSON(fiber.Map{"resourceQuota": quota, "source": "k8s"})
	}

	return handlers.ErrNoClusterAccess(c)
}

// DeleteResourceQuota deletes a ResourceQuota
func (h *MCPHandlers) DeleteResourceQuota(c *fiber.Ctx) error {
	// SECURITY (#7491): destructive endpoint requires editor or admin role.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	name := c.Query("name")

	if cluster == "" || namespace == "" || name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, namespace, and name are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", name); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		err := h.k8sClient.DeleteResourceQuota(ctx, cluster, namespace, name)
		if err != nil {
			return HandleK8sError(c, err)
		}

		audit.Log(c, audit.ActionDeleteResourceQuota, "resource_quota", name,
			"cluster="+cluster, "namespace="+namespace)

		return c.JSON(fiber.Map{"deleted": true, "name": name, "namespace": namespace, "cluster": cluster})
	}

	return handlers.ErrNoClusterAccess(c)
}

// GetPodLogs returns logs from a pod
func (h *MCPHandlers) GetPodLogs(c *fiber.Ctx) error {
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "logs", handlers.GetDemoPodLogs())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	tailLines := c.QueryInt("tail", 100)

	if cluster == "" || namespace == "" || pod == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, namespace, and pod are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("pod", pod); err != nil {
		return err
	}
	if err := mcpValidateName("container", container); err != nil {
		return err
	}
	if err := mcpValidatePositiveInt("tail", tailLines, mcpMaxTailLines); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		logs, err := h.k8sClient.GetPodLogs(ctx, cluster, namespace, pod, container, int64(tailLines))
		if err != nil {
			return HandleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"logs": logs, "source": "k8s"})
	}

	return handlers.ErrNoClusterAccess(c)
}

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

package handlers

import (
	"context"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/apimachinery/pkg/api/resource"
)

// limaListTimeout is the timeout for listing Lima nodes across all clusters.
const limaListTimeout = 30 * time.Second

// LimaHandlers handles Lima VM status API endpoints.
type LimaHandlers struct {
	k8sClient *k8s.MultiClusterClient
}

// NewLimaHandlers creates a new Lima handlers instance.
func NewLimaHandlers(k8sClient *k8s.MultiClusterClient) *LimaHandlers {
	return &LimaHandlers{k8sClient: k8sClient}
}

// LimaInstanceSummary represents a Lima instance returned by GET /api/lima.
type LimaInstanceSummary struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	CPUCores    int    `json:"cpuCores"`
	MemoryGB    int    `json:"memoryGB"`
	DiskGB      int    `json:"diskGB"`
	Arch        string `json:"arch"`
	OS          string `json:"os"`
	LimaVersion string `json:"limaVersion"`
	LastSeen    string `json:"lastSeen"`
}

// LimaListResponse is the response for GET /api/lima.
type LimaListResponse struct {
	LimaInstances []LimaInstanceSummary `json:"limaInstances"`
	IsDemoData    bool                  `json:"isDemoData"`
}

// ListLima returns Lima instances discovered from Kubernetes nodes.
//
// Contract:
//   - 200 + { limaInstances: [...], isDemoData: false } when at least one cluster
//     query succeeded (including a legitimate empty list when no Lima nodes exist)
//   - 503 + { limaInstances: [], isDemoData: true } when no live cluster path is
//     available (no client or all cluster queries failed)
//
// GET /api/lima
func (h *LimaHandlers) ListLima(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(LimaListResponse{
			LimaInstances: getDemoLimaInstances(),
			IsDemoData:    true,
		})
	}

	if h.k8sClient == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(LimaListResponse{
			LimaInstances: []LimaInstanceSummary{},
			IsDemoData:    true,
		})
	}

	cluster := c.Query("cluster")
	if cluster != "" {
		if err := mcpValidateName("cluster", cluster); err != nil {
			return err
		}
	}

	ctx, cancel := context.WithTimeout(c.Context(), limaListTimeout)
	defer cancel()

	clusters := make([]k8s.ClusterInfo, 0)
	if cluster != "" {
		clusters = append(clusters, k8s.ClusterInfo{Name: cluster, Context: cluster})
	} else {
		deduplicated, err := h.k8sClient.DeduplicatedClusters(ctx)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(LimaListResponse{
				LimaInstances: []LimaInstanceSummary{},
				IsDemoData:    true,
			})
		}
		clusters = deduplicated
	}

	if len(clusters) == 0 {
		return c.Status(fiber.StatusServiceUnavailable).JSON(LimaListResponse{
			LimaInstances: []LimaInstanceSummary{},
			IsDemoData:    true,
		})
	}

	instances := make([]LimaInstanceSummary, 0, len(clusters))
	successfulClusterQueries := 0

	for _, cl := range clusters {
		nodes, err := h.k8sClient.GetNodes(ctx, cl.Name)
		if err != nil {
			continue
		}

		successfulClusterQueries++
		for _, node := range nodes {
			if !isLimaNode(node) {
				continue
			}
			instances = append(instances, mapNodeToLimaInstance(node))
		}
	}

	if successfulClusterQueries == 0 {
		return c.Status(fiber.StatusServiceUnavailable).JSON(LimaListResponse{
			LimaInstances: []LimaInstanceSummary{},
			IsDemoData:    true,
		})
	}

	return c.JSON(LimaListResponse{
		LimaInstances: instances,
		IsDemoData:    false,
	})
}

func isLimaNode(node k8s.NodeInfo) bool {
	if strings.HasPrefix(strings.ToLower(node.Name), "lima-") {
		return true
	}

	if node.Labels != nil {
		if _, ok := node.Labels["lima.sh/instance"]; ok {
			return true
		}
	}

	return strings.Contains(strings.ToLower(node.OSImage), "lima")
}

func mapNodeToLimaInstance(node k8s.NodeInfo) LimaInstanceSummary {
	status := limaNodeStatus(node.Conditions)

	limaVersion := "unknown"
	if node.Labels != nil {
		if v, ok := node.Labels["lima.sh/version"]; ok && strings.TrimSpace(v) != "" {
			limaVersion = v
		}
	}

	return LimaInstanceSummary{
		Name:        node.Name,
		Status:      status,
		CPUCores:    parseCPUCores(node.CPUCapacity),
		MemoryGB:    parseCapacityGB(node.MemoryCapacity),
		DiskGB:      parseCapacityGB(node.StorageCapacity),
		Arch:        valueOrUnknown(node.Architecture),
		OS:          firstNonEmpty(node.OSImage, node.OS, "Linux"),
		LimaVersion: limaVersion,
		LastSeen:    time.Now().UTC().Format(time.RFC3339),
	}
}

func limaNodeStatus(conditions []k8s.NodeCondition) string {
	hasPressure := false
	isReady := false

	for _, c := range conditions {
		if c.Type == "Ready" && strings.EqualFold(c.Status, "True") {
			isReady = true
		}

		if (c.Type == "DiskPressure" || c.Type == "MemoryPressure" || c.Type == "PIDPressure") && strings.EqualFold(c.Status, "True") {
			hasPressure = true
		}
	}

	if hasPressure {
		return "broken"
	}

	if isReady {
		return "running"
	}

	return "stopped"
}

func parseCPUCores(raw string) int {
	quantity, err := resource.ParseQuantity(strings.TrimSpace(raw))
	if err != nil {
		if strings.HasSuffix(raw, "m") {
			milliRaw := strings.TrimSpace(strings.TrimSuffix(raw, "m"))
			milli, convErr := strconv.Atoi(milliRaw)
			if convErr == nil && milli > 0 {
				return int(math.Ceil(float64(milli) / 1000.0))
			}
		}

		cores, convErr := strconv.Atoi(strings.TrimSpace(raw))
		if convErr == nil && cores > 0 {
			return cores
		}

		return 0
	}

	milli := quantity.MilliValue()
	if milli <= 0 {
		return 0
	}

	return int(math.Ceil(float64(milli) / 1000.0))
}

func parseCapacityGB(raw string) int {
	quantity, err := resource.ParseQuantity(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}

	bytes := quantity.Value()
	if bytes <= 0 {
		return 0
	}

	const bytesPerGiB = 1024 * 1024 * 1024
	return int(math.Round(float64(bytes) / float64(bytesPerGiB)))
}

func valueOrUnknown(v string) string {
	trimmed := strings.TrimSpace(v)
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

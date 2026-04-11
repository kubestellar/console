package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// svcExportListTimeout is the timeout for listing ServiceExports across all clusters.
const svcExportListTimeout = 30 * time.Second

// serviceExportGVR is the GroupVersionResource for MCS ServiceExports
var serviceExportGVR = schema.GroupVersionResource{
	Group:    "multicluster.x-k8s.io",
	Version:  "v1alpha1",
	Resource: "serviceexports",
}

// ServiceExportHandlers handles MCS ServiceExport API endpoints
type ServiceExportHandlers struct {
	k8sClient *k8s.MultiClusterClient
}

// NewServiceExportHandlers creates a new ServiceExport handlers instance
func NewServiceExportHandlers(k8sClient *k8s.MultiClusterClient) *ServiceExportHandlers {
	return &ServiceExportHandlers{
		k8sClient: k8sClient,
	}
}

// ServiceExportSummary represents a ServiceExport as returned by the API
type ServiceExportSummary struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Cluster   string   `json:"cluster"`
	Status    string   `json:"status"`
	Message   string   `json:"message,omitempty"`
	CreatedAt string   `json:"createdAt"`
	Targets   []string `json:"targetClusters,omitempty"`
}

// ServiceExportListResponse is the response for GET /api/service-exports.
//
// ClusterErrors is non-nil whenever at least one cluster could not be queried
// — callers should treat a 200 response with a non-empty ClusterErrors slice
// as a partial result, not a full success. If every cluster failed the
// handler returns 500 with the same structure populated so operators can see
// which clusters failed.
type ServiceExportListResponse struct {
	Exports       []ServiceExportSummary `json:"exports"`
	IsDemoData    bool                   `json:"isDemoData"`
	ClusterErrors []ClusterError         `json:"clusterErrors,omitempty"`
}

// HTTP status code for service unavailable
const statusServiceUnavailableSvcExport = 503

// ListServiceExports returns all ServiceExports across clusters
// GET /api/service-exports
func (h *ServiceExportHandlers) ListServiceExports(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(statusServiceUnavailableSvcExport).JSON(ServiceExportListResponse{
			Exports:    []ServiceExportSummary{},
			IsDemoData: true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), svcExportListTimeout)
	defer cancel()

	clusters, err := h.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		var listErr error
		clusters, listErr = h.k8sClient.ListClusters(ctx)
		if listErr != nil {
			return c.Status(500).JSON(fiber.Map{"error": "cluster discovery failed", "isDemoData": false})
		}
	}

	allExports := make([]ServiceExportSummary, 0)
	clusterErrors := make([]ClusterError, 0)
	// successCount tracks how many clusters were queried successfully (even if
	// they returned zero exports). We use this instead of len(allExports) > 0
	// because a cluster can legitimately have no ServiceExports and still
	// count as "reachable".
	successCount := 0

	for _, cluster := range clusters {
		client, err := h.k8sClient.GetDynamicClient(cluster.Name)
		if err != nil {
			clusterErrors = append(clusterErrors, ClusterError{
				Cluster:   cluster.Name,
				ErrorType: "dynamic_client_unavailable",
				Message:   err.Error(),
			})
			continue
		}

		exportList, err := client.Resource(serviceExportGVR).Namespace("").List(ctx, metav1.ListOptions{})
		if err != nil {
			// Previously this was skipped silently on the assumption that the
			// MCS CRDs may not be installed. That assumption masked real
			// failures — auth errors, RBAC denials, network timeouts. Surface
			// the error so clients can distinguish "cluster has no exports"
			// from "cluster could not be queried" (#6483).
			clusterErrors = append(clusterErrors, ClusterError{
				Cluster:   cluster.Name,
				ErrorType: "list_failed",
				Message:   err.Error(),
			})
			continue
		}

		successCount++
		for _, item := range exportList.Items {
			exp := parseServiceExportFromUnstructured(&item, cluster.Name)
			if exp != nil {
				allExports = append(allExports, *exp)
			}
		}
	}

	resp := ServiceExportListResponse{
		Exports:       allExports,
		IsDemoData:    false,
		ClusterErrors: clusterErrors,
	}

	// If every cluster failed, return 500 so callers treat this as a hard
	// failure instead of an empty-but-successful listing (#6483). If at least
	// one cluster succeeded the response is 200 with per-cluster errors
	// reported in-band.
	if len(clusters) > 0 && successCount == 0 {
		return c.Status(500).JSON(resp)
	}
	return c.JSON(resp)
}

// parseServiceExportFromUnstructured extracts ServiceExport info from an unstructured object
func parseServiceExportFromUnstructured(item *unstructured.Unstructured, cluster string) *ServiceExportSummary {
	name := item.GetName()
	namespace := item.GetNamespace()
	createdAt := item.GetCreationTimestamp().Format(time.RFC3339)

	// Derive status from conditions
	status := "Unknown"
	message := ""
	if statusObj, ok := item.Object["status"].(map[string]interface{}); ok {
		if conditions, ok := statusObj["conditions"].([]interface{}); ok {
			for _, cond := range conditions {
				condMap, ok := cond.(map[string]interface{})
				if !ok {
					continue
				}
				condType, _ := condMap["type"].(string)
				condStatus, _ := condMap["status"].(string)
				condMsg, _ := condMap["message"].(string)

				if condType == "Ready" || condType == "Valid" {
					if condStatus == "True" {
						status = "Ready"
					} else {
						status = "Pending"
						message = condMsg
					}
				}
				// A conflict condition overrides to Failed
				if condType == "Conflict" && condStatus == "True" {
					status = "Failed"
					message = condMsg
				}
			}
		}
	}

	// If no conditions found, check if recently created (within 5 min) → Pending, else Ready
	if status == "Unknown" {
		const recentThresholdMin = 5
		created := item.GetCreationTimestamp().Time
		if time.Since(created) < time.Duration(recentThresholdMin)*time.Minute {
			status = "Pending"
			message = "Waiting for controller to reconcile"
		} else {
			status = "Ready"
		}
	}

	return &ServiceExportSummary{
		Name:      name,
		Namespace: namespace,
		Cluster:   cluster,
		Status:    status,
		Message:   message,
		CreatedAt: createdAt,
	}
}

package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

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

// ServiceExportListResponse is the response for GET /api/service-exports
type ServiceExportListResponse struct {
	Exports    []ServiceExportSummary `json:"exports"`
	IsDemoData bool                   `json:"isDemoData"`
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

	clusters, err := h.k8sClient.DeduplicatedClusters(c.Context())
	if err != nil {
		clusters, _ = h.k8sClient.ListClusters(c.Context())
	}

	var allExports []ServiceExportSummary

	for _, cluster := range clusters {
		client, err := h.k8sClient.GetDynamicClient(cluster.Name)
		if err != nil {
			continue
		}

		exportList, err := client.Resource(serviceExportGVR).Namespace("").List(c.Context(), metav1.ListOptions{})
		if err != nil {
			// MCS API may not be installed on this cluster — skip silently
			continue
		}

		for _, item := range exportList.Items {
			exp := parseServiceExportFromUnstructured(&item, cluster.Name)
			if exp != nil {
				allExports = append(allExports, *exp)
			}
		}
	}

	return c.JSON(ServiceExportListResponse{
		Exports:    allExports,
		IsDemoData: false,
	})
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

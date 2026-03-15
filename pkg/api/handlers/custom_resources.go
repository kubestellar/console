package handlers

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// CustomResourceItem represents a single custom resource instance returned by the API.
type CustomResourceItem struct {
	Name      string                 `json:"name"`
	Namespace string                 `json:"namespace,omitempty"`
	Cluster   string                 `json:"cluster"`
	Status    map[string]interface{} `json:"status,omitempty"`
	Spec      map[string]interface{} `json:"spec,omitempty"`
	Labels    map[string]string      `json:"labels,omitempty"`
}

// CustomResourceResponse is the response for GET /api/mcp/custom-resources.
type CustomResourceResponse struct {
	Items      []CustomResourceItem `json:"items"`
	IsDemoData bool                 `json:"isDemoData"`
}

// GetCustomResources queries custom resource instances across clusters.
//
// Query parameters:
//
//	group     — API group (e.g. "keda.sh", "kafka.strimzi.io")
//	version   — API version (e.g. "v1alpha1", "v1beta2")
//	resource  — plural resource name (e.g. "scaledobjects", "kafkas")
//	cluster   — (optional) restrict to a single cluster
//	namespace — (optional) restrict to a single namespace
//
// Kubernetes RBAC controls access — if the user's kubeconfig cannot list the
// resource, the per-cluster query silently returns zero items.
func (h *MCPHandlers) GetCustomResources(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(CustomResourceResponse{Items: []CustomResourceItem{}, IsDemoData: true})
	}

	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if group == "" || version == "" || resource == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "group, version, and resource query parameters are required",
		})
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(CustomResourceResponse{Items: []CustomResourceItem{}, IsDemoData: true})
	}

	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}

	// Single-cluster path
	if cluster != "" {
		items, err := h.listCR(c.Context(), cluster, namespace, gvr)
		if err != nil {
			log.Printf("custom-resources: cluster %s: %v", cluster, err)
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to list %s: %v", resource, err)})
		}
		return c.JSON(CustomResourceResponse{Items: items, IsDemoData: false})
	}

	// Fan-out across all healthy clusters
	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		log.Printf("custom-resources: HealthyClusters: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	allItems := make([]CustomResourceItem, 0)

	for _, cl := range clusters {
		wg.Add(1)
		go func(clusterName string) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), mcpDefaultTimeout)
			defer cancel()

			items, err := h.listCR(ctx, clusterName, namespace, gvr)
			if err != nil {
				// RBAC denied or CRD not installed on this cluster — skip silently
				return
			}
			if len(items) > 0 {
				mu.Lock()
				allItems = append(allItems, items...)
				mu.Unlock()
			}
		}(cl.Name)
	}

	waitWithDeadline(&wg, maxResponseDeadline)
	return c.JSON(CustomResourceResponse{Items: allItems, IsDemoData: false})
}

// listCR queries a single cluster for custom resource instances using the dynamic client.
func (h *MCPHandlers) listCR(
	ctx context.Context,
	clusterName, namespace string,
	gvr schema.GroupVersionResource,
) ([]CustomResourceItem, error) {
	dynClient, err := h.k8sClient.GetDynamicClient(clusterName)
	if err != nil {
		return nil, fmt.Errorf("dynamic client: %w", err)
	}

	var uList interface{}
	if namespace != "" {
		uList, err = dynClient.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		uList, err = dynClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("list %s: %w", gvr.Resource, err)
	}

	// Dynamic client returns *unstructured.UnstructuredList
	type unstructuredList interface {
		UnstructuredContent() map[string]interface{}
	}
	ul, ok := uList.(unstructuredList)
	if !ok {
		return nil, fmt.Errorf("unexpected return type %T", uList)
	}

	content := ul.UnstructuredContent()
	rawItems, _ := content["items"].([]interface{})
	items := make([]CustomResourceItem, 0, len(rawItems))

	for _, raw := range rawItems {
		obj, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		items = append(items, parseCRItem(obj, clusterName))
	}

	return items, nil
}

// parseCRItem extracts the key fields from an unstructured custom resource.
func parseCRItem(obj map[string]interface{}, clusterName string) CustomResourceItem {
	item := CustomResourceItem{Cluster: clusterName}

	if metadata, ok := obj["metadata"].(map[string]interface{}); ok {
		item.Name, _ = metadata["name"].(string)
		item.Namespace, _ = metadata["namespace"].(string)
		if labels, ok := metadata["labels"].(map[string]interface{}); ok {
			item.Labels = make(map[string]string, len(labels))
			for k, v := range labels {
				if s, ok := v.(string); ok {
					item.Labels[k] = s
				}
			}
		}
	}

	if status, ok := obj["status"].(map[string]interface{}); ok {
		item.Status = status
	}
	if spec, ok := obj["spec"].(map[string]interface{}); ok {
		item.Spec = spec
	}

	return item
}

package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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
// Errors maps cluster name -> error message for per-cluster failures (#7967,
// #7973). Empty/missing when all fanned-out clusters succeeded.
type CustomResourceResponse struct {
	Items      []CustomResourceItem `json:"items"`
	Errors     map[string]string    `json:"errors,omitempty"`
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
	// SECURITY (#7487): custom resource listing can expose sensitive spec/status
	// data; require a valid console role (viewer or above).
	if err := requireViewerOrAbove(c, h.store); err != nil {
		return err
	}

	if isDemoMode(c) {
		return c.JSON(CustomResourceResponse{Items: []CustomResourceItem{}, IsDemoData: true})
	}

	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if group == "" || version == "" || resource == "" {
		// Return an empty list instead of 400 — callers may query the base URL
		// before their data context has finished hydrating (e.g. on React mount).
		return c.JSON(CustomResourceResponse{Items: []CustomResourceItem{}, IsDemoData: false})
	}

	// Validate GVR parameters against Kubernetes naming conventions
	if !isValidK8sName(group) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid group parameter — must match DNS subdomain format"})
	}
	if !isValidK8sVersion(version) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid version parameter — must be alphanumeric (e.g. v1, v1beta1)"})
	}
	if !isValidK8sName(resource) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid resource parameter — must match DNS label format"})
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(CustomResourceResponse{Items: []CustomResourceItem{}, IsDemoData: true})
	}

	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}

	// Single-cluster path
	if cluster != "" {
		items, err := h.listCR(c.Context(), cluster, namespace, gvr)
		if err != nil {
			slog.Warn("custom-resources: cluster error", "cluster", cluster, "error", err)
			// #7973: distinguish RBAC 403 (caller has no permission) from
			// infrastructure 500 (apiserver unreachable, CRD not installed,
			// etc.). Previously both were collapsed into a 500, which hid
			// permission errors from the UI and made them look like server
			// bugs.
			if apierrors.IsForbidden(err) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error":   fmt.Sprintf("forbidden: %v", err),
					"cluster": cluster,
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("failed to list %s: %v", resource, err)})
		}
		return c.JSON(CustomResourceResponse{Items: items, IsDemoData: false})
	}

	// Fan-out across all healthy clusters
	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		slog.Warn("custom-resources: HealthyClusters failed", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	allItems := make([]CustomResourceItem, 0)
	clusterErrors := make(map[string]string)

	clusterCtx, clusterCancel := context.WithCancel(c.Context())
	defer clusterCancel()

	// Bound concurrency to avoid spawning unbounded goroutines for large fleets.
	const crFetchConcurrency = 10
	sem := make(chan struct{}, crFetchConcurrency)

	for _, cl := range clusters {
		wg.Add(1)
		go func(clusterName string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ctx, cancel := context.WithTimeout(clusterCtx, mcpDefaultTimeout)
			defer cancel()

			items, err := h.listCR(ctx, clusterName, namespace, gvr)
			if err != nil {
				// #7973: propagate per-cluster errors instead of silently
				// dropping them. Distinguish RBAC 403 from infrastructure
				// errors and CRD-not-installed (NotFound) in the error tag
				// so the UI can show something actionable.
				mu.Lock()
				switch {
				case apierrors.IsForbidden(err):
					clusterErrors[clusterName] = "forbidden: " + err.Error()
				case apierrors.IsNotFound(err):
					// CRD not installed on this cluster — common on multi-
					// cluster fleets where only some clusters run an operator.
					// Omit from errors map: not an actionable failure.
				default:
					clusterErrors[clusterName] = err.Error()
				}
				mu.Unlock()
				return
			}
			if len(items) > 0 {
				mu.Lock()
				allItems = append(allItems, items...)
				mu.Unlock()
			}
		}(cl.Name)
	}

	waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
	resp := CustomResourceResponse{Items: allItems, IsDemoData: false}
	if len(clusterErrors) > 0 {
		resp.Errors = clusterErrors
	}
	return c.JSON(resp)
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
	rawItems, ok := content["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for items field in %s response", gvr.Resource)
	}
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
		if name, ok := metadata["name"].(string); ok {
			item.Name = name
		} else {
			slog.Warn("custom resource metadata.name is not a string",
				slog.String("cluster", clusterName),
				slog.String("actual_type", fmt.Sprintf("%T", metadata["name"])))
		}

		if namespace, ok := metadata["namespace"].(string); ok {
			item.Namespace = namespace
		} else if metadata["namespace"] != nil {
			slog.Warn("custom resource metadata.namespace is not a string",
				slog.String("cluster", clusterName),
				slog.String("actual_type", fmt.Sprintf("%T", metadata["namespace"])))
		}

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

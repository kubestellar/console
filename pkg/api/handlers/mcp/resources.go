package mcp

import (
	"context"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"

	"github.com/kubestellar/console/pkg/api/audit"

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

// CallToolRequest represents a request to call an MCP tool
type CallToolRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// AllowedOpsTools is the whitelist of kubestellar-ops tools that can be called via API
// SECURITY: Only read-only tools are allowed by default to prevent unauthorized modifications
var AllowedOpsTools = map[string]bool{
	// Cluster discovery and health
	"list_clusters":       true,
	"get_cluster_health":  true,
	"detect_cluster_type": true,
	"audit_kubeconfig":    true,

	// Read-only queries
	"get_pods":           true,
	"get_deployments":    true,
	"get_services":       true,
	"get_nodes":          true,
	"get_events":         true,
	"get_warning_events": true,
	"describe_pod":       true,
	"get_pod_logs":       true,

	// Issue detection (read-only analysis)
	"find_pod_issues":        true,
	"find_deployment_issues": true,
	"check_resource_limits":  true,
	"check_security_issues":  true,

	// RBAC queries (read-only)
	"get_roles":                   true,
	"get_cluster_roles":           true,
	"get_role_bindings":           true,
	"get_cluster_role_bindings":   true,
	"can_i":                       true,
	"analyze_subject_permissions": true,
	"describe_role":               true,

	// Upgrade checking (read-only)
	"get_cluster_version_info":    true,
	"check_olm_operator_upgrades": true,
	"check_helm_release_upgrades": true,
	"get_upgrade_prerequisites":   true,
	"get_upgrade_status":          true,

	// Ownership analysis (read-only)
	"find_resource_owners":        true,
	"check_gatekeeper":            true,
	"get_ownership_policy_status": true,
	"list_ownership_violations":   true,
}

// AllowedDeployTools is the whitelist of kubestellar-deploy tools that can be called via API
// SECURITY: Write operations require explicit allowlisting
var AllowedDeployTools = map[string]bool{
	// Read-only operations
	"get_app_instances":          true,
	"get_app_status":             true,
	"get_app_logs":               true,
	"list_cluster_capabilities":  true,
	"find_clusters_for_workload": true,
	"detect_drift":               true,
	"preview_changes":            true,

	// Write operations - disabled by default for security
	// Enable these only after proper authorization checks
	// "deploy_app":     false,
	// "scale_app":      false,
	// "patch_app":      false,
	// "sync_from_git":  false,
	// "reconcile":      false,
}

// GetWasmCloudHosts returns wasmCloud hosts from clusters
func (h *MCPHandlers) GetWasmCloudHosts(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "hosts", handlers.GetWasmCloudHosts())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"hosts": []interface{}{}, "source": "k8s"})
}

// GetWasmCloudActors returns wasmCloud actors from clusters
func (h *MCPHandlers) GetWasmCloudActors(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "actors", handlers.GetWasmCloudActors())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"actors": []interface{}{}, "source": "k8s"})
}

// validateToolName checks if a tool name is in the allowed list
func validateToolName(name string, allowedTools map[string]bool) error {
	if name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "tool name is required")
	}

	// Check if tool is in allowlist
	allowed, exists := allowedTools[name]
	if !exists || !allowed {
		slog.Warn("[MCP] SECURITY: blocked unauthorized tool call", "tool", name)
		return fiber.NewError(fiber.StatusForbidden, "tool not allowed")
	}

	return nil
}

// CallOpsTool calls a kubestellar-ops tool
func (h *MCPHandlers) CallOpsTool(c *fiber.Ctx) error {
	// SECURITY (#7495): tool-call endpoint can expose sensitive cluster data;
	// require at least editor role to invoke tools.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// SECURITY: Validate tool name against whitelist
	if err := validateToolName(req.Name, AllowedOpsTools); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	result, err := h.bridge.CallOpsTool(ctx, req.Name, req.Arguments)
	if err != nil {
		return HandleK8sError(c, err)
	}

	return c.JSON(result)
}

// CallDeployTool calls a kubestellar-deploy tool
func (h *MCPHandlers) CallDeployTool(c *fiber.Ctx) error {
	// SECURITY (#7495): tool-call endpoint can expose sensitive cluster data;
	// require at least editor role to invoke tools.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// SECURITY: Validate tool name against whitelist
	if err := validateToolName(req.Name, AllowedDeployTools); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	result, err := h.bridge.CallDeployTool(ctx, req.Name, req.Arguments)
	if err != nil {
		return HandleK8sError(c, err)
	}

	return c.JSON(result)
}

// GetFlatcarNodes returns nodes running Flatcar Container Linux across all clusters.
// Detection is performed server-side: only nodes whose OSImage contains "flatcar"
// (case-insensitive) are included in the response.
func (h *MCPHandlers) GetFlatcarNodes(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	return h.withDemoFallback(c, "nodes", handlers.GetDemoFlatcarNodes(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.FlatcarNodeInfo, error) {
			return client.GetFlatcarNodes(ctx, clusterName)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "nodes", items, errTracker)
	})
}

// GetResourceYAML returns the YAML representation of a Kubernetes resource.
// This is a stub handler — full resource YAML retrieval requires dynamic client
// support which will be added in a future iteration. For now, it returns an
// empty yaml field so the frontend can gracefully fall back to demo YAML.
func (h *MCPHandlers) GetResourceYAML(c *fiber.Ctx) error {
	if handlers.IsDemoMode(c) {
		return c.JSON(fiber.Map{"yaml": "", "source": "demo"})
	}

	return c.JSON(fiber.Map{"yaml": "", "source": "stub"})
}

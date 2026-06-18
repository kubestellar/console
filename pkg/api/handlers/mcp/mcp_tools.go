package mcp

import (
	"context"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
)

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

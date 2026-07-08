package mcp

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// validateToolName tests — security-critical allowlist enforcement
// =============================================================================

func TestValidateToolName_EmptyName(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true}
	err := validateToolName("", allowed)
	require.Error(t, err, "expected error for empty tool name")
	fe, ok := err.(*fiber.Error)
	require.True(t, ok, "expected *fiber.Error, got %T", err)
	assert.Equal(t, fiber.StatusBadRequest, fe.Code)
}

func TestValidateToolName_AllowedTool(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true, "get_pods": true}
	assert.NoError(t, validateToolName("list_clusters", allowed))
}

func TestValidateToolName_DisallowedTool(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true}
	err := validateToolName("deploy_app", allowed)
	require.Error(t, err, "expected error for disallowed tool")
	fe, ok := err.(*fiber.Error)
	require.True(t, ok, "expected *fiber.Error, got %T", err)
	assert.Equal(t, fiber.StatusForbidden, fe.Code)
}

func TestValidateToolName_ExplicitlyFalse(t *testing.T) {
	// A tool that exists in the map but is set to false should be denied
	allowed := map[string]bool{"deploy_app": false}
	err := validateToolName("deploy_app", allowed)
	require.Error(t, err, "expected error for explicitly-false tool")
	fe, ok := err.(*fiber.Error)
	require.True(t, ok, "expected *fiber.Error, got %T", err)
	assert.Equal(t, fiber.StatusForbidden, fe.Code)
}

func TestValidateToolName_NilMap(t *testing.T) {
	// Passing a nil map should deny all tools
	err := validateToolName("list_clusters", nil)
	assert.Error(t, err, "expected error when map is nil")
}

func TestValidateToolName_AllowedOpsToolsIntegrity(t *testing.T) {
	// Verify all ops tools in the allowlist are actually true
	for name, allowed := range AllowedOpsTools {
		if !allowed {
			t.Errorf("AllowedOpsTools[%q] = false, expected true for all listed ops tools", name)
		}
	}
	// Verify minimum expected tools are present
	expected := []string{"list_clusters", "get_cluster_health", "get_pods", "get_deployments"}
	for _, name := range expected {
		if !AllowedOpsTools[name] {
			t.Errorf("expected AllowedOpsTools to contain %q", name)
		}
	}
}

func TestValidateToolName_AllowedDeployToolsIntegrity(t *testing.T) {
	// Verify no write tools are accidentally enabled
	writeTools := []string{"deploy_app", "scale_app", "patch_app", "sync_from_git", "reconcile"}
	for _, name := range writeTools {
		if AllowedDeployTools[name] {
			t.Errorf("SECURITY: AllowedDeployTools[%q] = true, write tools should be disabled", name)
		}
	}
}

// =============================================================================
// classifyComponent tests — pod label classification
// =============================================================================

func TestClassifyComponent_VirtLauncher(t *testing.T) {
	labels := map[string]string{"app": "virt-launcher"}
	assert.Equal(t, "kubevirt", classifyComponent(labels))
}

func TestClassifyComponent_K3s(t *testing.T) {
	labels := map[string]string{"app": "k3s"}
	assert.Equal(t, "k3s", classifyComponent(labels))
}

func TestClassifyComponent_OvnKubeNode(t *testing.T) {
	labels := map[string]string{"app": "ovnkube-node"}
	assert.Equal(t, "ovn", classifyComponent(labels))
}

func TestClassifyComponent_UnknownApp(t *testing.T) {
	labels := map[string]string{"app": "nginx"}
	assert.Equal(t, "", classifyComponent(labels))
}

func TestClassifyComponent_NoAppLabel(t *testing.T) {
	labels := map[string]string{"tier": "frontend"}
	assert.Equal(t, "", classifyComponent(labels), "expected empty string for missing app label")
}

func TestClassifyComponent_EmptyLabels(t *testing.T) {
	labels := map[string]string{}
	assert.Equal(t, "", classifyComponent(labels), "expected empty string for empty labels")
}

func TestClassifyComponent_NilLabels(t *testing.T) {
	assert.Equal(t, "", classifyComponent(nil), "expected empty string for nil labels")
}

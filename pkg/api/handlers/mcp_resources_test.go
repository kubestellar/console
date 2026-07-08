package handlers

import (
	"testing"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// validateToolName tests — security-critical allowlist enforcement
// =============================================================================

func TestValidateToolName_EmptyName(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true}
	err := validateToolName("", allowed)
	if err == nil {
		t.Fatal("expected error for empty tool name")
	}
	fe, ok := err.(*fiber.Error)
	if !ok {
		t.Fatalf("expected *fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusBadRequest {
		t.Errorf("expected 400, got %d", fe.Code)
	}
}

func TestValidateToolName_AllowedTool(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true, "get_pods": true}
	if err := validateToolName("list_clusters", allowed); err != nil {
		t.Errorf("expected nil error for allowed tool, got: %v", err)
	}
}

func TestValidateToolName_DisallowedTool(t *testing.T) {
	allowed := map[string]bool{"list_clusters": true}
	err := validateToolName("deploy_app", allowed)
	if err == nil {
		t.Fatal("expected error for disallowed tool")
	}
	fe, ok := err.(*fiber.Error)
	if !ok {
		t.Fatalf("expected *fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusForbidden {
		t.Errorf("expected 403, got %d", fe.Code)
	}
}

func TestValidateToolName_ExplicitlyFalse(t *testing.T) {
	// A tool that exists in the map but is set to false should be denied
	allowed := map[string]bool{"deploy_app": false}
	err := validateToolName("deploy_app", allowed)
	if err == nil {
		t.Fatal("expected error for explicitly-false tool")
	}
	fe, ok := err.(*fiber.Error)
	if !ok {
		t.Fatalf("expected *fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusForbidden {
		t.Errorf("expected 403, got %d", fe.Code)
	}
}

func TestValidateToolName_NilMap(t *testing.T) {
	// Passing a nil map should deny all tools
	err := validateToolName("list_clusters", nil)
	if err == nil {
		t.Fatal("expected error when map is nil")
	}
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
	if got := classifyComponent(labels); got != "kubevirt" {
		t.Errorf("expected 'kubevirt', got %q", got)
	}
}

func TestClassifyComponent_K3s(t *testing.T) {
	labels := map[string]string{"app": "k3s"}
	if got := classifyComponent(labels); got != "k3s" {
		t.Errorf("expected 'k3s', got %q", got)
	}
}

func TestClassifyComponent_OvnKubeNode(t *testing.T) {
	labels := map[string]string{"app": "ovnkube-node"}
	if got := classifyComponent(labels); got != "ovn" {
		t.Errorf("expected 'ovn', got %q", got)
	}
}

func TestClassifyComponent_UnknownApp(t *testing.T) {
	labels := map[string]string{"app": "nginx"}
	if got := classifyComponent(labels); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestClassifyComponent_NoAppLabel(t *testing.T) {
	labels := map[string]string{"tier": "frontend"}
	if got := classifyComponent(labels); got != "" {
		t.Errorf("expected empty string for missing app label, got %q", got)
	}
}

func TestClassifyComponent_EmptyLabels(t *testing.T) {
	labels := map[string]string{}
	if got := classifyComponent(labels); got != "" {
		t.Errorf("expected empty string for empty labels, got %q", got)
	}
}

func TestClassifyComponent_NilLabels(t *testing.T) {
	if got := classifyComponent(nil); got != "" {
		t.Errorf("expected empty string for nil labels, got %q", got)
	}
}

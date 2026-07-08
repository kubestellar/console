package agent

import (
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// TestInit_WiresAIPackageFunctionPointers verifies that the package-level
// init() function in init.go correctly wires up the function pointer
// variables in the ai package. These pointers allow pkg/ai to call back
// into pkg/agent without creating an import cycle.
func TestInit_WiresAIPackageFunctionPointers(t *testing.T) {
	t.Parallel()

	// By the time any test in this package runs, init() has already
	// executed. All four function pointers should be non-nil.

	if ai.GetRegistry == nil {
		t.Error("ai.GetRegistry is nil — init() did not wire it up")
	}
	if ai.InitializeProviders == nil {
		t.Error("ai.InitializeProviders is nil — init() did not wire it up")
	}
	if ai.SetClusterContextProviders == nil {
		t.Error("ai.SetClusterContextProviders is nil — init() did not wire it up")
	}
	if ai.GetConfigManager == nil {
		t.Error("ai.GetConfigManager is nil — init() did not wire it up")
	}
}

// TestInit_GetRegistryReturnsNonNil verifies that the wired GetRegistry
// function returns a valid (non-nil) registry instance.
func TestInit_GetRegistryReturnsNonNil(t *testing.T) {
	t.Parallel()

	if ai.GetRegistry == nil {
		t.Skip("ai.GetRegistry not wired")
	}

	reg := ai.GetRegistry()
	if reg == nil {
		t.Error("ai.GetRegistry() returned nil")
	}
}

// TestInit_GetConfigManagerReturnsNonNil verifies that the wired
// GetConfigManager function returns a valid (non-nil) config manager.
func TestInit_GetConfigManagerReturnsNonNil(t *testing.T) {
	t.Parallel()

	if ai.GetConfigManager == nil {
		t.Skip("ai.GetConfigManager not wired")
	}

	mgr := ai.GetConfigManager()
	if mgr == nil {
		t.Error("ai.GetConfigManager() returned nil")
	}
}

// TestInit_SetClusterContextProvidersDoesNotPanic verifies that calling
// SetClusterContextProviders with nil arguments does not panic (graceful
// no-op for unconfigured environments).
func TestInit_SetClusterContextProvidersDoesNotPanic(t *testing.T) {
	t.Parallel()

	if ai.SetClusterContextProviders == nil {
		t.Skip("ai.SetClusterContextProviders not wired")
	}

	// Should not panic with nil args
	ai.SetClusterContextProviders(nil, nil)
}

package agent

import (
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// TestInit_WiresAIGetRegistry verifies that pkg/agent/init.go's init()
// function has assigned the ai.GetRegistry function pointer, which allows
// components in other packages to reach the agent's provider registry
// through the ai interface bridge.
func TestInit_WiresAIGetRegistry(t *testing.T) {
	if ai.GetRegistry == nil {
		t.Fatal("ai.GetRegistry should be non-nil after pkg/agent init()")
	}
	reg := ai.GetRegistry()
	if reg == nil {
		t.Fatal("ai.GetRegistry() should return non-nil Registry")
	}
}

// TestInit_WiresAIInitializeProviders verifies that ai.InitializeProviders
// is wired to the agent package implementation.
func TestInit_WiresAIInitializeProviders(t *testing.T) {
	if ai.InitializeProviders == nil {
		t.Fatal("ai.InitializeProviders should be non-nil after pkg/agent init()")
	}
}

// TestInit_WiresAIGetConfigManager verifies that ai.GetConfigManager is
// non-nil and returns a valid config manager after package initialization.
func TestInit_WiresAIGetConfigManager(t *testing.T) {
	if ai.GetConfigManager == nil {
		t.Fatal("ai.GetConfigManager should be non-nil after pkg/agent init()")
	}
	cm := ai.GetConfigManager()
	if cm == nil {
		t.Fatal("ai.GetConfigManager() should return non-nil")
	}
}

// TestInit_WiresAISetClusterContextProviders verifies that
// ai.SetClusterContextProviders is non-nil and handles nil arguments without
// panicking (both bridge and k8sClient may be nil in test environments).
func TestInit_WiresAISetClusterContextProviders(t *testing.T) {
	if ai.SetClusterContextProviders == nil {
		t.Fatal("ai.SetClusterContextProviders should be non-nil after pkg/agent init()")
	}
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("SetClusterContextProviders(nil, nil) panicked: %v", r)
		}
	}()
	ai.SetClusterContextProviders(nil, nil)
}

package agent

import (
	"testing"
)

func TestJetBrainsProvider_Basics(t *testing.T) {
	p := &JetBrainsProvider{}

	if p.Name() != "jetbrains" {
		t.Errorf("Expected 'jetbrains', got %q", p.Name())
	}
	if p.DisplayName() != "JetBrains IDEs" {
		t.Errorf("Expected 'JetBrains IDEs', got %q", p.DisplayName())
	}
	if p.Provider() != "jetbrains" {
		t.Errorf("Expected 'jetbrains', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestJetBrainsProvider_Capabilities(t *testing.T) {
	p := &JetBrainsProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestJetBrainsProvider_Interface(t *testing.T) {
	var _ AIProvider = &JetBrainsProvider{}
}

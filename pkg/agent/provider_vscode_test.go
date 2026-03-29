package agent

import (
	"testing"
)

func TestVSCodeProvider_Basics(t *testing.T) {
	p := &VSCodeProvider{}

	if p.Name() != "vscode" {
		t.Errorf("Expected 'vscode', got %q", p.Name())
	}
	if p.DisplayName() != "VS Code" {
		t.Errorf("Expected 'VS Code', got %q", p.DisplayName())
	}
	if p.Provider() != "microsoft" {
		t.Errorf("Expected 'microsoft', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestVSCodeProvider_Capabilities(t *testing.T) {
	p := &VSCodeProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestVSCodeProvider_Interface(t *testing.T) {
	var _ AIProvider = &VSCodeProvider{}
}

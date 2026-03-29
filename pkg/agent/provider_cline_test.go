package agent

import (
	"testing"
)

func TestClineProvider_Basics(t *testing.T) {
	p := &ClineProvider{}

	if p.Name() != "cline" {
		t.Errorf("Expected 'cline', got %q", p.Name())
	}
	if p.DisplayName() != "Cline" {
		t.Errorf("Expected 'Cline', got %q", p.DisplayName())
	}
	if p.Provider() != "cline" {
		t.Errorf("Expected 'cline', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestClineProvider_Capabilities(t *testing.T) {
	p := &ClineProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestClineProvider_Interface(t *testing.T) {
	var _ AIProvider = &ClineProvider{}
}

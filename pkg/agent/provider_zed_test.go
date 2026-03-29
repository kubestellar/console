package agent

import (
	"testing"
)

func TestZedProvider_Basics(t *testing.T) {
	p := &ZedProvider{}

	if p.Name() != "zed" {
		t.Errorf("Expected 'zed', got %q", p.Name())
	}
	if p.DisplayName() != "Zed" {
		t.Errorf("Expected 'Zed', got %q", p.DisplayName())
	}
	if p.Provider() != "zed" {
		t.Errorf("Expected 'zed', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestZedProvider_Capabilities(t *testing.T) {
	p := &ZedProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestZedProvider_Interface(t *testing.T) {
	var _ AIProvider = &ZedProvider{}
}

package agent

import (
	"testing"
)

func TestRaycastProvider_Basics(t *testing.T) {
	p := &RaycastProvider{}

	if p.Name() != "raycast" {
		t.Errorf("Expected 'raycast', got %q", p.Name())
	}
	if p.DisplayName() != "Raycast" {
		t.Errorf("Expected 'Raycast', got %q", p.DisplayName())
	}
	if p.Provider() != "raycast" {
		t.Errorf("Expected 'raycast', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestRaycastProvider_Capabilities(t *testing.T) {
	p := &RaycastProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestRaycastProvider_Interface(t *testing.T) {
	var _ AIProvider = &RaycastProvider{}
}

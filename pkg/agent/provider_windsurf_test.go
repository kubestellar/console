package agent

import (
	"testing"
)

func TestWindsurfProvider_Basics(t *testing.T) {
	p := &WindsurfProvider{}

	if p.Name() != "windsurf" {
		t.Errorf("Expected 'windsurf', got %q", p.Name())
	}
	if p.DisplayName() != "Windsurf" {
		t.Errorf("Expected 'Windsurf', got %q", p.DisplayName())
	}
	if p.Provider() != "codeium" {
		t.Errorf("Expected 'codeium', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestWindsurfProvider_Capabilities(t *testing.T) {
	p := &WindsurfProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestWindsurfProvider_Interface(t *testing.T) {
	var _ AIProvider = &WindsurfProvider{}
}

package agent

import (
	"testing"
)

func TestContinueProvider_Basics(t *testing.T) {
	p := &ContinueProvider{}

	if p.Name() != "continue" {
		t.Errorf("Expected 'continue', got %q", p.Name())
	}
	if p.DisplayName() != "Continue" {
		t.Errorf("Expected 'Continue', got %q", p.DisplayName())
	}
	if p.Provider() != "continue" {
		t.Errorf("Expected 'continue', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestContinueProvider_Capabilities(t *testing.T) {
	p := &ContinueProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestContinueProvider_Interface(t *testing.T) {
	var _ AIProvider = &ContinueProvider{}
}

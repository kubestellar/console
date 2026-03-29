package agent

import (
	"testing"
)

func TestGooseProvider_Basics(t *testing.T) {
	p := &GooseProvider{}

	if p.Name() != "goose" {
		t.Errorf("Expected 'goose', got %q", p.Name())
	}
	if p.DisplayName() != "Goose" {
		t.Errorf("Expected 'Goose', got %q", p.DisplayName())
	}
	if p.Provider() != "block" {
		t.Errorf("Expected 'block', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestGooseProvider_NotInstalled(t *testing.T) {
	p := &GooseProvider{} // No cliPath set

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when CLI is not installed")
	}
	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
	if p.Capabilities()&CapabilityToolExec == 0 {
		t.Error("Expected CapabilityToolExec to be set")
	}
}

func TestGooseProvider_ChatNotInstalled(t *testing.T) {
	p := &GooseProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestGooseProvider_DescriptionWithVersion(t *testing.T) {
	p := &GooseProvider{version: "1.0.5"}
	desc := p.Description()
	if !containsSubstring(desc, "1.0.5") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestGooseProvider_Interface(t *testing.T) {
	var _ AIProvider = &GooseProvider{}
}

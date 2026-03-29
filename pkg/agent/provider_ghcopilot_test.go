package agent

import (
	"testing"
)

func TestGHCopilotProvider_Basics(t *testing.T) {
	p := &GHCopilotProvider{}

	if p.Name() != "gh-copilot" {
		t.Errorf("Expected 'gh-copilot', got %q", p.Name())
	}
	if p.DisplayName() != "GitHub Copilot Agents" {
		t.Errorf("Expected 'GitHub Copilot Agents', got %q", p.DisplayName())
	}
	if p.Provider() != "github" {
		t.Errorf("Expected 'github', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestGHCopilotProvider_NotInstalled(t *testing.T) {
	p := &GHCopilotProvider{} // No ghPath set

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when gh CLI or copilot extension is not found")
	}
	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
	if p.Capabilities()&CapabilityToolExec == 0 {
		t.Error("Expected CapabilityToolExec to be set")
	}
}

func TestGHCopilotProvider_GHWithoutCopilot(t *testing.T) {
	p := &GHCopilotProvider{
		ghPath:           "/usr/bin/gh",
		copilotAvailable: false,
	}

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when copilot extension is not available")
	}
}

func TestGHCopilotProvider_ChatNotAvailable(t *testing.T) {
	p := &GHCopilotProvider{} // No ghPath set

	_, err := p.StreamChat(t.Context(), &ChatRequest{Prompt: "hi"}, nil)
	if err == nil {
		t.Error("Expected error when gh copilot is not available")
	}
}

func TestGHCopilotProvider_Interface(t *testing.T) {
	var _ AIProvider = &GHCopilotProvider{}
}

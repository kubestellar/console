package agent

import (
	"testing"
)

func TestCopilotCLIProvider_Basics(t *testing.T) {
	p := &CopilotCLIProvider{}

	if p.Name() != "copilot-cli" {
		t.Errorf("Expected 'copilot-cli', got %q", p.Name())
	}
	if p.DisplayName() != "Copilot CLI" {
		t.Errorf("Expected 'Copilot CLI', got %q", p.DisplayName())
	}
	if p.Provider() != "github-cli" {
		t.Errorf("Expected 'github-cli', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestCopilotCLIProvider_NotInstalled(t *testing.T) {
	p := &CopilotCLIProvider{} // No cliPath set

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

func TestCopilotCLIProvider_ChatNotInstalled(t *testing.T) {
	p := &CopilotCLIProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestCopilotCLIProvider_DescriptionWithVersion(t *testing.T) {
	p := &CopilotCLIProvider{version: "0.0.418"}
	desc := p.Description()
	if !containsSubstring(desc, "0.0.418") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestCopilotCLIProvider_Interface(t *testing.T) {
	var _ AIProvider = &CopilotCLIProvider{}
}

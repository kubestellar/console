package agent

import (
	"testing"
)

func TestClaudeCodeProvider_Basics(t *testing.T) {
	p := &ClaudeCodeProvider{}

	if p.Name() != "claude-code" {
		t.Errorf("Expected 'claude-code', got %q", p.Name())
	}
	if p.DisplayName() != "Claude Code (Local)" {
		t.Errorf("Expected 'Claude Code (Local)', got %q", p.DisplayName())
	}
	if p.Provider() != "anthropic-local" {
		t.Errorf("Expected 'anthropic-local', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestClaudeCodeProvider_NotInstalled(t *testing.T) {
	p := &ClaudeCodeProvider{} // No cliPath set

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

func TestClaudeCodeProvider_ChatNotInstalled(t *testing.T) {
	p := &ClaudeCodeProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestClaudeCodeProvider_DescriptionWithVersion(t *testing.T) {
	p := &ClaudeCodeProvider{version: "2.0.0"}
	desc := p.Description()
	if !containsSubstring(desc, "2.0.0") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestClaudeCodeProvider_Interface(t *testing.T) {
	var _ AIProvider = &ClaudeCodeProvider{}
}

func TestCleanEnvForCLI(t *testing.T) {
	env := cleanEnvForCLI()
	for _, e := range env {
		if len(e) >= 10 && e[:10] == "CLAUDECODE=" {
			t.Error("cleanEnvForCLI should filter out CLAUDECODE= entries")
		}
	}
}

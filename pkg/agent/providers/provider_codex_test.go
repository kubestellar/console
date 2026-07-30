package providers

import (
	"github.com/kubestellar/console/pkg/ai"
	"testing"
)

func TestCodexProvider_Basics(t *testing.T) {
	p := &CodexProvider{}

	if p.Name() != "codex" {
		t.Errorf("Expected 'codex', got %q", p.Name())
	}
	if p.DisplayName() != "Codex" {
		t.Errorf("Expected 'Codex', got %q", p.DisplayName())
	}
	if p.Provider() != "openai-cli" {
		t.Errorf("Expected 'openai-cli', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestCodexProvider_NotInstalled(t *testing.T) {
	p := &CodexProvider{} // No cliPath set

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when CLI is not installed")
	}
	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Expected ai.CapabilityChat to be set")
	}
	if p.Capabilities()&ai.CapabilityToolExec == 0 {
		t.Error("Expected ai.CapabilityToolExec to be set")
	}
}

func TestCodexProvider_ChatNotInstalled(t *testing.T) {
	p := &CodexProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ai.ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestCodexProvider_DescriptionWithVersion(t *testing.T) {
	p := &CodexProvider{version: "0.5.0"}
	desc := p.Description()
	if !containsSubstring(desc, "0.5.0") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestCodexProvider_Interface(t *testing.T) {
	var _ ai.Provider = &CodexProvider{}
}

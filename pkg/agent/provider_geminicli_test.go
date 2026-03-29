package agent

import (
	"testing"
)

func TestGeminiCLIProvider_Basics(t *testing.T) {
	p := &GeminiCLIProvider{}

	if p.Name() != "gemini-cli" {
		t.Errorf("Expected 'gemini-cli', got %q", p.Name())
	}
	if p.DisplayName() != "Gemini CLI" {
		t.Errorf("Expected 'Gemini CLI', got %q", p.DisplayName())
	}
	if p.Provider() != "google-cli" {
		t.Errorf("Expected 'google-cli', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestGeminiCLIProvider_NotInstalled(t *testing.T) {
	p := &GeminiCLIProvider{} // No cliPath set

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

func TestGeminiCLIProvider_ChatNotInstalled(t *testing.T) {
	p := &GeminiCLIProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestGeminiCLIProvider_DescriptionWithVersion(t *testing.T) {
	p := &GeminiCLIProvider{version: "1.0.0"}
	desc := p.Description()
	if !containsSubstring(desc, "1.0.0") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestGeminiCLIProvider_Interface(t *testing.T) {
	var _ AIProvider = &GeminiCLIProvider{}
}

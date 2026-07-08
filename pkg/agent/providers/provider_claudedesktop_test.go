package providers

import (
	"github.com/kubestellar/console/pkg/ai"
	"testing"
)

func TestClaudeDesktopProvider_Basics(t *testing.T) {
	p := &ClaudeDesktopProvider{}

	if p.Name() != "claude-desktop" {
		t.Errorf("Expected 'claude-desktop', got %q", p.Name())
	}
	if p.DisplayName() != "Claude Desktop" {
		t.Errorf("Expected 'Claude Desktop', got %q", p.DisplayName())
	}
	if p.Provider() != "anthropic" {
		t.Errorf("Expected 'anthropic', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestClaudeDesktopProvider_Capabilities(t *testing.T) {
	p := &ClaudeDesktopProvider{}

	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Expected ai.CapabilityChat to be set")
	}
}

func TestClaudeDesktopProvider_Interface(t *testing.T) {
	var _ ai.Provider = &ClaudeDesktopProvider{}
}

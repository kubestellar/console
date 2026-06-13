package providers

import (
	"github.com/kubestellar/console/pkg/ai"
	"testing"
)

func TestOpenWebUIProvider_Basics(t *testing.T) {
	p := &OpenWebUIProvider{}

	if p.Name() != "open-webui" {
		t.Errorf("Expected 'open-webui', got %q", p.Name())
	}
	if p.DisplayName() != "Open WebUI" {
		t.Errorf("Expected 'Open WebUI', got %q", p.DisplayName())
	}
	if p.Provider() != "open-webui" {
		t.Errorf("Expected 'open-webui', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestOpenWebUIProvider_Capabilities(t *testing.T) {
	p := &OpenWebUIProvider{}

	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Expected ai.CapabilityChat to be set")
	}
}

func TestOpenWebUIProvider_Interface(t *testing.T) {
	var _ ai.Provider = &OpenWebUIProvider{}
}

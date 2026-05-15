package handlers

import (
	"testing"
)

func TestValidateStellarProviderBaseURL(t *testing.T) {
	t.Run("reject cloud http", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "http://api.openai.com/v1")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("reject cloud private ip", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "https://127.0.0.1/v1")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("allow cloud public ip", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("openai", "https://8.8.8.8/v1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("allow ollama loopback", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("ollama", "http://127.0.0.1:11434")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("reject ollama private by default", func(t *testing.T) {
		_, err := validateStellarProviderBaseURL("ollama", "http://10.1.2.3:11434")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("allow ollama private when CIDR allowlisted", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "10.0.0.0/8")
		_, err := validateStellarProviderBaseURL("ollama", "http://10.1.2.3:11434")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestRenderUntrustedPromptDataEscapesInput(t *testing.T) {
	got := renderUntrustedPromptData("event", `<script>alert("xss")</script>`)
	if got == "" {
		t.Fatal("expected wrapped output")
	}
	if got == `<cluster-data source="event" trust="untrusted"><script>alert("xss")</script></cluster-data>` {
		t.Fatal("expected HTML escaping in wrapped output")
	}
}

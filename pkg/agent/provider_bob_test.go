package agent

import (
	"testing"
)

func TestBobProvider_Basics(t *testing.T) {
	p := &BobProvider{}

	if p.Name() != "bob" {
		t.Errorf("Expected 'bob', got %q", p.Name())
	}
	if p.DisplayName() != "Bob (Local)" {
		t.Errorf("Expected 'Bob (Local)', got %q", p.DisplayName())
	}
	if p.Provider() != "bob" {
		t.Errorf("Expected 'bob', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestBobProvider_NotInstalled(t *testing.T) {
	p := &BobProvider{} // No cliPath set

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when CLI is not installed")
	}
	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestBobProvider_ChatNotInstalled(t *testing.T) {
	p := &BobProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestBobProvider_DescriptionWithVersion(t *testing.T) {
	p := &BobProvider{version: "1.2.3"}
	desc := p.Description()
	if desc == "" {
		t.Error("Description should not be empty")
	}
	if !containsSubstring(desc, "1.2.3") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestBobProvider_Interface(t *testing.T) {
	var _ AIProvider = &BobProvider{}
}

func TestBobProvider_CleanBobOutput(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "removes debug lines",
			input: "loaded global modes\nHello world\n---output---",
			want:  "Hello world",
		},
		{
			name:  "preserves normal content",
			input: "This is a response.",
			want:  "This is a response.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cleanBobOutput(tt.input)
			if got != tt.want {
				t.Errorf("cleanBobOutput() = %q, want %q", got, tt.want)
			}
		})
	}
}

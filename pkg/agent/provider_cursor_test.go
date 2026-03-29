package agent

import (
	"testing"
)

func TestCursorProvider_Basics(t *testing.T) {
	p := &CursorProvider{}

	if p.Name() != "cursor" {
		t.Errorf("Expected 'cursor', got %q", p.Name())
	}
	if p.DisplayName() != "Cursor" {
		t.Errorf("Expected 'Cursor', got %q", p.DisplayName())
	}
	if p.Provider() != "anysphere" {
		t.Errorf("Expected 'anysphere', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestCursorProvider_Capabilities(t *testing.T) {
	p := &CursorProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestCursorProvider_Interface(t *testing.T) {
	var _ AIProvider = &CursorProvider{}
}

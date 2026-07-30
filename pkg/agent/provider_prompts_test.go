package agent

import (
	"runtime"
	"strings"
	"testing"
)

func TestOSCommandHint_NotEmpty(t *testing.T) {
	hint := OSCommandHint()
	if hint == "" {
		t.Error("OSCommandHint() should not return empty string")
	}
}

func TestOSCommandHint_ContainsShellReference(t *testing.T) {
	hint := OSCommandHint()
	// On Linux/macOS the hint should mention bash or shell conventions.
	// On Windows it should mention PowerShell or cmd.
	switch runtime.GOOS {
	case "windows":
		if !strings.Contains(strings.ToLower(hint), "powershell") &&
			!strings.Contains(strings.ToLower(hint), "cmd") {
			t.Errorf("expected Windows hint to mention PowerShell/cmd, got %q", hint)
		}
	default:
		if !strings.Contains(strings.ToLower(hint), "bash") &&
			!strings.Contains(strings.ToLower(hint), "sh") &&
			!strings.Contains(strings.ToLower(hint), "shell") {
			t.Errorf("expected Unix hint to mention bash/sh/shell, got %q", hint)
		}
	}
}

func TestOSContext_MatchesRuntime(t *testing.T) {
	ctx := OSContext()
	if ctx == "" {
		t.Error("OSContext() should not return empty string")
	}
	// Should contain the current OS
	if !strings.Contains(strings.ToLower(ctx), runtime.GOOS) {
		t.Errorf("expected OSContext to mention %q, got %q", runtime.GOOS, ctx)
	}
}

func TestDefaultSystemPrompt_NotEmpty(t *testing.T) {
	if DefaultSystemPrompt == "" {
		t.Error("DefaultSystemPrompt should not be empty")
	}
}

func TestChatOnlySystemPrompt_NotEmpty(t *testing.T) {
	if ChatOnlySystemPrompt == "" {
		t.Error("ChatOnlySystemPrompt should not be empty")
	}
}

func TestChatOnlySystemPrompt_DiffersFromDefault(t *testing.T) {
	if ChatOnlySystemPrompt == DefaultSystemPrompt {
		t.Error("ChatOnlySystemPrompt should differ from DefaultSystemPrompt")
	}
}

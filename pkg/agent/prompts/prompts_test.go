package prompts

import (
	"runtime"
	"strings"
	"testing"
)

func TestOSCommandHint_ContainsOS(t *testing.T) {
	hint := OSCommandHint()
	if hint == "" {
		t.Fatal("OSCommandHint returned empty string")
	}

	switch runtime.GOOS {
	case "windows":
		if !strings.Contains(hint, "Windows") {
			t.Error("expected Windows mention in hint on windows")
		}
		if !strings.Contains(hint, "PowerShell") {
			t.Error("expected PowerShell mention on windows")
		}
	case "darwin":
		if !strings.Contains(hint, "macOS") {
			t.Error("expected macOS mention in hint on darwin")
		}
		if !strings.Contains(hint, "brew") {
			t.Error("expected brew mention on macOS")
		}
	default: // linux
		if !strings.Contains(hint, "Linux") {
			t.Error("expected Linux mention in hint on linux")
		}
		if !strings.Contains(hint, "bash") {
			t.Error("expected bash mention on linux")
		}
	}
}

func TestOSCommandHint_ContainsArch(t *testing.T) {
	hint := OSCommandHint()
	if !strings.Contains(hint, runtime.GOARCH) {
		t.Errorf("expected arch %q in hint, got: %s", runtime.GOARCH, hint[:80])
	}
}

func TestOSContext(t *testing.T) {
	ctx := OSContext()
	expected := runtime.GOOS + "/" + runtime.GOARCH
	if ctx != expected {
		t.Errorf("expected %q, got %q", expected, ctx)
	}
}

func TestResolveShell_ReturnsPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("resolveShell is platform-specific; this test targets unix")
	}
	path, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell failed: %v", err)
	}
	if path == "" {
		t.Error("resolveShell returned empty path")
	}
	// Should be either bash or sh
	if !strings.Contains(path, "bash") && !strings.Contains(path, "sh") {
		t.Errorf("expected shell path containing bash or sh, got %q", path)
	}
}

func TestDefaultSystemPrompt_NotEmpty(t *testing.T) {
	if DefaultSystemPrompt == "" {
		t.Error("DefaultSystemPrompt should not be empty")
	}
	if !strings.Contains(DefaultSystemPrompt, "KubeStellar") {
		t.Error("expected DefaultSystemPrompt to contain 'KubeStellar'")
	}
}

func TestDefaultSystemPrompt_ContainsOSHint(t *testing.T) {
	// DefaultSystemPrompt = base + OSCommandHint()
	hint := OSCommandHint()
	if !strings.Contains(DefaultSystemPrompt, hint) {
		t.Error("expected DefaultSystemPrompt to contain OSCommandHint output")
	}
}

func TestChatOnlySystemPrompt_Exists(t *testing.T) {
	if ChatOnlySystemPrompt == "" {
		t.Error("ChatOnlySystemPrompt should not be empty")
	}
}

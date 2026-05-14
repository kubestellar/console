package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestCheckToolDependencies_AllPresent(t *testing.T) {
	// On any CI or dev machine, at least git and kubectl are likely present.
	// This test verifies the function returns without error when tools exist.
	// If a tool is missing in the test environment, the error type is checked.
	err := CheckToolDependencies()
	if err != nil {
		tde, ok := err.(*ToolDependencyError)
		if !ok {
			t.Fatalf("expected *ToolDependencyError, got %T", err)
		}
		// Verify the error message lists the missing tools
		if len(tde.MissingTools) == 0 {
			t.Error("ToolDependencyError should list at least one missing tool")
		}
		t.Logf("missing tools (expected in some environments): %v", tde.MissingTools)
	}
}

func TestCheckToolDependencies_ErrorMessage(t *testing.T) {
	err := &ToolDependencyError{MissingTools: []string{"kubectl", "helm"}}
	msg := err.Error()
	if !containsSubstring(msg, "kubectl") || !containsSubstring(msg, "helm") {
		t.Errorf("error message should list missing tools, got %q", msg)
	}
}

func TestRequiredMissionTools_NotEmpty(t *testing.T) {
	if len(RequiredMissionTools) == 0 {
		t.Error("RequiredMissionTools must not be empty")
	}
}

func TestOptionalMissionTools_NotEmpty(t *testing.T) {
	if len(OptionalMissionTools) == 0 {
		t.Error("OptionalMissionTools must not be empty")
	}
}

func TestCheckToolDependencies_OptionalToolsMissing_NoError(t *testing.T) {
	// Use an empty temp dir as PATH so no tools are found, making this
	// deterministic regardless of what is installed on the test machine.
	tmpDir := t.TempDir()
	t.Setenv("PATH", tmpDir)
	// Reset warned map so required tools (kubectl, git) don't interfere.
	warnedOptionalTools.Range(func(k, v any) bool { warnedOptionalTools.Delete(k); return true })

	err := CheckToolDependencies()
	// Required tools (kubectl, git) are also absent — we only care that any
	// error is a ToolDependencyError that lists no optional tools.
	if err != nil {
		tde, ok := err.(*ToolDependencyError)
		require.True(t, ok, "expected *ToolDependencyError, got %T", err)
		for _, tool := range tde.MissingTools {
			for _, opt := range OptionalMissionTools {
				assert.NotEqual(t, opt, tool, "optional tool %q should not cause a hard failure", tool)
			}
		}
	}
}

func TestCheckToolDependencies_OptionalToolsMissing_Warns(t *testing.T) {
	// Override PATH to an empty temp dir so no tools are found.
	tmpDir := t.TempDir()
	t.Setenv("PATH", tmpDir)
	// Reset the warned-tools map so this test gets a fresh state.
	warnedOptionalTools.Range(func(k, v any) bool { warnedOptionalTools.Delete(k); return true })

	err := CheckToolDependencies()
	// Optional tools missing should NOT return an error (required tools are
	// also absent here, so we accept either nil or a ToolDependencyError).
	if err != nil {
		_, ok := err.(*ToolDependencyError)
		require.True(t, ok, "expected *ToolDependencyError, got %T", err)
	}
	// All optional tools should have been warned (each stored once).
	for _, tool := range OptionalMissionTools {
		_, warned := warnedOptionalTools.Load(tool)
		assert.True(t, warned, "expected warn entry for optional tool %s", tool)
	}
}

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
	status := CheckToolDependencies()
	if status.HasMissingTools() {
		t.Logf("missing tools (expected in some environments): required=%v optional=%v", status.MissingRequired, status.MissingOptional)
	}
}

func TestToolAvailabilityStatus_PromptWarning(t *testing.T) {
	status := ToolAvailabilityStatus{
		MissingRequired: []string{"kubectl"},
		MissingOptional: []string{"helm"},
	}
	msg := status.PromptWarning()
	if !containsSubstring(msg, "kubectl") || !containsSubstring(msg, "helm") {
		t.Errorf("warning should list missing tools, got %q", msg)
	}
	if !containsSubstring(msg, "never claim the task is complete") {
		t.Errorf("warning should tell the agent not to report false completion, got %q", msg)
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

func TestCheckToolDependencies_OptionalToolsMissing_NoHardFailure(t *testing.T) {
	oldLookPath := missionToolLookPath
	defer func() { missionToolLookPath = oldLookPath }()
	missionToolLookPath = func(string) (string, error) { return "", assert.AnError }
	warnedMissionTools.Range(func(k, v any) bool { warnedMissionTools.Delete(k); return true })

	status := CheckToolDependencies()
	for _, tool := range status.MissingRequired {
		for _, opt := range OptionalMissionTools {
			assert.NotEqual(t, opt, tool, "optional tool %q should not appear in missing required tools", tool)
		}
	}
	require.True(t, status.HasMissingTools(), "expected missing tools to be reported")
}

func TestCheckToolDependencies_OptionalToolsMissing_Warns(t *testing.T) {
	oldLookPath := missionToolLookPath
	defer func() { missionToolLookPath = oldLookPath }()
	missionToolLookPath = func(string) (string, error) { return "", assert.AnError }
	warnedMissionTools.Range(func(k, v any) bool { warnedMissionTools.Delete(k); return true })

	_ = CheckToolDependencies()
	for _, tool := range OptionalMissionTools {
		_, warned := warnedMissionTools.Load("optional:" + tool)
		assert.True(t, warned, "expected warn entry for optional tool %s", tool)
	}
}

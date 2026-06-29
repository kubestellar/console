package agent

import "testing"

func TestDefaultSystemPrompt_NonEmpty(t *testing.T) {
	if DefaultSystemPrompt == "" {
		t.Error("DefaultSystemPrompt should be non-empty")
	}
}

func TestChatOnlySystemPrompt_NonEmpty(t *testing.T) {
	if ChatOnlySystemPrompt == "" {
		t.Error("ChatOnlySystemPrompt should be non-empty")
	}
}

func TestOSCommandHint_NonEmpty(t *testing.T) {
	hint := OSCommandHint()
	if hint == "" {
		t.Error("OSCommandHint() should return a non-empty string")
	}
}

func TestOSContext_NonEmpty(t *testing.T) {
	ctx := OSContext()
	if ctx == "" {
		t.Error("OSContext() should return a non-empty string")
	}
}

func TestDefaultAndChatOnlyPrompts_AreDifferent(t *testing.T) {
	if DefaultSystemPrompt == ChatOnlySystemPrompt {
		t.Error("DefaultSystemPrompt and ChatOnlySystemPrompt should be distinct")
	}
}

package agent

import (
	"testing"
	"time"
)

func TestProviderConstants(t *testing.T) {
	// Verify re-exported provider key constants are non-empty
	constants := map[string]string{
		"ProviderKeyOllama":   ProviderKeyOllama,
		"ProviderKeyLlamaCpp": ProviderKeyLlamaCpp,
		"ProviderKeyLocalAI":  ProviderKeyLocalAI,
		"ProviderKeyVLLM":     ProviderKeyVLLM,
		"ProviderKeyLMStudio": ProviderKeyLMStudio,
		"ProviderKeyRHAIIS":   ProviderKeyRHAIIS,
	}

	for name, val := range constants {
		if val == "" {
			t.Errorf("constant %s is empty", name)
		}
	}
}

func TestProviderVars(t *testing.T) {
	// Verify re-exported URL defaults are non-empty
	if defaultOllamaURL == "" {
		t.Error("defaultOllamaURL is empty")
	}
	if defaultLMStudioURL == "" {
		t.Error("defaultLMStudioURL is empty")
	}
	if claudeAPIVersion == "" {
		t.Error("claudeAPIVersion is empty")
	}
	if geminiAPIBaseURL == "" {
		t.Error("geminiAPIBaseURL is empty")
	}
}

func TestGroqValidationURL(t *testing.T) {
	// Set GROQ_BASE_URL explicitly so the test is hermetic
	t.Setenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
	url := groqValidationURL()
	if url == "" {
		t.Error("groqValidationURL() returned empty string")
	}
	if len(url) < 10 {
		t.Errorf("groqValidationURL() too short: %q", url)
	}
}

func TestTruncateString(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"empty", "", 10, ""},
		{"within limit", "hello", 10, "hello"},
		{"at limit", "hello", 5, "hello"},
		{"over limit", "hello world", 5, "hello..."},
		{"zero max", "hello", 0, "..."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateString(tt.input, tt.maxLen)
			if got != tt.want {
				t.Errorf("truncateString(%q, %d) = %q, want %q", tt.input, tt.maxLen, got, tt.want)
			}
		})
	}
}

func TestNewRestrictedAIProviderHTTPClient_Basic(t *testing.T) {
	client := newRestrictedAIProviderHTTPClient(30 * time.Second)
	if client == nil {
		t.Fatal("newRestrictedAIProviderHTTPClient returned nil")
	}
	if client.Timeout != 30*time.Second {
		t.Errorf("expected timeout 30s, got %v", client.Timeout)
	}

	// Verify transport has restricted dial (doesn't allow private networks)
	if client.Transport == nil {
		t.Error("expected non-nil Transport with restricted dialer")
	}
}

func TestMaxLLMResponseBytes(t *testing.T) {
	// Should be a reasonable value (> 0, < 100MB)
	if maxLLMResponseBytes <= 0 {
		t.Error("maxLLMResponseBytes should be > 0")
	}
	if maxLLMResponseBytes > 100*1024*1024 {
		t.Errorf("maxLLMResponseBytes unexpectedly large: %d", maxLLMResponseBytes)
	}
}

func TestSetAllowLoopbackForTests(t *testing.T) {
	// Restore the package-wide default (loopback enabled) after the test
	// so we don't break other tests that rely on httptest servers.
	t.Cleanup(func() { SetAllowLoopbackForTests(true) })

	// Should not panic
	SetAllowLoopbackForTests(true)
	SetAllowLoopbackForTests(false)
}

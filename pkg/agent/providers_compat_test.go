package agent

import (
	"strings"
	"testing"
	"time"
)

func TestProviderKeyConstants_NonEmpty(t *testing.T) {
	cases := map[string]string{
		"ProviderKeyOllama":   ProviderKeyOllama,
		"ProviderKeyLlamaCpp": ProviderKeyLlamaCpp,
		"ProviderKeyLocalAI":  ProviderKeyLocalAI,
		"ProviderKeyVLLM":     ProviderKeyVLLM,
		"ProviderKeyLMStudio": ProviderKeyLMStudio,
		"ProviderKeyRHAIIS":   ProviderKeyRHAIIS,
	}
	for name, val := range cases {
		if val == "" {
			t.Errorf("%s should not be empty", name)
		}
	}
}

func TestTruncateString_Behaviors(t *testing.T) {
	cases := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"empty string", "", 10, ""},
		{"shorter than max", "hello", 10, "hello"},
		{"exactly max", "hello", 5, "hello"},
		{"longer than max appends ellipsis", "hello world", 5, "hello..."},
		{"zero max appends ellipsis", "hello", 0, "..."},
		{"single char within max", "a", 1, "a"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := truncateString(tc.input, tc.maxLen)
			if got != tc.want {
				t.Errorf("truncateString(%q, %d) = %q, want %q",
					tc.input, tc.maxLen, got, tc.want)
			}
		})
	}
}

func TestGroqValidationURL_StartsWithHTTPS(t *testing.T) {
	url := groqValidationURL()
	if url == "" {
		t.Fatal("groqValidationURL() should return non-empty string")
	}
	if !strings.HasPrefix(url, "https://") {
		t.Errorf("groqValidationURL() = %q, want URL starting with https://", url)
	}
}

func TestSetAllowLoopbackForTests_DoesNotPanic(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("SetAllowLoopbackForTests panicked: %v", r)
		}
	}()
	SetAllowLoopbackForTests(true)
	SetAllowLoopbackForTests(false)
	SetAllowLoopbackForTests(true) // restore to test-friendly state
}

func TestNewRestrictedAIProviderHTTPClient_NonNil(t *testing.T) {
	const testTimeout = 30 * time.Second
	client := newRestrictedAIProviderHTTPClient(testTimeout)
	if client == nil {
		t.Fatal("newRestrictedAIProviderHTTPClient() should return non-nil client")
	}
	if client.Timeout != testTimeout {
		t.Errorf("client.Timeout = %v, want %v", client.Timeout, testTimeout)
	}
	if client.Transport == nil {
		t.Error("client.Transport must be non-nil for SSRF protection")
	}
}

func TestDefaultURLConstants_NonEmpty(t *testing.T) {
	if defaultOllamaURL == "" {
		t.Error("defaultOllamaURL should not be empty")
	}
	if defaultLMStudioURL == "" {
		t.Error("defaultLMStudioURL should not be empty")
	}
}

func TestKagentiK8sContextKey_NonEmpty(t *testing.T) {
	if kagentiK8sContextKey == "" {
		t.Error("kagentiK8sContextKey should not be empty")
	}
}

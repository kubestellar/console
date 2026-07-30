package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestLocalOpenAICompatProvider_Basics(t *testing.T) {
	p := NewOllamaProvider()
	if p.Name() != ProviderKeyOllama {
		t.Errorf("Expected %s, got %s", ProviderKeyOllama, p.Name())
	}
	if p.Capabilities() != ai.CapabilityChat {
		t.Errorf("Expected ai.CapabilityChat, got %v", p.Capabilities())
	}

	// Test a few more factories
	if NewLlamaCppProvider().Name() != ProviderKeyLlamaCpp {
		t.Errorf("Expected %s", ProviderKeyLlamaCpp)
	}
	if NewVLLMProvider().Name() != ProviderKeyVLLM {
		t.Errorf("Expected %s", ProviderKeyVLLM)
	}
}

func TestLocalOpenAICompatProvider_URLPrecedence(t *testing.T) {
	p := &LocalOpenAICompatProvider{
		providerKey: "test-local",
		urlEnvVar:   "TEST_LOCAL_URL",
		defaultURL:  "http://default:11434",
		chatPath:    "/v1/chat/completions",
	}

	// 1. Default
	if url := p.localOpenAICompatBaseURL(); url != "http://default:11434" {
		t.Errorf("Expected http://default:11434, got %s", url)
	}

	// 2. Config override
	cm := config.IsolateConfigManager(t)
	cm.SetBaseURL("test-local", "http://config:11434")
	defer cm.RemoveBaseURL("test-local")

	if url := p.localOpenAICompatBaseURL(); url != "http://config:11434" {
		t.Errorf("Expected http://config:11434, got %s", url)
	}

	// 3. Env override
	os.Setenv("TEST_LOCAL_URL", "http://env:11434")
	defer os.Unsetenv("TEST_LOCAL_URL")

	if url := p.localOpenAICompatBaseURL(); url != "http://env:11434" {
		t.Errorf("Expected http://env:11434, got %s", url)
	}
}

func TestLocalOpenAICompatProvider_IsAvailable(t *testing.T) {
	p := &LocalOpenAICompatProvider{
		providerKey: "test-avail",
		urlEnvVar:   "TEST_AVAIL_URL",
		defaultURL:  "http://default:11434",
	}

	// Default: not available (unlike non-local providers, we want explicit opt-in)
	if p.IsAvailable() {
		t.Error("Expected not available by default")
	}

	// Config available
	cm := config.IsolateConfigManager(t)
	cm.SetBaseURL("test-avail", "http://config:11434")
	if !p.IsAvailable() {
		t.Error("Expected available via config")
	}
	cm.RemoveBaseURL("test-avail")

	// Env available
	os.Setenv("TEST_AVAIL_URL", "http://env:11434")
	if !p.IsAvailable() {
		t.Error("Expected available via env")
	}
	os.Unsetenv("TEST_AVAIL_URL")
}

func TestLocalOpenAICompatProvider_Chat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify placeholder key is sent if no key configured
		auth := r.Header.Get("Authorization")
		if auth != "Bearer "+localLLMPlaceholderKey {
			t.Errorf("Expected placeholder key, got %q", auth)
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"Local response"}}],"usage":{"total_tokens":10}}`))
	}))
	defer server.Close()

	p := &LocalOpenAICompatProvider{
		name:        "test-chat",
		providerKey: "test-chat",
		urlEnvVar:   "TEST_CHAT_URL",
		chatPath:    "/chat",
	}
	os.Setenv("TEST_CHAT_URL", server.URL)
	defer os.Unsetenv("TEST_CHAT_URL")

	// Ensure no key is set for this provider (isolated so real config is unaffected)
	cm := config.IsolateConfigManager(t)
	cm.RemoveAPIKey("test-chat")

	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "Hi"})
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}
	if resp.Content != "Local response" {
		t.Errorf("Expected 'Local response', got %q", resp.Content)
	}

	// Verify the placeholder was actually seeded in memory
	if cm.GetAPIKey("test-chat") != localLLMPlaceholderKey {
		t.Errorf("Expected seeded placeholder key")
	}
}

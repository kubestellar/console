package agent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const kagentiProviderTestTimeout = 2 * time.Second

func TestKagentiProvider_Interfaces(t *testing.T) {
	var _ AIProvider = &KagentiProvider{}
	var _ StreamingProvider = &KagentiProvider{}
	var _ HandshakeProvider = &KagentiProvider{}
}

func TestKagentiProvider_Handshake_ConnectionRefused(t *testing.T) {
	t.Setenv("KAGENTI_CONTROLLER_URL", "http://localhost:59999")

	p := NewKagentiProvider()

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderTestTimeout)
	defer cancel()

	result := p.Handshake(ctx)

	if result.Ready {
		t.Error("Expected Ready=false when connection is refused")
	}
	if result.State != "failed" {
		t.Errorf("Expected state='failed', got '%s'", result.State)
	}
}

func TestKagentiProvider_IsAvailable_NoAgent(t *testing.T) {
	t.Setenv("KAGENTI_CONTROLLER_URL", "http://localhost:59999")
	p := NewKagentiProvider()

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when no endpoint is reachable and no agent found")
	}
	if p.Name() != "kagenti" {
		t.Errorf("Expected name 'kagenti', got '%s'", p.Name())
	}
	if p.Capabilities() != CapabilityChat|CapabilityToolExec {
		t.Error("Missing expected capabilities")
	}
}

func TestKagentiProvider_Handshake_ControllerAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		case "/api/agents":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"name":"weather","namespace":"team1"}]`))
		case "/api/chat/team1/weather/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("data: [DONE]\n\n"))
		default:
			http.Error(w, fmt.Sprintf("unexpected path: %s", r.URL.Path), http.StatusNotFound)
		}
	}))
	defer server.Close()

	t.Setenv("KAGENTI_CONTROLLER_URL", server.URL)
	p := NewKagentiProvider()

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderTestTimeout)
	defer cancel()

	result := p.Handshake(ctx)
	if !result.Ready {
		t.Fatalf("Expected handshake ready=true, got ready=false (%s)", result.Message)
	}
	if result.State != "connected" {
		t.Fatalf("Expected state='connected', got '%s'", result.State)
	}
}

func TestKagentiProvider_DirectAgent_StreamChat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/agent-card.json":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"name":"ops-agent"}`))
		case "/chat/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("data: {\"type\":\"text\",\"text\":\"hello\"}\n\n"))
			_, _ = w.Write([]byte("data: [DONE]\n\n"))
		default:
			http.Error(w, fmt.Sprintf("unexpected path: %s", r.URL.Path), http.StatusNotFound)
		}
	}))
	defer server.Close()

	t.Setenv("KAGENTI_AGENT_URL", server.URL)
	t.Setenv("KAGENTI_AGENT_NAME", "")
	t.Setenv("KAGENTI_AGENT_NAMESPACE", "")
	p := NewKagentiProvider()

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderTestTimeout)
	defer cancel()

	h := p.Handshake(ctx)
	if !h.Ready {
		t.Fatalf("expected direct agent handshake to be ready, got: %+v", h)
	}

	res, err := p.Chat(ctx, &ChatRequest{Prompt: "hi", SessionID: "s1"})
	if err != nil {
		t.Fatalf("expected direct agent stream chat to succeed, got: %v", err)
	}
	if !strings.Contains(res.Content, "hello") {
		t.Fatalf("expected streamed content to contain 'hello', got: %q", res.Content)
	}
}

func TestKagentiProvider_Handshake_HealthzFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			http.Error(w, "missing", http.StatusNotFound)
		case "/healthz":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`ok`))
		case "/api/agents":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"name":"planner","namespace":"ops"}]`))
		default:
			_, _ = io.WriteString(w, "")
		}
	}))
	defer server.Close()

	t.Setenv("KAGENTI_CONTROLLER_URL", server.URL)
	p := NewKagentiProvider()

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderTestTimeout)
	defer cancel()

	result := p.Handshake(ctx)
	if !result.Ready {
		t.Fatalf("expected handshake ready=true with /healthz fallback, got: %+v", result)
	}
}

func TestKagentiProvider_BuildPromptIncludesK8sContext(t *testing.T) {
	p := &KagentiProvider{}
	prompt := p.buildPrompt(&ChatRequest{
		Prompt:       "which pods are failing?",
		SystemPrompt: "custom system prompt",
		Context: map[string]string{
			"clusterContext":     "kind-dev",
			kagentiK8sContextKey: `{ "clusters": [{"context":"kind-dev","podIssues":[{"name":"pod-a"}]}] }`,
		},
	})

	if !strings.Contains(prompt, "custom system prompt") {
		t.Fatalf("expected custom system prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "kind-dev") {
		t.Fatalf("expected cluster context in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "k8s-readonly-context") {
		t.Fatalf("expected wrapped kubernetes context, got %q", prompt)
	}
	if !strings.Contains(prompt, "pod-a") {
		t.Fatalf("expected pod issue data in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "which pods are failing?") {
		t.Fatalf("expected user prompt in final request, got %q", prompt)
	}
}

package agent

import (
	"context"
	"testing"
	"time"
)

// mockToolProvider implements AIProvider for testing tool execution routing.
type mockToolProvider struct {
	name         string
	available    bool
	capabilities ProviderCapability
}

func (m *mockToolProvider) Name() string                    { return m.name }
func (m *mockToolProvider) DisplayName() string             { return m.name }
func (m *mockToolProvider) Description() string             { return "mock provider" }
func (m *mockToolProvider) Provider() string                { return "mock" }
func (m *mockToolProvider) IsAvailable() bool               { return m.available }
func (m *mockToolProvider) Capabilities() ProviderCapability { return m.capabilities }
func (m *mockToolProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{Content: "ok", Agent: m.name}, nil
}
func (m *mockToolProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(string)) (*ChatResponse, error) {
	return &ChatResponse{Content: "ok", Agent: m.name}, nil
}

// newMixedTestRegistry creates a fresh Registry (bypasses singleton).
func newMixedTestRegistry() *Registry {
	return &Registry{
		providers:        make(map[string]AIProvider),
		selectedAgent:    make(map[string]string),
		selectedAgentLRU: make(map[string]time.Time),
	}
}

func newMixedTestServer(reg *Registry) *Server {
	return &Server{registry: reg}
}

// ---------------------------------------------------------------------------
// promptNeedsToolExecution
// ---------------------------------------------------------------------------

func TestPromptNeedsToolExecution_Questions(t *testing.T) {
	s := newMixedTestServer(newMixedTestRegistry())

	questions := []string{
		"how do I delete a namespace?",
		"How can I scale a deployment?",
		"what is a pod?",
		"why are my pods failing?",
		"explain how kubectl works",
		"tell me about deployments",
		"can you explain the rollout process?",
	}
	for _, q := range questions {
		t.Run(q, func(t *testing.T) {
			if s.promptNeedsToolExecution(q) {
				t.Errorf("question %q should NOT require tool execution", q)
			}
		})
	}
}

func TestPromptNeedsToolExecution_Commands(t *testing.T) {
	s := newMixedTestServer(newMixedTestRegistry())

	commands := []string{
		"run kubectl get pods",
		"kubectl get nodes",
		"execute helm install my-chart",
		"check the status of my deployment",
		"show me the logs for pod nginx",
		"get deployments in production",
		"list pods in kube-system",
		"scale deployment nginx to 5 replicas",
		"restart the api-server deployment",
		"delete pod stuck-pod",
		"apply this manifest",
		"create a new namespace called test",
		"deploy the application",
		"install cert-manager",
		"rollback deployment frontend",
		"drain node worker-1",
		"cordon node worker-2",
	}
	for _, cmd := range commands {
		t.Run(cmd, func(t *testing.T) {
			if !s.promptNeedsToolExecution(cmd) {
				t.Errorf("command %q SHOULD require tool execution", cmd)
			}
		})
	}
}

func TestPromptNeedsToolExecution_RetryKeywords(t *testing.T) {
	s := newMixedTestServer(newMixedTestRegistry())

	retries := []string{
		"yes",
		"proceed",
		"go ahead",
		"try again",
		"retry",
		"do it",
		"run it",
		"execute it",
		"please do",
		"ok try again please",
	}
	for _, r := range retries {
		t.Run(r, func(t *testing.T) {
			if !s.promptNeedsToolExecution(r) {
				t.Errorf("retry %q SHOULD require tool execution", r)
			}
		})
	}
}

func TestPromptNeedsToolExecution_RetrySubstringFalsePositive(t *testing.T) {
	s := newMixedTestServer(newMixedTestRegistry())

	// "yes" should NOT match inside "yesterday"
	if s.promptNeedsToolExecution("what happened yesterday") {
		t.Error("'yesterday' should not trigger retry keyword 'yes'")
	}
}

func TestPromptNeedsToolExecution_PlainText(t *testing.T) {
	s := newMixedTestServer(newMixedTestRegistry())

	plain := []string{
		"hello",
		"thanks",
		"that makes sense",
		"I understand now",
	}
	for _, p := range plain {
		t.Run(p, func(t *testing.T) {
			if s.promptNeedsToolExecution(p) {
				t.Errorf("plain text %q should NOT require tool execution", p)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// isToolCapableAgent
// ---------------------------------------------------------------------------

func TestIsToolCapableAgent(t *testing.T) {
	reg := newMixedTestRegistry()
	_ = reg.Register(&mockToolProvider{name: "tool-agent", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	_ = reg.Register(&mockToolProvider{name: "chat-only", available: true, capabilities: CapabilityChat})
	s := newMixedTestServer(reg)

	if !s.isToolCapableAgent("tool-agent") {
		t.Error("tool-agent should be tool-capable")
	}
	if s.isToolCapableAgent("chat-only") {
		t.Error("chat-only should NOT be tool-capable")
	}
	if s.isToolCapableAgent("nonexistent") {
		t.Error("nonexistent agent should NOT be tool-capable")
	}
}

// ---------------------------------------------------------------------------
// findToolCapableAgent
// ---------------------------------------------------------------------------

func TestFindToolCapableAgent_PreferredOrder(t *testing.T) {
	reg := newMixedTestRegistry()
	_ = reg.Register(&mockToolProvider{name: "codex", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	_ = reg.Register(&mockToolProvider{name: "claude-code", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	s := newMixedTestServer(reg)

	got := s.findToolCapableAgent()
	if got != "claude-code" {
		t.Errorf("expected claude-code (highest priority), got %q", got)
	}
}

func TestFindToolCapableAgent_FallsBackToNonSuggestOnly(t *testing.T) {
	reg := newMixedTestRegistry()
	// Only a non-preferred, non-suggest-only tool agent
	_ = reg.Register(&mockToolProvider{name: "my-agent", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	s := newMixedTestServer(reg)

	got := s.findToolCapableAgent()
	if got != "my-agent" {
		t.Errorf("expected my-agent as fallback, got %q", got)
	}
}

func TestFindToolCapableAgent_SuggestOnlyLastResort(t *testing.T) {
	reg := newMixedTestRegistry()
	// Only copilot-cli (suggest-only) is available
	_ = reg.Register(&mockToolProvider{name: "copilot-cli", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	s := newMixedTestServer(reg)

	got := s.findToolCapableAgent()
	if got != "copilot-cli" {
		t.Errorf("expected copilot-cli as last resort, got %q", got)
	}
}

func TestFindToolCapableAgent_NoneAvailable(t *testing.T) {
	reg := newMixedTestRegistry()
	_ = reg.Register(&mockToolProvider{name: "chat-only", available: true, capabilities: CapabilityChat})
	s := newMixedTestServer(reg)

	got := s.findToolCapableAgent()
	if got != "" {
		t.Errorf("expected empty string when no tool-capable agent, got %q", got)
	}
}

func TestFindToolCapableAgent_UnavailableSkipped(t *testing.T) {
	reg := newMixedTestRegistry()
	_ = reg.Register(&mockToolProvider{name: "claude-code", available: false, capabilities: CapabilityChat | CapabilityToolExec})
	_ = reg.Register(&mockToolProvider{name: "codex", available: true, capabilities: CapabilityChat | CapabilityToolExec})
	s := newMixedTestServer(reg)

	got := s.findToolCapableAgent()
	if got != "codex" {
		t.Errorf("expected codex (claude-code unavailable), got %q", got)
	}
}

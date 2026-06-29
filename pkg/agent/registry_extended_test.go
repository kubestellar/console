package agent

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

// mockRegToolProvider implements ai.Provider with CapabilityToolExec.
type mockRegToolProvider struct {
	name      string
	available bool
}

func (m *mockRegToolProvider) Name() string                           { return m.name }
func (m *mockRegToolProvider) DisplayName() string                    { return m.name }
func (m *mockRegToolProvider) Description() string                    { return m.name }
func (m *mockRegToolProvider) Provider() string                       { return "mock" }
func (m *mockRegToolProvider) IsAvailable() bool                      { return m.available }
func (m *mockRegToolProvider) Capabilities() ProviderCapability       { return CapabilityToolExec }
func (m *mockRegToolProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return nil, nil
}
func (m *mockRegToolProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(string)) (*ChatResponse, error) {
	return nil, nil
}

func newTestRegistry() *Registry {
	return &Registry{
		providers:        make(map[string]AIProvider),
		selectedAgent:    make(map[string]string),
		selectedAgentLRU: make(map[string]time.Time),
	}
}

func TestRegistry_NilReceiver(t *testing.T) {
	var r *Registry

	if err := r.Register(&MockProvider{name: "x", available: true}); err == nil {
		t.Error("expected error from nil registry Register")
	}
	if _, err := r.Get("x"); err == nil {
		t.Error("expected error from nil registry Get")
	}
	if _, err := r.GetDefault(); err == nil {
		t.Error("expected error from nil registry GetDefault")
	}
	if r.GetDefaultName() != "" {
		t.Error("expected empty string from nil registry GetDefaultName")
	}
	if err := r.SetDefault("x"); err == nil {
		t.Error("expected error from nil registry SetDefault")
	}
	if r.GetSelectedAgent("s") != "" {
		t.Error("expected empty string from nil registry GetSelectedAgent")
	}
	if err := r.SetSelectedAgent("s", "x"); err == nil {
		t.Error("expected error from nil registry SetSelectedAgent")
	}
	// RemoveSelectedAgent on nil should not panic
	r.RemoveSelectedAgent("s")
	if r.List() != nil {
		t.Error("expected nil from nil registry List")
	}
	if r.ListAvailable() != nil {
		t.Error("expected nil from nil registry ListAvailable")
	}
	if r.HasAvailableProviders() {
		t.Error("expected false from nil registry HasAvailableProviders")
	}
	// promoteExecutingDefault should not panic on nil
	r.promoteExecutingDefault()
}

func TestRegistry_RemoveSelectedAgent(t *testing.T) {
	r := newTestRegistry()
	p := &MockProvider{name: "a", available: true}
	r.Register(p)

	// Set a session agent
	if err := r.SetSelectedAgent("sess-1", "a"); err != nil {
		t.Fatalf("SetSelectedAgent: %v", err)
	}
	if r.GetSelectedAgent("sess-1") != "a" {
		t.Fatalf("expected 'a', got %q", r.GetSelectedAgent("sess-1"))
	}

	// Remove it
	r.RemoveSelectedAgent("sess-1")

	// Should fall back to default
	if got := r.GetSelectedAgent("sess-1"); got != "a" {
		t.Errorf("expected default 'a' after removal, got %q", got)
	}

	// Verify internal maps are clean
	r.mu.RLock()
	_, inAgent := r.selectedAgent["sess-1"]
	_, inLRU := r.selectedAgentLRU["sess-1"]
	r.mu.RUnlock()
	if inAgent || inLRU {
		t.Error("expected session to be removed from internal maps")
	}

	// Remove with empty string should not panic
	r.RemoveSelectedAgent("")
}

func TestRegistry_PromoteExecutingDefault(t *testing.T) {
	r := newTestRegistry()

	// Register copilot-cli (suggest-only) first so it becomes default
	cli := &MockProvider{name: "copilot-cli", available: true}
	r.Register(cli)
	if r.GetDefaultName() != "copilot-cli" {
		t.Fatalf("expected copilot-cli as default, got %q", r.GetDefaultName())
	}

	// Register a tool-capable provider
	tool := &mockRegToolProvider{name: "claude-code", available: true}
	r.Register(tool)

	// Promote should switch default to the tool-capable agent
	r.promoteExecutingDefault()
	if r.GetDefaultName() != "claude-code" {
		t.Errorf("expected default promoted to claude-code, got %q", r.GetDefaultName())
	}
}

func TestRegistry_PromoteExecutingDefault_NoChange(t *testing.T) {
	r := newTestRegistry()

	// Register a tool-capable provider as default (not in suggestOnlyAgents)
	tool := &mockRegToolProvider{name: "claude-code", available: true}
	r.Register(tool)

	// promoteExecutingDefault should not change anything
	r.promoteExecutingDefault()
	if r.GetDefaultName() != "claude-code" {
		t.Errorf("expected default unchanged, got %q", r.GetDefaultName())
	}
}

func TestRegistry_PromoteExecutingDefault_NoBetterOption(t *testing.T) {
	r := newTestRegistry()

	// Only copilot-cli registered, no tool-capable alternative
	cli := &MockProvider{name: "copilot-cli", available: true}
	r.Register(cli)

	r.promoteExecutingDefault()
	// Should keep copilot-cli as fallback
	if r.GetDefaultName() != "copilot-cli" {
		t.Errorf("expected copilot-cli retained as fallback, got %q", r.GetDefaultName())
	}
}

func TestRegistry_SetSelectedAgent_LRUEviction(t *testing.T) {
	r := newTestRegistry()
	p := &MockProvider{name: "a", available: true}
	r.Register(p)

	// Fill the registry with sessions just under the cap (we use a smaller
	// batch to make the test tractable — the real cap is 10000).
	// We directly manipulate the maps to simulate historical sessions.
	r.mu.Lock()
	for i := 0; i < 10000; i++ {
		sid := fmt.Sprintf("old-session-%d", i)
		r.selectedAgent[sid] = "a"
		// All old sessions have old timestamps
		r.selectedAgentLRU[sid] = time.Now().Add(-time.Hour)
	}
	r.mu.Unlock()

	// Adding one more should trigger eviction
	if err := r.SetSelectedAgent("new-session", "a"); err != nil {
		t.Fatalf("SetSelectedAgent failed: %v", err)
	}

	r.mu.RLock()
	count := len(r.selectedAgent)
	r.mu.RUnlock()

	// After eviction of 5% (500), we should have ~9501 entries
	if count > 9600 {
		t.Errorf("expected eviction to reduce count, got %d", count)
	}
	if count < 9400 {
		t.Errorf("eviction removed too many entries, got %d", count)
	}

	// The new session should still be present
	if r.GetSelectedAgent("new-session") != "a" {
		t.Error("new session should still be present after eviction")
	}
}

func TestRegistry_ConcurrentAccess(t *testing.T) {
	r := newTestRegistry()
	p := &MockProvider{name: "concurrent", available: true}
	r.Register(p)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sid := fmt.Sprintf("session-%d", id)
			_ = r.SetSelectedAgent(sid, "concurrent")
			_ = r.GetSelectedAgent(sid)
			r.RemoveSelectedAgent(sid)
			_ = r.List()
			_ = r.ListAvailable()
			_ = r.HasAvailableProviders()
		}(i)
	}
	wg.Wait()
}

func TestRegistry_GetDefault_NotFound(t *testing.T) {
	r := newTestRegistry()
	// Set a default name manually but don't register the provider
	r.mu.Lock()
	r.defaultAgent = "phantom"
	r.mu.Unlock()

	_, err := r.GetDefault()
	if err == nil {
		t.Error("expected error when default provider not found in map")
	}
}

func TestRegistry_SetDefault_NilProvider(t *testing.T) {
	r := newTestRegistry()
	// Inject nil provider directly into map
	r.mu.Lock()
	r.providers["nil-provider"] = nil
	r.mu.Unlock()

	err := r.SetDefault("nil-provider")
	if err == nil {
		t.Error("expected error when setting nil provider as default")
	}
}

func TestRegistry_HasAvailableProviders_WithNilEntry(t *testing.T) {
	r := newTestRegistry()
	// Inject nil provider
	r.mu.Lock()
	r.providers["nil-entry"] = nil
	r.mu.Unlock()

	if r.HasAvailableProviders() {
		t.Error("nil provider should not count as available")
	}
}

package agent

import (
	"context"
	"sync"
	"testing"
	"time"
)

// MockProvider for testing registry
type MockProvider struct {
	name      string
	available bool
}

func (m *MockProvider) Name() string        { return m.name }
func (m *MockProvider) DisplayName() string { return m.name }
func (m *MockProvider) Description() string { return m.name }
func (m *MockProvider) Provider() string    { return "mock" }
func (m *MockProvider) IsAvailable() bool   { return m.available }
func (m *MockProvider) Capabilities() ProviderCapability { return CapabilityChat }
func (m *MockProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return nil, nil
}
func (m *MockProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return nil, nil
}

func TestRegistry(t *testing.T) {
	r := &Registry{
		providers:        make(map[string]AIProvider),
		selectedAgent:    make(map[string]string),
		selectedAgentLRU: make(map[string]time.Time),
	}

	p1 := &MockProvider{name: "p1", available: true}
	p2 := &MockProvider{name: "p2", available: false}

	// Test Register
	if err := r.Register(p1); err != nil {
		t.Fatalf("Failed to register p1: %v", err)
	}
	if err := r.Register(p2); err != nil {
		t.Fatalf("Failed to register p2: %v", err)
	}
	if err := r.Register(p1); err == nil {
		t.Error("Expected error when registering duplicate provider")
	}

	// Test Get
	got, err := r.Get("p1")
	if err != nil {
		t.Fatalf("Get(p1) failed: %v", err)
	}
	if got.Name() != p1.name {
		t.Errorf("Expected p1 name, got %s", got.Name())
	}

	// Test GetDefault
	if r.GetDefaultName() != "p1" {
		t.Errorf("Expected default p1, got %s", r.GetDefaultName())
	}

	// Test List
	list := r.List()
	if len(list) != 2 {
		t.Errorf("Expected 2 providers, got %d", len(list))
	}

	// Test ListAvailable
	available := r.ListAvailable()
	if len(available) != 1 || available[0].Name != "p1" {
		t.Errorf("Expected 1 available provider (p1), got %v", available)
	}

	// Test SetDefault
	if err := r.SetDefault("p2"); err == nil {
		t.Error("Expected error setting unavailable provider as default")
	}

	// Test Session Selection
	if r.GetSelectedAgent("sess1") != "p1" {
		t.Error("Expected default agent for new session")
	}

	// Register another available provider
	p3 := &MockProvider{name: "p3", available: true}
	r.Register(p3)

	if err := r.SetSelectedAgent("sess1", "p3"); err != nil {
		t.Fatalf("Failed to set selected agent: %v", err)
	}
	if r.GetSelectedAgent("sess1") != "p3" {
		t.Errorf("Expected p3 for sess1, got %s", r.GetSelectedAgent("sess1"))
	}
}

func TestInitializeProviders(t *testing.T) {
	// Reset registry for test
	globalRegistry = &Registry{
		providers:        make(map[string]AIProvider),
		selectedAgent:    make(map[string]string),
		selectedAgentLRU: make(map[string]time.Time),
	}
	registryOnce = sync.Once{}

	// InitializeProviders registers CLI-based agents (claude-code, bob, codex, etc.).
	// In CI environments none of those binaries are installed, so HasAvailableProviders
	// returns false and InitializeProviders returns an error — that is expected behaviour.
	// This test verifies that all expected provider names are registered regardless of
	// binary availability, and separately checks the available-providers path only when
	// at least one CLI tool happens to be present.
	err := InitializeProviders()

	r := GetRegistry()
	allProviders := r.List()

	// The expected registered provider names (CLI-based, intentionally no API-only agents)
	expectedNames := []string{"claude-code", "bob", "codex", "copilot-cli", "gemini-cli", "antigravity"}
	registeredNames := make(map[string]bool, len(allProviders))
	for _, p := range allProviders {
		registeredNames[p.Name] = true
	}
	for _, name := range expectedNames {
		if !registeredNames[name] {
			t.Errorf("Expected provider %q to be registered", name)
		}
	}

	if r.HasAvailableProviders() {
		// At least one CLI tool is installed — InitializeProviders must succeed
		if err != nil {
			t.Fatalf("InitializeProviders failed despite available provider: %v", err)
		}
	} else {
		// No CLI tools present (typical CI) — InitializeProviders should return an error
		if err == nil {
			t.Error("Expected error from InitializeProviders when no providers are available")
		}
		t.Logf("No CLI agents installed (expected in CI): %v", err)
	}
}

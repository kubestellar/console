package agent

import (
	"context"
	"os"
	"sync"
	"testing"
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
func (m *MockProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return nil, nil
}
func (m *MockProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return nil, nil
}

func TestRegistry(t *testing.T) {
	r := &Registry{
		providers:     make(map[string]AIProvider),
		selectedAgent: make(map[string]string),
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
		providers:     make(map[string]AIProvider),
		selectedAgent: make(map[string]string),
	}
	registryOnce = sync.Once{}

	// Mock env to make at least one provider available
	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	defer os.Unsetenv("ANTHROPIC_API_KEY")

	// Mock other providers to not fail on missing keys if they check files
	// Actually InitializeProviders registers them regardless of availability
	// but fails if NONE are available.

	err := InitializeProviders()
	if err != nil {
		t.Fatalf("InitializeProviders failed: %v", err)
	}

	r := GetRegistry()
	if !r.HasAvailableProviders() {
		t.Error("Expected at least one available provider")
	}

	// Verify claude is registered and available
	p, err := r.Get("claude")
	if err != nil {
		t.Fatalf("Claude provider not registered: %v", err)
	}
	if !p.IsAvailable() {
		t.Error("Claude provider should be available via env")
	}
}

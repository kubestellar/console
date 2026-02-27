package agent

import (
	"fmt"
	"os"
	"sync"
)

// Registry manages available AI providers
type Registry struct {
	mu            sync.RWMutex
	providers     map[string]AIProvider
	defaultAgent  string
	selectedAgent map[string]string // sessionID -> agentName
}

// Global registry instance
var (
	globalRegistry *Registry
	registryOnce   sync.Once
)

// GetRegistry returns the singleton registry instance
func GetRegistry() *Registry {
	registryOnce.Do(func() {
		globalRegistry = &Registry{
			providers:     make(map[string]AIProvider),
			selectedAgent: make(map[string]string),
		}
	})
	return globalRegistry
}

// Register adds a provider to the registry
func (r *Registry) Register(provider AIProvider) error {
	if r == nil {
		return fmt.Errorf("registry is nil")
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	name := provider.Name()
	if _, exists := r.providers[name]; exists {
		return fmt.Errorf("provider %s already registered", name)
	}

	r.providers[name] = provider

	// Set first available provider as default
	if r.defaultAgent == "" && provider.IsAvailable() {
		r.defaultAgent = name
	}

	return nil
}

// Get retrieves a provider by name
func (r *Registry) Get(name string) (AIProvider, error) {
	if r == nil {
		return nil, fmt.Errorf("registry is nil")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	provider, exists := r.providers[name]
	if !exists {
		return nil, fmt.Errorf("provider %s not found", name)
	}
	return provider, nil
}

// GetDefault returns the default provider
func (r *Registry) GetDefault() (AIProvider, error) {
	if r == nil {
		return nil, fmt.Errorf("registry is nil")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.defaultAgent == "" {
		return nil, fmt.Errorf("no default agent configured")
	}

	provider, exists := r.providers[r.defaultAgent]
	if !exists {
		return nil, fmt.Errorf("default agent %s not found", r.defaultAgent)
	}
	return provider, nil
}

// GetDefaultName returns the name of the default provider
func (r *Registry) GetDefaultName() string {
	if r == nil {
		return ""
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.defaultAgent
}

// SetDefault sets the default provider
func (r *Registry) SetDefault(name string) error {
	if r == nil {
		return fmt.Errorf("registry is nil")
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	provider, exists := r.providers[name]
	if !exists {
		return fmt.Errorf("provider %s not found", name)
	}
	if provider == nil {
		return fmt.Errorf("provider %s is nil", name)
	}
	if !provider.IsAvailable() {
		return fmt.Errorf("provider %s is not available", name)
	}

	r.defaultAgent = name
	return nil
}

// GetSelectedAgent returns the selected agent for a session
func (r *Registry) GetSelectedAgent(sessionID string) string {
	if r == nil {
		return ""
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	if agent, ok := r.selectedAgent[sessionID]; ok {
		return agent
	}
	return r.defaultAgent
}

// SetSelectedAgent sets the selected agent for a session
func (r *Registry) SetSelectedAgent(sessionID, agentName string) error {
	if r == nil {
		return fmt.Errorf("registry is nil")
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	provider, exists := r.providers[agentName]
	if !exists {
		return fmt.Errorf("provider %s not found", agentName)
	}
	if !provider.IsAvailable() {
		return fmt.Errorf("provider %s is not available", agentName)
	}

	r.selectedAgent[sessionID] = agentName
	return nil
}

// List returns all registered providers
func (r *Registry) List() []ProviderInfo {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]ProviderInfo, 0, len(r.providers))
	for _, provider := range r.providers {
		result = append(result, ProviderInfo{
			Name:         provider.Name(),
			DisplayName:  provider.DisplayName(),
			Description:  provider.Description(),
			Provider:     provider.Provider(),
			Available:    provider.IsAvailable(),
			Capabilities: int(provider.Capabilities()),
		})
	}
	return result
}

// ListAvailable returns only providers that are configured and ready
func (r *Registry) ListAvailable() []ProviderInfo {
	if r == nil {
		return nil
	}
	all := r.List()
	available := make([]ProviderInfo, 0)
	for _, info := range all {
		if info.Available {
			available = append(available, info)
		}
	}
	return available
}

// HasAvailableProviders returns true if at least one provider is available
func (r *Registry) HasAvailableProviders() bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, provider := range r.providers {
		if provider == nil {
			continue
		}
		if provider.IsAvailable() {
			return true
		}
	}
	return false
}

// ProviderInfo contains metadata about a provider
type ProviderInfo struct {
	Name         string `json:"name"`
	DisplayName  string `json:"displayName"`
	Description  string `json:"description"`
	Provider     string `json:"provider"`
	Available    bool   `json:"available"`
	Capabilities int    `json:"capabilities"` // bitmask of ProviderCapability
}

// InitializeProviders registers all available providers
// This should be called during server startup
func InitializeProviders() error {
	registry := GetRegistry()

	// Register tool-capable agents FIRST so they become the default
	// Tool-capable agents can execute kubectl, helm, and other commands
	registry.Register(NewClaudeCodeProvider())
	registry.Register(NewBobProvider())

	// Register CLI-based tool-capable agents
	registry.Register(NewCodexProvider())
	registry.Register(NewCopilotCLIProvider())
	registry.Register(NewGeminiCLIProvider())
	registry.Register(NewAntigravityProvider())
	registry.Register(NewGHCopilotProvider())

	// Register API-only agents (can generate text / used for missions, not execute commands)
	registry.Register(NewClaudeProvider())
	registry.Register(NewOpenAIProvider())
	registry.Register(NewGeminiProvider())

	// Register IDE/app-based agents (API chat, each with own key)
	registry.Register(NewClaudeDesktopProvider())
	registry.Register(NewCursorProvider())
	registry.Register(NewVSCodeProvider())
	registry.Register(NewWindsurfProvider())
	registry.Register(NewClineProvider())
	registry.Register(NewJetBrainsProvider())
	registry.Register(NewZedProvider())
	registry.Register(NewContinueProvider())
	registry.Register(NewRaycastProvider())

	// Register HTTP API-based agents
	registry.Register(NewOpenWebUIProvider())

	// Set default agent based on environment or availability
	if defaultAgent := os.Getenv("DEFAULT_AGENT"); defaultAgent != "" {
		if err := registry.SetDefault(defaultAgent); err != nil {
			// Log warning but don't fail - will use first available
			fmt.Printf("Warning: Could not set default agent %s: %v\n", defaultAgent, err)
		}
	}

	// Ensure at least one provider is available
	if !registry.HasAvailableProviders() {
		return fmt.Errorf("no AI providers available - please configure at least one API key or install a CLI agent (claude, codex, gemini, etc.)")
	}

	return nil
}

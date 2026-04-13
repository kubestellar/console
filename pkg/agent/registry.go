package agent

import (
	"fmt"
	"log/slog"
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

	// Evict oldest entries when map exceeds a safety cap to prevent unbounded
	// growth from sessions that never call RemoveSelectedAgent (#7209).
	const maxSelectedAgentEntries = 10000
	if len(r.selectedAgent) >= maxSelectedAgentEntries {
		// Delete an arbitrary entry (map iteration order is random in Go).
		for k := range r.selectedAgent {
			delete(r.selectedAgent, k)
			break
		}
	}

	r.selectedAgent[sessionID] = agentName
	return nil
}

// RemoveSelectedAgent cleans up the session entry from the selectedAgent map,
// preventing unbounded growth when sessions disconnect (#7209).
func (r *Registry) RemoveSelectedAgent(sessionID string) {
	if r == nil || sessionID == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.selectedAgent, sessionID)
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

// suggestOnlyAgents are agents that return command suggestions as text rather
// than executing them. They should not be the default when better options exist.
var suggestOnlyAgents = map[string]bool{
	"copilot-cli": true,
	"gh-copilot":  true,
}

// promoteExecutingDefault checks if the current default agent only suggests
// commands (e.g. copilot-cli) and, if so, promotes the first available agent
// that can actually execute commands to be the default (#3609).
func (r *Registry) promoteExecutingDefault() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	if !suggestOnlyAgents[r.defaultAgent] {
		return // current default is fine
	}

	// Look for a better agent that actually executes commands
	for name, provider := range r.providers {
		if provider == nil || !provider.IsAvailable() {
			continue
		}
		if !suggestOnlyAgents[name] &&
			provider.Capabilities().HasCapability(CapabilityToolExec) {
			r.defaultAgent = name
			return
		}
	}
	// No better option found — keep copilot-cli as fallback
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

	// Register tool-capable agents FIRST so they become the default.
	// Tool-capable agents can execute kubectl, helm, and other commands.
	// Order matters: the first available agent becomes the default.
	registry.Register(NewClaudeCodeProvider())
	registry.Register(NewBobProvider())

	// Register CLI-based tool-capable agents
	registry.Register(NewCodexProvider())
	registry.Register(NewGeminiCLIProvider())
	registry.Register(NewAntigravityProvider())
	registry.Register(NewGooseProvider())

	// Register copilot-cli LAST among tool-capable agents.
	// copilot-cli suggests commands as text rather than executing them,
	// so it should only be the default when no other agent is available (#3609).
	registry.Register(NewCopilotCLIProvider())
	// GHCopilot is deprecated — the gh-copilot extension runs but executes no commands

	// NOTE: API-only agents (Claude API, OpenAI, Gemini) and IDE-based agents
	// (Cursor, Windsurf, Cline, etc.) are intentionally not registered.
	// They cannot execute commands to diagnose/repair clusters, which is the
	// primary value of AI Missions. Only CLI-based agents that can take action
	// are registered above.

	// Set default agent based on environment or availability
	if defaultAgent := os.Getenv("DEFAULT_AGENT"); defaultAgent != "" {
		if err := registry.SetDefault(defaultAgent); err != nil {
			// Log warning but don't fail - will use first available
			slog.Warn("[Registry] could not set default agent", "agent", defaultAgent, "error", err)
		}
	}

	// If the default ended up as copilot-cli but a better agent is available,
	// prefer the agent that can actually execute commands (#3609).
	registry.promoteExecutingDefault()

	// Ensure at least one provider is available
	if !registry.HasAvailableProviders() {
		return fmt.Errorf("no AI providers available - please configure at least one API key or install a CLI agent (claude, codex, gemini, etc.)")
	}

	return nil
}

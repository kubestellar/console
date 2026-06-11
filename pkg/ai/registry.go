package ai

// Registry manages available AI providers
type Registry interface {
	// Register adds a provider to the registry
	Register(provider Provider) error

	// Get retrieves a provider by name
	Get(name string) (Provider, error)

	// GetDefault returns the default provider
	GetDefault() (Provider, error)

	// GetDefaultName returns the name of the default provider
	GetDefaultName() string

	// SetDefault sets the default provider
	SetDefault(name string) error

	// GetSelectedAgent returns the selected agent for a session
	GetSelectedAgent(sessionID string) string

	// SetSelectedAgent sets the selected agent for a session
	SetSelectedAgent(sessionID, agentName string) error

	// RemoveSelectedAgent removes the selected agent for a session
	RemoveSelectedAgent(sessionID string)

	// List returns all registered providers
	List() []ProviderInfo

	// ListAvailable returns all available providers (with valid credentials)
	ListAvailable() []ProviderInfo

	// HasAvailableProviders returns true if at least one provider is available
	HasAvailableProviders() bool
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

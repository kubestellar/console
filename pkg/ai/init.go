package ai

// GetRegistry returns the AI provider registry.
// This is implemented by pkg/agent but exposed through pkg/ai interface.
var GetRegistry func() Registry

// InitializeProviders initializes all AI providers.
// This is implemented by pkg/agent but exposed through pkg/ai interface.
var InitializeProviders func() error

// SetClusterContextProviders sets cluster context for AI providers.
// This is implemented by pkg/agent but exposed through pkg/ai interface.
var SetClusterContextProviders func(bridge interface{}, k8sClient interface{})

// GetConfigManager returns the config manager for AI providers.
// This is implemented by pkg/agent but exposed through pkg/ai interface.
var GetConfigManager func() interface{}

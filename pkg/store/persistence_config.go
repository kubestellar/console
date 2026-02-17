package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

const (
	configDirMode  = 0755
	configFileMode = 0644
)

// PersistenceConfig holds the configuration for CRD-based persistence
type PersistenceConfig struct {
	// Enabled indicates whether persistence is active
	Enabled bool `json:"enabled"`

	// PrimaryCluster is the cluster to use for storing console CRs
	PrimaryCluster string `json:"primaryCluster"`

	// SecondaryCluster is the optional backup cluster for failover
	SecondaryCluster string `json:"secondaryCluster,omitempty"`

	// Namespace is where console CRs are stored (default: kubestellar-console)
	Namespace string `json:"namespace"`

	// SyncMode controls how CRs are synced
	// - "primary-only": Only sync to primary cluster
	// - "active-passive": Sync to primary, failover to secondary if unavailable
	SyncMode string `json:"syncMode"`

	// LastModified tracks when the config was last changed
	LastModified time.Time `json:"lastModified,omitempty"`
}

// PersistenceStatus provides the current status of persistence
type PersistenceStatus struct {
	// Active indicates whether persistence is currently working
	Active bool `json:"active"`

	// ActiveCluster is the cluster currently being used
	ActiveCluster string `json:"activeCluster"`

	// PrimaryHealth is the health of the primary cluster
	PrimaryHealth ClusterHealth `json:"primaryHealth"`

	// SecondaryHealth is the health of the secondary cluster (if configured)
	SecondaryHealth *ClusterHealth `json:"secondaryHealth,omitempty"`

	// LastSync is when the last successful sync occurred
	LastSync *time.Time `json:"lastSync,omitempty"`

	// FailoverActive indicates whether failover is in effect
	FailoverActive bool `json:"failoverActive"`

	// Message provides additional status information
	Message string `json:"message,omitempty"`
}

// ClusterHealth represents the health of a persistence cluster
type ClusterHealth string

const (
	ClusterHealthHealthy     ClusterHealth = "healthy"
	ClusterHealthDegraded    ClusterHealth = "degraded"
	ClusterHealthUnreachable ClusterHealth = "unreachable"
	ClusterHealthUnknown     ClusterHealth = "unknown"
)

// DefaultNamespace is the default namespace for console CRs
const DefaultNamespace = "kubestellar-console"

// PersistenceStore manages persistence configuration
type PersistenceStore struct {
	configPath string
	config     *PersistenceConfig
	mu         sync.RWMutex

	// Cluster health check functions (injected for testability)
	checkClusterHealth func(ctx context.Context, clusterName string) ClusterHealth

	// Client factory for creating dynamic clients
	getClient func(clusterName string) (dynamic.Interface, *rest.Config, error)
}

// NewPersistenceStore creates a new PersistenceStore
func NewPersistenceStore(configPath string) *PersistenceStore {
	return &PersistenceStore{
		configPath: configPath,
		config:     &PersistenceConfig{Namespace: DefaultNamespace},
	}
}

// SetClusterHealthChecker sets the function used to check cluster health
func (p *PersistenceStore) SetClusterHealthChecker(checker func(ctx context.Context, clusterName string) ClusterHealth) {
	p.checkClusterHealth = checker
}

// SetClientFactory sets the function used to get dynamic clients for clusters
func (p *PersistenceStore) SetClientFactory(factory func(clusterName string) (dynamic.Interface, *rest.Config, error)) {
	p.getClient = factory
}

// Load loads the persistence config from disk
func (p *PersistenceStore) Load() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	data, err := os.ReadFile(p.configPath)
	if os.IsNotExist(err) {
		// No config file, use defaults
		p.config = &PersistenceConfig{
			Enabled:   false,
			Namespace: DefaultNamespace,
			SyncMode:  "primary-only",
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("failed to read persistence config: %w", err)
	}

	if err := json.Unmarshal(data, &p.config); err != nil {
		return fmt.Errorf("failed to parse persistence config: %w", err)
	}

	// Ensure namespace has a default
	if p.config.Namespace == "" {
		p.config.Namespace = DefaultNamespace
	}

	return nil
}

// Save persists the config to disk
func (p *PersistenceStore) Save() error {
	p.mu.RLock()
	defer p.mu.RUnlock()

	// Ensure directory exists
	dir := filepath.Dir(p.configPath)
	if err := os.MkdirAll(dir, configDirMode); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	p.config.LastModified = time.Now()

	data, err := json.MarshalIndent(p.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal persistence config: %w", err)
	}

	if err := os.WriteFile(p.configPath, data, configFileMode); err != nil {
		return fmt.Errorf("failed to write persistence config: %w", err)
	}

	log.Printf("[PersistenceStore] Config saved: enabled=%v, primary=%s, secondary=%s",
		p.config.Enabled, p.config.PrimaryCluster, p.config.SecondaryCluster)

	return nil
}

// GetConfig returns the current persistence config
func (p *PersistenceStore) GetConfig() PersistenceConfig {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return *p.config
}

// UpdateConfig updates the persistence config
func (p *PersistenceStore) UpdateConfig(config PersistenceConfig) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Validate
	if config.Enabled {
		if config.PrimaryCluster == "" {
			return fmt.Errorf("primary cluster is required when persistence is enabled")
		}
		if config.SyncMode == "active-passive" && config.SecondaryCluster == "" {
			return fmt.Errorf("secondary cluster is required for active-passive sync mode")
		}
	}

	// Ensure namespace has a default
	if config.Namespace == "" {
		config.Namespace = DefaultNamespace
	}

	p.config = &config
	return nil
}

// GetStatus returns the current persistence status
func (p *PersistenceStore) GetStatus(ctx context.Context) PersistenceStatus {
	p.mu.RLock()
	config := *p.config
	p.mu.RUnlock()

	status := PersistenceStatus{
		Active:        false,
		PrimaryHealth: ClusterHealthUnknown,
	}

	if !config.Enabled {
		status.Message = "Persistence is disabled"
		return status
	}

	if config.PrimaryCluster == "" {
		status.Message = "No primary cluster configured"
		return status
	}

	// Check primary cluster health
	if p.checkClusterHealth != nil {
		status.PrimaryHealth = p.checkClusterHealth(ctx, config.PrimaryCluster)
	}

	// Check secondary cluster health if configured
	if config.SecondaryCluster != "" && p.checkClusterHealth != nil {
		health := p.checkClusterHealth(ctx, config.SecondaryCluster)
		status.SecondaryHealth = &health
	}

	// Determine active cluster
	if status.PrimaryHealth == ClusterHealthHealthy || status.PrimaryHealth == ClusterHealthDegraded {
		status.ActiveCluster = config.PrimaryCluster
		status.Active = true
		status.FailoverActive = false
	} else if config.SyncMode == "active-passive" && status.SecondaryHealth != nil {
		if *status.SecondaryHealth == ClusterHealthHealthy || *status.SecondaryHealth == ClusterHealthDegraded {
			status.ActiveCluster = config.SecondaryCluster
			status.Active = true
			status.FailoverActive = true
			status.Message = "Failover to secondary cluster active"
		} else {
			status.Message = "Both primary and secondary clusters are unreachable"
		}
	} else {
		status.Message = "Primary cluster is unreachable"
	}

	return status
}

// GetActiveCluster returns the cluster that should be used for persistence operations
// Returns empty string if persistence is disabled or no cluster is available
func (p *PersistenceStore) GetActiveCluster(ctx context.Context) (string, error) {
	status := p.GetStatus(ctx)
	if !status.Active {
		return "", fmt.Errorf("persistence not active: %s", status.Message)
	}
	return status.ActiveCluster, nil
}

// GetActiveClient returns a dynamic client for the active persistence cluster
func (p *PersistenceStore) GetActiveClient(ctx context.Context) (dynamic.Interface, string, error) {
	clusterName, err := p.GetActiveCluster(ctx)
	if err != nil {
		return nil, "", err
	}

	if p.getClient == nil {
		return nil, "", fmt.Errorf("client factory not configured")
	}

	client, _, err := p.getClient(clusterName)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get client for cluster %s: %w", clusterName, err)
	}

	return client, clusterName, nil
}

// IsEnabled returns whether persistence is enabled
func (p *PersistenceStore) IsEnabled() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.config.Enabled
}

// GetNamespace returns the namespace for console CRs
func (p *PersistenceStore) GetNamespace() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if p.config.Namespace == "" {
		return DefaultNamespace
	}
	return p.config.Namespace
}

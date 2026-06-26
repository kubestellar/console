package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/fileutil"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

const (
	configDirMode  = 0700 // Owner read/write/execute only
	configFileMode = 0600 // Owner read/write only — prevents other users from reading cluster config
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

// DefaultNamespace is the default namespace for console CRs.
// Overridden by POD_NAMESPACE env var when running in-cluster.
var DefaultNamespace = getDefaultNamespace()

func getDefaultNamespace() string {
	if ns := os.Getenv("POD_NAMESPACE"); ns != "" {
		return ns
	}
	return "kubestellar-console"
}

// PersistenceStore manages persistence configuration
type PersistenceStore struct {
	configPath string
	config     *PersistenceConfig
	// mu guards config (read/write access to the in-memory struct) and
	// is taken as a reader by all the GetXxx helpers. File I/O in Load()
	// and Save() is deliberately done OUTSIDE mu so a slow disk cannot
	// stall concurrent readers (#6616).
	mu sync.RWMutex
	// saveMu serializes concurrent disk writes from Save() so two callers
	// cannot interleave their os.WriteFile calls and produce a torn file
	// on disk. It is separate from mu so readers still observe an
	// up-to-date in-memory snapshot while Save() is running.
	saveMu sync.Mutex

	// healthCheckerMu guards checkClusterHealth so SetClusterHealthChecker
	// cannot race with concurrent GetStatus readers (#6617). Using a
	// separate lock keeps the hot path (reads from GetStatus) off the
	// main config mutex.
	healthCheckerMu sync.RWMutex

	// Cluster health check functions (injected for testability).
	// Access must go through getCheckClusterHealth / SetClusterHealthChecker.
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

// SetClusterHealthChecker sets the function used to check cluster health.
// #6617: the previous implementation assigned directly to the struct field
// without any synchronization, so a writer from bootstrap code could race
// with a concurrent GetStatus reader observing a half-initialized function
// pointer under the Go memory model. The setter and every read now go
// through healthCheckerMu.
func (p *PersistenceStore) SetClusterHealthChecker(checker func(ctx context.Context, clusterName string) ClusterHealth) {
	p.healthCheckerMu.Lock()
	defer p.healthCheckerMu.Unlock()
	p.checkClusterHealth = checker
}

// getCheckClusterHealth returns the current health-checker function under
// a read lock so callers never observe a torn assignment.
func (p *PersistenceStore) getCheckClusterHealth() func(ctx context.Context, clusterName string) ClusterHealth {
	p.healthCheckerMu.RLock()
	defer p.healthCheckerMu.RUnlock()
	return p.checkClusterHealth
}

// SetClientFactory sets the function used to get dynamic clients for clusters
func (p *PersistenceStore) SetClientFactory(factory func(clusterName string) (dynamic.Interface, *rest.Config, error)) {
	p.getClient = factory
}

// Load loads the persistence config from disk.
//
// #6616: the previous implementation held p.mu (exclusive write lock) for
// the entire duration of the disk read, which blocked every concurrent
// reader on a slow disk. We now read the file OUTSIDE the mutex into a
// local struct, then take the lock only long enough to swap the in-memory
// pointer. Concurrent GetStatus / GetConfig readers continue to see the
// old config until the swap completes — they never observe a partial
// state.
func (p *PersistenceStore) Load() error {
	// Read and parse into a local variable without holding p.mu.
	var loaded *PersistenceConfig

	data, err := os.ReadFile(p.configPath)
	if os.IsNotExist(err) {
		loaded = &PersistenceConfig{
			Enabled:   false,
			Namespace: DefaultNamespace,
			SyncMode:  "primary-only",
		}
	} else if err != nil {
		return fmt.Errorf("failed to read persistence config: %w", err)
	} else {
		if err := json.Unmarshal(data, &loaded); err != nil {
			return fmt.Errorf("failed to parse persistence config: %w", err)
		}
		// #6285: a config file containing literal JSON `null` is valid
		// JSON and causes json.Unmarshal(data, &loaded) to set loaded
		// to nil. Reset to defaults when that happens so the subsequent
		// Namespace dereference cannot panic.
		if loaded == nil {
			loaded = &PersistenceConfig{
				Enabled:   false,
				Namespace: DefaultNamespace,
				SyncMode:  "primary-only",
			}
		}
		if loaded.Namespace == "" {
			loaded.Namespace = DefaultNamespace
		}
	}

	// Brief critical section: swap the in-memory pointer. Everything
	// above this point runs with no locks held.
	p.mu.Lock()
	p.config = loaded
	p.mu.Unlock()
	return nil
}

// Save persists the config to disk.
//
// #6616: the previous implementation held p.mu (exclusive write lock)
// throughout os.WriteFile, stalling every concurrent reader on a slow
// disk. We now take p.mu briefly to snapshot the in-memory config and
// stamp LastModified, release it, then do the MarshalIndent + WriteFile
// under saveMu (which only serializes other Save callers). Readers are
// unaffected by disk latency.
func (p *PersistenceStore) Save() error {
	// Serialize concurrent disk writes so two Save callers cannot
	// interleave their os.WriteFile calls and leave a torn file.
	p.saveMu.Lock()
	defer p.saveMu.Unlock()

	// Ensure directory exists (outside p.mu — the filesystem call does
	// not need the config mutex).
	dir := filepath.Dir(p.configPath)
	if err := os.MkdirAll(dir, configDirMode); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Brief critical section: stamp the timestamp and snapshot by value.
	p.mu.Lock()
	p.config.LastModified = time.Now()
	snapshot := *p.config
	p.mu.Unlock()

	data, err := json.MarshalIndent(&snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal persistence config: %w", err)
	}

	if err := fileutil.AtomicWriteFile(p.configPath, data, configFileMode); err != nil {
		return fmt.Errorf("failed to write persistence config: %w", err)
	}

	slog.Info("[PersistenceStore] config saved",
		"enabled", snapshot.Enabled,
		"primary", snapshot.PrimaryCluster,
		"secondary", snapshot.SecondaryCluster)

	return nil
}

// GetConfig returns the current persistence config
func (p *PersistenceStore) GetConfig() PersistenceConfig {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return *p.config
}

// UpdateConfig updates the persistence config.
//
// #6615: the previous implementation only updated the in-memory struct,
// so changes were lost on process restart — the next Load() would pull
// whatever was on disk (usually the pre-edit snapshot) and silently revert
// the operator's setting. UpdateConfig now writes through to disk via
// Save() after the in-memory swap, so the persisted file is always the
// source of truth. Validation failures short-circuit before any state
// mutation, matching the previous behavior.
func (p *PersistenceStore) UpdateConfig(config PersistenceConfig) error {
	// Validate before touching any state so a rejection cannot leave
	// the in-memory struct partially mutated.
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

	// Swap the in-memory pointer under mu, then release before doing
	// disk I/O in Save() — Save takes its own brief mu window.
	p.mu.Lock()
	p.config = &config
	p.mu.Unlock()

	// Persist through to disk so the change survives a restart.
	// An empty configPath is treated as "in-memory only" (used by unit
	// tests that exercise validation without touching disk) — skip Save
	// in that case so tests don't need a temp file for every call.
	if p.configPath != "" {
		if err := p.Save(); err != nil {
			return fmt.Errorf("persist updated config: %w", err)
		}
	}
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

	// Snapshot the health-checker under the dedicated RWMutex so a
	// concurrent SetClusterHealthChecker cannot race with these reads
	// (#6617). The snapshot is a plain function value, so subsequent
	// calls run without any lock held.
	checker := p.getCheckClusterHealth()
	// Check primary cluster health
	if checker != nil {
		status.PrimaryHealth = checker(ctx, config.PrimaryCluster)
	}

	// Check secondary cluster health if configured
	if config.SecondaryCluster != "" && checker != nil {
		health := checker(ctx, config.SecondaryCluster)
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

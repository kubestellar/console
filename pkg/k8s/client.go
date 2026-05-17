// Package k8s provides the multi-cluster k8s client used by both the Go
// backend (cmd/console) and kc-agent (cmd/kc-agent). The underlying type
// is MultiClusterClient; post-#7993 it is ALSO exported as PrivilegedClient
// to signal — at the type name — that in the Go backend's context it
// carries the pod ServiceAccount's privileges and must only be used for
// the three legitimate pod-SA exceptions:
//
//  1. GPU reservation (pkg/api/handlers/mcp_resources.go ResourceQuota
//     handlers): users cannot create namespaces or set quotas themselves;
//     the console is the authorized policy layer.
//  2. Self-upgrade (pkg/api/handlers/self_upgrade.go): the console pod
//     patches its own Deployment. No other identity could perform a
//     self-upgrade.
//  3. The system-internal persistence reconciler
//     (pkg/api/handlers/console_persistence.go): reacts to CR state
//     changes without a human in the loop. User-initiated CR writes go
//     through kc-agent at /console-cr/* per #7993 Phase 2.5.
//
// Every other k8s operation against a managed cluster must go through
// kc-agent with the caller's own kubeconfig. The architectural rule is
// enforced on every PR by .github/workflows/privileged-client-lint.yml
// (added in #7993 Phase 5).
//
// In kc-agent, the same type carries the USER's identity via their
// kubeconfig, so the name "PrivilegedClient" is a slight overstatement
// there — but the type alias is only a hint, not a runtime check, and
// kc-agent's only k8s surface is user-initiated work anyway.
package k8s

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

// PrivilegedClient is an alias for MultiClusterClient whose sole purpose is
// to mark — at the type name — that a handler field carries the pod
// ServiceAccount's privileges (see the package doc above for the three
// legitimate pod-SA exceptions).
//
// This alias is a documentation / code-review signal for human readers. It
// is NOT what the privileged-client lint rule actually checks. The lint in
// .github/workflows/privileged-client-lint.yml is call-pattern based: it
// greps pkg/api/handlers/ for mutation-method calls of the form
//
//	h.k8sClient.(Create|Update|Delete|Patch)<Name>(
//	s.k8sClient.(Create|Update|Delete|Patch)<Name>(
//	persistence.(Create|Update|Delete)<Name>(
//
// and fails the PR if any such call site lives outside the file allowlist
// in .github/allowlist-privileged-client-callers.txt. The lint never looks
// at the field's declared Go type, so declaring a field as PrivilegedClient
// neither satisfies nor trips the rule on its own.
//
// Practical guidance for new privileged handlers:
//  1. If the handler legitimately needs to mutate a managed cluster via the
//     pod SA, declare the field as *PrivilegedClient to flag intent for
//     reviewers, AND add the handler's file basename to
//     .github/allowlist-privileged-client-callers.txt in the same PR. The
//     allowlist file itself takes only plain basenames (no inline
//     justifications); explain the rationale for the new exception in the
//     PR description, as the lint workflow's failure message instructs.
//  2. If the handler is user-initiated work, it must go through kc-agent
//     with the caller's kubeconfig instead — neither the type alias nor an
//     allowlist entry is appropriate.
//
// Existing MultiClusterClient fields stay put; this is an intent-signalling
// alias, not a rename.
type PrivilegedClient = MultiClusterClient

// ErrNoClusterConfigured indicates the process has neither a readable
// kubeconfig nor an in-cluster ServiceAccount config.
var ErrNoClusterConfigured = errors.New("no cluster configured")

const (
	clusterHealthCheckTimeout = 8 * time.Second
	clusterProbeTimeout       = 5 * time.Second
	k8sClientTimeout          = 45 * time.Second
	// totalHealthTimeout bounds the whole multi-cluster health call so a single
	// slow/unreachable cluster cannot block the aggregate response. Clusters
	// that have not reported by this deadline are marked as timeout rather than
	// blocking the caller (#6506).
	totalHealthTimeout = 20 * time.Second
	// perClusterHealthTimeout bounds each individual cluster probe inside
	// GetAllClusterHealth. Must be less than totalHealthTimeout so a single
	// cluster cannot consume the entire global budget.
	perClusterHealthTimeout  = 10 * time.Second
	clusterCacheTTL          = 60 * time.Second
	authFailureCacheTTL      = 10 * time.Minute // longer TTL for auth errors to avoid exec-plugin spam (#3158)
	podIssueAgeThreshold     = 5 * time.Minute
	podPendingAgeThreshold   = 2 * time.Minute
	clusterEventDebounce     = 500 * time.Millisecond
	clusterEventPollInterval = 5 * time.Second
	slowClusterTTL           = 2 * time.Minute
)

// MultiClusterClient manages connections to multiple Kubernetes clusters
type MultiClusterClient struct {
	mu             sync.RWMutex
	kubeconfig     string
	clients        map[string]kubernetes.Interface
	dynamicClients map[string]dynamic.Interface
	configs        map[string]*rest.Config
	rawConfig      *api.Config
	healthCache    map[string]*ClusterHealth
	cacheTTL       time.Duration
	cacheTime      map[string]time.Time
	watcher        *fsnotify.Watcher
	stopWatch      chan struct{}
	// #6469/#6470 — lifecycle flags guarding StartWatching/StopWatching.
	// `watching` tracks whether a watchLoop goroutine is active; it is flipped
	// under `mu` so concurrent Start/Stop calls are serialized. `stopWatchOnce`
	// ensures we only close `stopWatch` once even if StopWatching is called
	// multiple times (closing a closed channel panics).
	watching        bool
	stopWatchOnce   sync.Once
	onReload        func()               // Callback when config is reloaded
	onWatchError    func(error)          // Callback when watchLoop encounters an error (#5569)
	inClusterConfig *rest.Config         // In-cluster config when running inside k8s
	inClusterName   string               // Detected friendly name for in-cluster (e.g. "fmaas-vllm-d")
	slowClusters    map[string]time.Time // clusters that recently timed out (reduced timeout)
	noClusterMode   bool                 // true when no kubeconfig/in-cluster config is available
}

// IsInCluster returns true if the server is running inside a Kubernetes cluster
// (i.e., has a valid in-cluster ServiceAccount config).
func (m *MultiClusterClient) IsInCluster() bool {
	return m.inClusterConfig != nil
}

// SetInClusterConfig sets the in-cluster config (for testing)
func (m *MultiClusterClient) SetInClusterConfig(config *rest.Config) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.inClusterConfig = config
}

// SetDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) SetDynamicClient(cluster string, client dynamic.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dynamicClients == nil {
		m.dynamicClients = make(map[string]dynamic.Interface)
	}
	m.dynamicClients[cluster] = client
}

// SetClient injects a typed client for a cluster (for testing)
func (m *MultiClusterClient) SetClient(cluster string, client kubernetes.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[cluster] = client
}

// SetRawConfig sets the raw kubeconfig (for testing)
func (m *MultiClusterClient) SetRawConfig(config *api.Config) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rawConfig = config
}

// GetRawConfig returns the raw kubeconfig (for testing)
func (m *MultiClusterClient) GetRawConfig() *api.Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rawConfig
}

// InjectClient injects a typed client for a cluster (for testing)
func (m *MultiClusterClient) InjectClient(contextName string, client kubernetes.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[contextName] = client
}

// InjectDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) InjectDynamicClient(contextName string, client dynamic.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dynamicClients == nil {
		m.dynamicClients = make(map[string]dynamic.Interface)
	}
	m.dynamicClients[contextName] = client
}

// InjectRestConfig injects a rest config for a cluster (for testing)
func (m *MultiClusterClient) InjectRestConfig(contextName string, config *rest.Config) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.configs == nil {
		m.configs = make(map[string]*rest.Config)
	}
	m.configs[contextName] = config
}

// Reload reloads the kubeconfig from disk
func (m *MultiClusterClient) Reload() error {
	return m.LoadConfig()
}

// HasClusterConfig reports whether the client currently has a readable
// kubeconfig or a valid in-cluster configuration.
func (m *MultiClusterClient) HasClusterConfig() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.inClusterConfig != nil || !m.noClusterMode
}

// KubeconfigPath returns the resolved kubeconfig path, if any.
func (m *MultiClusterClient) KubeconfigPath() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.kubeconfig
}

func (m *MultiClusterClient) enterNoClusterModeLocked() {
	m.rawConfig = nil
	m.clients = make(map[string]kubernetes.Interface)
	m.dynamicClients = make(map[string]dynamic.Interface)
	m.configs = make(map[string]*rest.Config)
	m.healthCache = make(map[string]*ClusterHealth)
	m.cacheTime = make(map[string]time.Time)
	m.noClusterMode = m.inClusterConfig == nil
}

func (m *MultiClusterClient) clearNoClusterModeLocked() {
	m.noClusterMode = false
}

// NewMultiClusterClient creates a new multi-cluster client.
//
// Kubeconfig discovery order (#6683):
//  1. explicit argument
//  2. $KUBECONFIG environment variable
//  3. ~/.kube/config — only when os.UserHomeDir() succeeds AND the path
//     is not "/" or "/root" (which indicates a container with no real
//     home). Previously os.UserHomeDir() errors were discarded with
//     `home, _ := os.UserHomeDir()` which produced kubeconfig="/.kube/config"
//     inside containers, leading to confusing "no such file" errors
//     instead of falling through to in-cluster config.
//  4. in-cluster config (handled below via rest.InClusterConfig()).
func NewMultiClusterClient(kubeconfig string) (*MultiClusterClient, error) {
	if kubeconfig == "" {
		kubeconfig = os.Getenv("KUBECONFIG")
		if kubeconfig == "" {
			home, err := os.UserHomeDir()
			if err != nil || home == "" || home == "/" || home == "/root" {
				// Running in a container without a real home directory.
				// Leave kubeconfig empty so the os.Stat below fails fast
				// and we fall through to rest.InClusterConfig().
				slog.Info("no usable home directory for kubeconfig; will try in-cluster config",
					"homeErr", err, "home", home)
				kubeconfig = ""
			} else {
				kubeconfig = filepath.Join(home, ".kube", "config")
			}
		}
	}

	client := &MultiClusterClient{
		kubeconfig:     kubeconfig,
		clients:        make(map[string]kubernetes.Interface),
		dynamicClients: make(map[string]dynamic.Interface),
		configs:        make(map[string]*rest.Config),
		healthCache:    make(map[string]*ClusterHealth),
		cacheTTL:       clusterCacheTTL,
		cacheTime:      make(map[string]time.Time),
		slowClusters:   make(map[string]time.Time),
	}

	// Try to detect if we're running in-cluster.
	// kubeconfig may be empty when running inside a container without a
	// real home directory (see #6683); os.Stat("") returns an error that
	// is NOT os.ErrNotExist, so explicitly check for the empty path too.
	needInCluster := kubeconfig == ""
	if !needInCluster {
		if _, err := os.Stat(kubeconfig); os.IsNotExist(err) {
			needInCluster = true
		}
	}
	if needInCluster {
		// No kubeconfig file, try in-cluster config
		if inClusterConfig, err := rest.InClusterConfig(); err == nil {
			slog.Info("Using in-cluster config (no kubeconfig file found)")
			client.inClusterConfig = inClusterConfig
			client.inClusterName = detectInClusterName(inClusterConfig)
			slog.Info("detected in-cluster name", "name", client.inClusterName)
		} else {
			client.noClusterMode = true
		}
	}

	return client, nil
}

// detectInClusterName tries to determine a friendly name for the local cluster.
// Priority: CLUSTER_NAME env var > OpenShift Infrastructure resource > "in-cluster".
func detectInClusterName(cfg *rest.Config) string {
	// 1. Explicit env var (set via Helm --set clusterName=vllm-d)
	if name := os.Getenv("CLUSTER_NAME"); name != "" {
		return name
	}

	// 2. OpenShift Infrastructure/cluster resource
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return "in-cluster"
	}

	infraGVR := schema.GroupVersionResource{
		Group:    "config.openshift.io",
		Version:  "v1",
		Resource: "infrastructures",
	}
	infra, err := dynClient.Resource(infraGVR).Get(ctx, "cluster", metav1.GetOptions{})
	if err == nil {
		if status, ok := infra.Object["status"].(map[string]interface{}); ok {
			if apiURL, ok := status["apiServerURL"].(string); ok && apiURL != "" {
				if name := clusterNameFromAPIURL(apiURL); name != "" {
					return name
				}
			}
		}
	}

	return "in-cluster"
}

// clusterNameFromAPIURL extracts a friendly cluster name from an API server URL.
// e.g. "https://api.fmaas-vllm-d.fmaas.res.ibm.com:6443" → "fmaas-vllm-d"
func clusterNameFromAPIURL(apiURL string) string {
	// Remove scheme
	host := apiURL
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	// Remove port
	if idx := strings.Index(host, ":"); idx >= 0 {
		host = host[:idx]
	}
	// Strip "api." prefix (OpenShift convention)
	host = strings.TrimPrefix(host, "api.")
	// Take the first domain segment as the cluster name
	if idx := strings.Index(host, "."); idx > 0 {
		return host[:idx]
	}
	return host
}

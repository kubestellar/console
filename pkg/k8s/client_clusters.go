package k8s

import (
	"context"
	"errors"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ClusterInfo represents basic cluster information
type ClusterInfo struct {
	Name           string `json:"name"`
	Context        string `json:"context"`
	Server         string `json:"server,omitempty"`
	User           string `json:"user,omitempty"`
	Namespace      string `json:"namespace,omitempty"`
	AuthMethod     string `json:"authMethod,omitempty"` // exec, token, certificate, auth-provider, unknown
	Healthy        bool   `json:"healthy"`
	HealthUnknown  bool   `json:"healthUnknown,omitempty"`  // true if no health data collected yet (initializing)
	NeverConnected bool   `json:"neverConnected,omitempty"` // true if cluster failed every health probe since startup
	Source         string `json:"source,omitempty"`
	NodeCount      int    `json:"nodeCount,omitempty"`
	PodCount       int    `json:"podCount,omitempty"`
	IsCurrent      bool   `json:"isCurrent,omitempty"`
}

// ClusterHealth represents cluster health status
type ClusterHealth struct {
	Cluster      string `json:"cluster"`
	Healthy      bool   `json:"healthy"`
	Reachable    bool   `json:"reachable"`
	LastSeen     string `json:"lastSeen,omitempty"`
	ErrorType    string `json:"errorType,omitempty"` // timeout, auth, network, certificate, unknown
	ErrorMessage string `json:"errorMessage,omitempty"`
	APIServer    string `json:"apiServer,omitempty"`
	NodeCount    int    `json:"nodeCount"`
	ReadyNodes   int    `json:"readyNodes"`
	PodCount     int    `json:"podCount"`
	// Total allocatable resources (capacity)
	CpuCores     int     `json:"cpuCores"`
	MemoryBytes  int64   `json:"memoryBytes"`  // Total allocatable memory in bytes
	MemoryGB     float64 `json:"memoryGB"`     // Total allocatable memory in GB
	StorageBytes int64   `json:"storageBytes"` // Total ephemeral storage in bytes
	StorageGB    float64 `json:"storageGB"`    // Total ephemeral storage in GB
	// Resource requests (allocated/used)
	CpuRequestsMillicores int64   `json:"cpuRequestsMillicores,omitempty"` // Sum of pod CPU requests in millicores
	CpuRequestsCores      float64 `json:"cpuRequestsCores,omitempty"`      // Sum of pod CPU requests in cores
	MemoryRequestsBytes   int64   `json:"memoryRequestsBytes,omitempty"`   // Sum of pod memory requests in bytes
	MemoryRequestsGB      float64 `json:"memoryRequestsGB,omitempty"`      // Sum of pod memory requests in GB
	// PVC metrics
	PVCCount      int `json:"pvcCount,omitempty"`      // Total PVC count
	PVCBoundCount int `json:"pvcBoundCount,omitempty"` // Bound PVC count
	// External reachability — TCP probe to the API server URL from this host (#4202)
	ExternallyReachable *bool `json:"externallyReachable,omitempty"`
	// Issues and timing
	Issues    []string `json:"issues,omitempty"`
	CheckedAt string   `json:"checkedAt,omitempty"`
}

func (m *MultiClusterClient) ListClusters(ctx context.Context) ([]ClusterInfo, error) {
	m.mu.RLock()
	rawConfig := m.rawConfig
	inClusterConfig := m.inClusterConfig
	noClusterMode := m.noClusterMode
	m.mu.RUnlock()

	if rawConfig == nil && inClusterConfig == nil {
		if noClusterMode {
			return []ClusterInfo{}, nil
		}
		if err := m.LoadConfig(); err != nil {
			if errors.Is(err, ErrNoClusterConfigured) {
				return []ClusterInfo{}, nil
			}
			return nil, err
		}
		m.mu.RLock()
		rawConfig = m.rawConfig
		inClusterConfig = m.inClusterConfig
		m.mu.RUnlock()
	}

	var clusters []ClusterInfo

	// If we have in-cluster config, add the local cluster with detected name
	if inClusterConfig != nil {
		name := m.inClusterName
		if name == "" {
			name = "in-cluster"
		}
		clusters = append(clusters, ClusterInfo{
			Name:      name,
			Context:   "in-cluster",
			Server:    inClusterConfig.Host,
			Source:    "in-cluster",
			IsCurrent: rawConfig == nil, // Current if no kubeconfig
		})
	}

	// Add clusters from kubeconfig if available
	if rawConfig != nil {
		currentContext := rawConfig.CurrentContext

		for contextName, contextInfo := range rawConfig.Contexts {
			clusterInfo, exists := rawConfig.Clusters[contextInfo.Cluster]
			server := ""
			if exists {
				server = clusterInfo.Server
			}

			// Get the user name from the AuthInfo reference
			user := contextInfo.AuthInfo

			// Detect auth method from kubeconfig AuthInfo
			authMethod := "unknown"
			if ai, ok := rawConfig.AuthInfos[contextInfo.AuthInfo]; ok && ai != nil {
				switch {
				case ai.Exec != nil:
					authMethod = "exec"
				case ai.Token != "" || ai.TokenFile != "":
					authMethod = "token"
				case len(ai.ClientCertificateData) > 0 || ai.ClientCertificate != "":
					authMethod = "certificate"
				case ai.AuthProvider != nil:
					authMethod = "auth-provider"
				}
			}

			clusters = append(clusters, ClusterInfo{
				Name:       contextName,
				Context:    contextName,
				Server:     server,
				User:       user,
				AuthMethod: authMethod,
				Source:     "kubeconfig",
				IsCurrent:  contextName == currentContext,
			})
		}
	}

	// Sort by name
	sort.Slice(clusters, func(i, j int) bool {
		return clusters[i].Name < clusters[j].Name
	})

	return clusters, nil
}

// DeduplicatedClusters returns one cluster per unique server URL, preferring
// short/user-friendly context names over auto-generated OpenShift names.
// This prevents double-counting when the same physical cluster is reachable
// via multiple kubeconfig contexts (e.g. "vllm-d" and
// "default/api-fmaas-vllm-d-fmaas-res-ibm-com:6443/...").
func (m *MultiClusterClient) DeduplicatedClusters(ctx context.Context) ([]ClusterInfo, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	// Group by server URL
	type group struct {
		primary ClusterInfo
		others  []string
	}
	serverGroups := make(map[string]*group)
	var noServer []ClusterInfo

	for _, cl := range clusters {
		if cl.Server == "" {
			noServer = append(noServer, cl)
			continue
		}
		g, exists := serverGroups[cl.Server]
		if !exists {
			serverGroups[cl.Server] = &group{primary: cl}
			continue
		}
		// Pick the shorter/friendlier name as primary
		if isBetterClusterName(cl.Name, g.primary.Name) {
			g.others = append(g.others, g.primary.Name)
			g.primary = cl
		} else {
			g.others = append(g.others, cl.Name)
		}
	}

	result := make([]ClusterInfo, 0, len(serverGroups)+len(noServer))
	for _, g := range serverGroups {
		result = append(result, g.primary)
	}
	result = append(result, noServer...)

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result, nil
}

// WarmupHealthCache probes all clusters on startup to populate the health cache.
// Without this, HealthyClusters() treats unknown clusters as healthy, causing
// every SSE stream to hit all clusters (including offline ones) on first load.
// Uses a lightweight namespace list (Limit=1) with a 5s per-cluster timeout.
// Blocks for at most 8s total.
func (m *MultiClusterClient) WarmupHealthCache() {
	ctx, cancel := context.WithTimeout(context.Background(), clusterHealthCheckTimeout)
	defer cancel()

	clusters, err := m.DeduplicatedClusters(ctx)
	if err != nil {
		slog.Error("[Warmup] failed to list clusters", "error", err)
		return
	}

	slog.Info("[Warmup] probing clusters for reachability", "clusterCount", len(clusters))
	var wg sync.WaitGroup
	for _, cl := range clusters {
		name := cl.Name
		ctxName := cl.Context
		wg.Add(1)
		safego.GoWith("health-check/"+name, func() {
			defer wg.Done()
			// #9334 — Respect context cancellation promptly. If the outer
			// warmup deadline already fired, don't start a fresh 5s probe
			// that extends the effective timeout well past the documented
			// clusterHealthCheckTimeout.
			select {
			case <-ctx.Done():
				return
			default:
			}
			probeCtx, probeCancel := context.WithTimeout(ctx, clusterProbeTimeout)
			defer probeCancel()

			client, clientErr := m.GetClient(ctxName)
			if clientErr != nil {
				errType := classifyError(clientErr.Error())
				// Drop the write if the warmup context has already expired
				// (#6497). Without this check a slow probe that returned
				// after WarmupHealthCache's 8s deadline would stomp on fresh
				// entries written by real request-path health checks.
				m.mu.Lock()
				if ctx.Err() == nil {
					m.healthCache[ctxName] = &ClusterHealth{
						Cluster:      name,
						Reachable:    false,
						Healthy:      false,
						ErrorType:    errType,
						ErrorMessage: redactedMessage(errType),
						CheckedAt:    time.Now().Format(time.RFC3339),
					}
					m.cacheTime[ctxName] = time.Now()
				}
				m.mu.Unlock()
				if errType == "auth" {
					slog.Info("[Warmup] auth failure — run credential refresh to restore access", "cluster", name)
				} else {
					slog.Error("[Warmup] unreachable (client error)", "cluster", name, "error", clientErr)
				}
				return
			}

			_, listErr := client.CoreV1().Namespaces().List(probeCtx, metav1.ListOptions{Limit: 1})
			if listErr != nil {
				errType := classifyError(listErr.Error())
				m.mu.Lock()
				// See the GetClient-error branch above for #6497 rationale.
				if ctx.Err() == nil {
					m.healthCache[ctxName] = &ClusterHealth{
						Cluster:      name,
						Reachable:    false,
						Healthy:      false,
						ErrorType:    errType,
						ErrorMessage: redactedMessage(errType),
						CheckedAt:    time.Now().Format(time.RFC3339),
					}
					m.cacheTime[ctxName] = time.Now()
				}
				m.mu.Unlock()
				if errType == "auth" {
					slog.Info("[Warmup] auth failure (will cache to avoid exec-plugin spam)", "cluster", name, "cacheTTL", authFailureCacheTTL)
				} else {
					slog.Info("[Warmup] unreachable", "cluster", name, "error", listErr)
				}
			} else {
				m.mu.Lock()
				// See the GetClient-error branch above for #6497 rationale.
				if ctx.Err() == nil {
					m.healthCache[ctxName] = &ClusterHealth{
						Cluster:   name,
						Reachable: true,
						Healthy:   true,
						CheckedAt: time.Now().Format(time.RFC3339),
					}
					m.cacheTime[ctxName] = time.Now()
				}
				m.mu.Unlock()
				slog.Info("[Warmup] reachable", "cluster", name)
			}
		})
	}

	// Wait for all probes to finish, but give up when the overall context deadline
	// fires. This prevents a single hung exec-plugin (e.g. oci credential helper)
	// from blocking server startup indefinitely.
	done := make(chan struct{})
	safego.Go(func() { wg.Wait(); close(done) })
	select {
	case <-done:
	case <-ctx.Done():
		slog.Info("[Warmup] timed out waiting for all cluster probes — continuing startup")
	}

	m.mu.RLock()
	reachable, unreachable := 0, 0
	for _, h := range m.healthCache {
		if h.Reachable {
			reachable++
		} else {
			unreachable++
		}
	}
	m.mu.RUnlock()
	slog.Info("[Warmup] done", "reachable", reachable, "unreachable", unreachable)
}

// HealthyClusters returns deduplicated clusters split into two lists:
// healthy/unknown clusters (safe to query) and offline clusters (skip to avoid
// blocking on timeouts). Clusters with no cached health data are treated as
// healthy (unknown = try them). This prevents spawning goroutines for clusters
// known to be unreachable, eliminating 15-30s timeout waste per offline cluster.
func (m *MultiClusterClient) HealthyClusters(ctx context.Context) (healthy []ClusterInfo, offline []ClusterInfo, err error) {
	all, err := m.DeduplicatedClusters(ctx)
	if err != nil {
		return nil, nil, err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, cl := range all {
		if h, ok := m.healthCache[cl.Context]; ok && !h.Reachable {
			cl.NeverConnected = h.LastSeen == ""
			offline = append(offline, cl)
		} else {
			// Reachable or unknown (no cache entry) — try it
			healthy = append(healthy, cl)
		}
	}
	return healthy, offline, nil
}

// MarkSlow flags a cluster as slow (recently timed out or took >5s).
// Slow clusters receive a reduced timeout for slowClusterTTL.
func (m *MultiClusterClient) MarkSlow(clusterName string) {
	m.mu.Lock()
	m.slowClusters[clusterName] = time.Now()
	m.mu.Unlock()
	slog.Info("[Slow] cluster marked as slow", "cluster", clusterName, "duration", slowClusterTTL)
}

// IsSlow returns true if the cluster was recently marked as slow.
func (m *MultiClusterClient) IsSlow(clusterName string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if t, ok := m.slowClusters[clusterName]; ok {
		return time.Since(t) < slowClusterTTL
	}
	return false
}

// isBetterClusterName returns true if candidate is a better (more user-friendly)
// name than current. Prefers shorter names without slashes or port numbers.
func isBetterClusterName(candidate, current string) bool {
	candidateAuto := strings.Contains(candidate, "/") && strings.Contains(candidate, ":")
	currentAuto := strings.Contains(current, "/") && strings.Contains(current, ":")
	if !candidateAuto && currentAuto {
		return true
	}
	if candidateAuto && !currentAuto {
		return false
	}
	return len(candidate) < len(current)
}

// GetClient returns a kubernetes client for the specified context.
//
// #9334 — Client construction (especially `clientcmd…ClientConfig()` for
// kubeconfigs that invoke an exec credential plugin like aws-iam-authenticator,
// oci, gcloud, tsh, etc.) can take hundreds of ms to several seconds. Holding
// the global write lock for the entire construction serializes every other
// cluster probe in the process — fan-out health checks end up running
// one-at-a-time. We build the client OUTSIDE the lock and only take the write
// lock for the short final insertion, which permits concurrent construction
// for different contexts while still preventing a single context from being
// constructed twice.

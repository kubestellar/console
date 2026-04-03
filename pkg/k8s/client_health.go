package k8s

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func ClassifyError(errMsg string) string {
	return classifyError(errMsg)
}

// classifyError determines the error type from an error message
func classifyError(errMsg string) string {
	lowerMsg := strings.ToLower(errMsg)

	// Timeout errors
	if strings.Contains(lowerMsg, "timeout") ||
		strings.Contains(lowerMsg, "deadline exceeded") ||
		strings.Contains(lowerMsg, "context deadline") ||
		strings.Contains(lowerMsg, "i/o timeout") {
		return "timeout"
	}

	// Auth errors (includes exec-plugin / IAM failures)
	if strings.Contains(lowerMsg, "401") ||
		strings.Contains(lowerMsg, "403") ||
		strings.Contains(lowerMsg, "unauthorized") ||
		strings.Contains(lowerMsg, "forbidden") ||
		strings.Contains(lowerMsg, "authentication") ||
		strings.Contains(lowerMsg, "invalid token") ||
		strings.Contains(lowerMsg, "token expired") ||
		strings.Contains(lowerMsg, "exec plugin") ||
		strings.Contains(lowerMsg, "getting credentials") ||
		(strings.Contains(lowerMsg, "executable") && strings.Contains(lowerMsg, "not found")) {
		return "auth"
	}

	// Network errors
	if strings.Contains(lowerMsg, "connection refused") ||
		strings.Contains(lowerMsg, "no route to host") ||
		strings.Contains(lowerMsg, "network unreachable") ||
		strings.Contains(lowerMsg, "dial tcp") ||
		strings.Contains(lowerMsg, "no such host") ||
		strings.Contains(lowerMsg, "lookup") {
		return "network"
	}

	// Certificate errors
	if strings.Contains(lowerMsg, "x509") ||
		strings.Contains(lowerMsg, "tls") ||
		strings.Contains(lowerMsg, "certificate") ||
		strings.Contains(lowerMsg, "ssl") {
		return "certificate"
	}

	return "unknown"
}

// GetClusterHealth returns health status for a cluster
func (m *MultiClusterClient) GetClusterHealth(ctx context.Context, contextName string) (*ClusterHealth, error) {
	// Check cache — also save previous cached data for fallback on partial failures.
	// Auth-failed clusters use a longer TTL to avoid repeatedly triggering exec
	// credential plugins (e.g. tsh) that flood stderr with relogin errors (#3158).
	var prevCached *ClusterHealth
	m.mu.RLock()
	if health, ok := m.healthCache[contextName]; ok {
		ttl := m.cacheTTL
		if health.ErrorType == "auth" {
			ttl = authFailureCacheTTL
		}
		if time.Since(m.cacheTime[contextName]) < ttl {
			m.mu.RUnlock()
			return health, nil
		}
		prevCached = health
	}
	m.mu.RUnlock()

	now := time.Now().Format(time.RFC3339)

	client, err := m.GetClient(contextName)
	if err != nil {
		errMsg := err.Error()
		return &ClusterHealth{
			Cluster:      contextName,
			Healthy:      false,
			Reachable:    false,
			ErrorType:    classifyError(errMsg),
			ErrorMessage: errMsg,
			Issues:       []string{fmt.Sprintf("Failed to connect: %v", err)},
			CheckedAt:    now,
		}, nil
	}

	health := &ClusterHealth{
		Cluster:   contextName,
		Healthy:   true,
		Reachable: true,
		LastSeen:  now,
		CheckedAt: now,
	}

	// Fetch nodes, pods, and PVCs in parallel to avoid sequential timeout accumulation.
	// Large clusters (e.g. 18 nodes, 972 pods) can take 10-20s per call sequentially,
	// exceeding the context deadline. Parallel fetches reduce wall-clock time to max(individual).
	var (
		nodes    *corev1.NodeList
		pods     *corev1.PodList
		pvcs     *corev1.PersistentVolumeClaimList
		nodesErr error
		podsErr  error
		pvcsErr  error
		wg       sync.WaitGroup
	)

	wg.Add(3)
	go func() {
		defer wg.Done()
		nodes, nodesErr = client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		pods, podsErr = client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		pvcs, pvcsErr = client.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
	}()
	wg.Wait()

	// Process nodes - determines reachability
	if nodesErr != nil {
		errMsg := nodesErr.Error()
		health.Healthy = false
		health.Reachable = false
		health.ErrorType = classifyError(errMsg)
		health.ErrorMessage = errMsg
		health.Issues = append(health.Issues, fmt.Sprintf("Failed to list nodes: %v", nodesErr))
	} else if nodes != nil {
		health.NodeCount = len(nodes.Items)
		var totalCPU int64
		var totalMemory int64
		var totalStorage int64
		var diskPressureNodes []string
		var memoryPressureNodes []string
		var pidPressureNodes []string
		for _, node := range nodes.Items {
			// Count ready nodes and check node conditions
			for _, condition := range node.Status.Conditions {
				switch condition.Type {
				case corev1.NodeReady:
					if condition.Status == corev1.ConditionTrue {
						health.ReadyNodes++
					}
				case corev1.NodeDiskPressure:
					if condition.Status == corev1.ConditionTrue {
						diskPressureNodes = append(diskPressureNodes, node.Name)
					}
				case corev1.NodeMemoryPressure:
					if condition.Status == corev1.ConditionTrue {
						memoryPressureNodes = append(memoryPressureNodes, node.Name)
					}
				case corev1.NodePIDPressure:
					if condition.Status == corev1.ConditionTrue {
						pidPressureNodes = append(pidPressureNodes, node.Name)
					}
				}
			}
			if cpu := node.Status.Allocatable.Cpu(); cpu != nil {
				totalCPU += cpu.Value()
			}
			if mem := node.Status.Allocatable.Memory(); mem != nil {
				totalMemory += mem.Value()
			}
			if storage, ok := node.Status.Allocatable["ephemeral-storage"]; ok {
				totalStorage += storage.Value()
			}
		}
		health.CpuCores = int(totalCPU)
		health.MemoryBytes = totalMemory
		health.MemoryGB = float64(totalMemory) / (1024 * 1024 * 1024)
		health.StorageBytes = totalStorage
		health.StorageGB = float64(totalStorage) / (1024 * 1024 * 1024)
		if health.ReadyNodes < health.NodeCount {
			health.Issues = append(health.Issues, fmt.Sprintf("%d/%d nodes not ready", health.NodeCount-health.ReadyNodes, health.NodeCount))
		}
		if len(diskPressureNodes) > 0 {
			health.Issues = append(health.Issues, fmt.Sprintf("DiskPressure on %d node(s): %s", len(diskPressureNodes), strings.Join(diskPressureNodes, ", ")))
		}
		if len(memoryPressureNodes) > 0 {
			health.Issues = append(health.Issues, fmt.Sprintf("MemoryPressure on %d node(s): %s", len(memoryPressureNodes), strings.Join(memoryPressureNodes, ", ")))
		}
		if len(pidPressureNodes) > 0 {
			health.Issues = append(health.Issues, fmt.Sprintf("PIDPressure on %d node(s): %s", len(pidPressureNodes), strings.Join(pidPressureNodes, ", ")))
		}
	}

	// Process pods - non-fatal, fall back to cached values on timeout
	if podsErr == nil && pods != nil {
		health.PodCount = len(pods.Items)
		var totalCPURequests int64
		var totalMemoryRequests int64
		for _, pod := range pods.Items {
			if pod.Status.Phase != corev1.PodRunning {
				continue
			}
			for _, container := range pod.Spec.Containers {
				if container.Resources.Requests != nil {
					if cpu := container.Resources.Requests.Cpu(); cpu != nil {
						totalCPURequests += cpu.MilliValue()
					}
					if mem := container.Resources.Requests.Memory(); mem != nil {
						totalMemoryRequests += mem.Value()
					}
				}
			}
		}
		health.CpuRequestsMillicores = totalCPURequests
		health.CpuRequestsCores = float64(totalCPURequests) / 1000.0
		health.MemoryRequestsBytes = totalMemoryRequests
		health.MemoryRequestsGB = float64(totalMemoryRequests) / (1024 * 1024 * 1024)
	} else if prevCached != nil {
		// Pod listing timed out — preserve previous cached pod data instead of showing 0
		health.PodCount = prevCached.PodCount
		health.CpuRequestsMillicores = prevCached.CpuRequestsMillicores
		health.CpuRequestsCores = prevCached.CpuRequestsCores
		health.MemoryRequestsBytes = prevCached.MemoryRequestsBytes
		health.MemoryRequestsGB = prevCached.MemoryRequestsGB
	}

	// Process PVCs - non-fatal, fall back to cached values on timeout
	if pvcsErr == nil && pvcs != nil {
		health.PVCCount = len(pvcs.Items)
		for _, pvc := range pvcs.Items {
			if pvc.Status.Phase == corev1.ClaimBound {
				health.PVCBoundCount++
			}
		}
	} else if prevCached != nil {
		health.PVCCount = prevCached.PVCCount
		health.PVCBoundCount = prevCached.PVCBoundCount
	}

	// Populate the API server URL from the REST config for the frontend to display.
	// Also run an external TCP probe to distinguish internal-only vs external reachability (#4202).
	if health.Reachable {
		m.mu.RLock()
		cfg := m.configs[contextName]
		m.mu.RUnlock()
		if cfg != nil && cfg.Host != "" {
			health.APIServer = cfg.Host
			reachable := probeAPIServer(cfg.Host)
			health.ExternallyReachable = &reachable
			if !reachable {
				health.Issues = append(health.Issues, "API server externally unreachable (TCP probe failed)")
			}
		}
	}

	// Only cache successful results — don't cache failures (timeout, context canceled)
	// so the next request retries immediately instead of serving stale errors
	if health.Reachable {
		m.mu.Lock()
		m.healthCache[contextName] = health
		m.cacheTime[contextName] = time.Now()
		m.mu.Unlock()
	}

	return health, nil
}

// probeAPIServer performs a lightweight TCP dial to the API server URL to verify
// external reachability. The kc-agent can reach clusters via internal networking
// or VPN, but users/CI runners may not be able to (#4202).
func probeAPIServer(host string) bool {
	// Parse the URL to extract host:port.
	// rest.Config.Host can be a bare "host:port" or a full URL "https://host:port".
	addr := host
	if strings.Contains(host, "://") {
		parsed, err := url.Parse(host)
		if err != nil {
			return false
		}
		port := parsed.Port()
		if port == "" {
			if parsed.Scheme == "https" {
				port = "443"
			} else {
				port = "80"
			}
		}
		addr = net.JoinHostPort(parsed.Hostname(), port)
	} else if !strings.Contains(host, ":") {
		addr = net.JoinHostPort(host, "443")
	}

	conn, err := net.DialTimeout("tcp", addr, clusterProbeTimeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// GetPods returns pods for a namespace/cluster

func formatAge(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	duration := time.Since(t)
	if duration.Hours() > 24 {
		return fmt.Sprintf("%dd", int(duration.Hours()/24))
	} else if duration.Hours() > 1 {
		return fmt.Sprintf("%dh", int(duration.Hours()))
	} else {
		return fmt.Sprintf("%dm", int(duration.Minutes()))
	}
}

// GetCachedHealth returns all cached cluster health data without making any
// network calls. Returns a map of context-name → *ClusterHealth. Entries that
// have never been checked are simply absent from the map.
func (m *MultiClusterClient) GetCachedHealth() map[string]*ClusterHealth {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string]*ClusterHealth, len(m.healthCache))
	for k, v := range m.healthCache {
		result[k] = v
	}
	return result
}

// GetAllClusterHealth returns health status for all clusters
func (m *MultiClusterClient) GetAllClusterHealth(ctx context.Context) ([]ClusterHealth, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]ClusterHealth, 0, len(clusters))

	for _, cluster := range clusters {
		wg.Add(1)
		go func(c ClusterInfo) {
			defer wg.Done()
			health, _ := m.GetClusterHealth(ctx, c.Name)
			if health != nil {
				mu.Lock()
				results = append(results, *health)
				mu.Unlock()
			}
		}(cluster)
	}

	wg.Wait()
	return results, nil
}

// CheckSecurityIssues finds pods with security misconfigurations
func (m *MultiClusterClient) CheckSecurityIssues(ctx context.Context, contextName, namespace string) ([]SecurityIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var issues []SecurityIssue
	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			sc := container.SecurityContext
			podSC := pod.Spec.SecurityContext

			// Check for privileged containers
			if sc != nil && sc.Privileged != nil && *sc.Privileged {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Privileged container",
					Severity:  "high",
					Details:   fmt.Sprintf("Container '%s' running in privileged mode", container.Name),
				})
			}

			// Check for running as root
			runAsRoot := false
			if sc != nil && sc.RunAsUser != nil && *sc.RunAsUser == 0 {
				runAsRoot = true
			} else if sc == nil && podSC != nil && podSC.RunAsUser != nil && *podSC.RunAsUser == 0 {
				runAsRoot = true
			}
			if runAsRoot {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Running as root",
					Severity:  "high",
					Details:   fmt.Sprintf("Container '%s' running as root user (UID 0)", container.Name),
				})
			}

			// Check for missing security context
			if sc == nil && podSC == nil {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Missing security context",
					Severity:  "low",
					Details:   fmt.Sprintf("Container '%s' has no security context defined", container.Name),
				})
			}
		}

		// Check for host network
		if pod.Spec.HostNetwork {
			issues = append(issues, SecurityIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Issue:     "Host network enabled",
				Severity:  "medium",
				Details:   "Pod using host network namespace",
			})
		}

		// Check for host PID
		if pod.Spec.HostPID {
			issues = append(issues, SecurityIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Issue:     "Host PID enabled",
				Severity:  "medium",
				Details:   "Pod sharing host PID namespace",
			})
		}
	}

	return issues, nil
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// NVIDIAOperatorStatus represents the status of NVIDIA GPU and Network operators
type NVIDIAOperatorStatus struct {
	Cluster         string               `json:"cluster"`
	GPUOperator     *GPUOperatorInfo     `json:"gpuOperator,omitempty"`
	NetworkOperator *NetworkOperatorInfo `json:"networkOperator,omitempty"`
}

// GPUOperatorInfo represents NVIDIA GPU Operator ClusterPolicy status
type GPUOperatorInfo struct {
	Installed     bool                `json:"installed"`
	Version       string              `json:"version,omitempty"`
	State         string              `json:"state,omitempty"` // ready, notReady, disabled
	Ready         bool                `json:"ready"`
	Components    []OperatorComponent `json:"components,omitempty"`
	DriverVersion string              `json:"driverVersion,omitempty"`
	CUDAVersion   string              `json:"cudaVersion,omitempty"`
	Namespace     string              `json:"namespace,omitempty"`
}

// NetworkOperatorInfo represents NVIDIA Network Operator NicClusterPolicy status
type NetworkOperatorInfo struct {
	Installed  bool                `json:"installed"`
	Version    string              `json:"version,omitempty"`
	State      string              `json:"state,omitempty"` // ready, notReady, disabled
	Ready      bool                `json:"ready"`
	Components []OperatorComponent `json:"components,omitempty"`
	Namespace  string              `json:"namespace,omitempty"`
}

// OperatorComponent represents a component of the NVIDIA operators
type OperatorComponent struct {
	Name   string `json:"name"`
	Status string `json:"status"` // ready, pending, error, disabled
	Reason string `json:"reason,omitempty"`
}

// GetNVIDIAOperatorStatus fetches the status of NVIDIA GPU and Network operators

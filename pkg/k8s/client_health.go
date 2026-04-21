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

	// Config errors — exec-plugin (client-go credential helper) missing or
	// misconfigured. Must be checked BEFORE the auth branch, otherwise
	// messages like `exec: "aws-iam-authenticator": executable file not found
	// in $PATH` get classified as auth failures and hit the 10-minute
	// authFailureCacheTTL, hiding a config problem the user can actually fix
	// (#6508). This is kubeconfig/env misconfiguration, not a credential issue.
	if strings.Contains(lowerMsg, "executable file not found") ||
		(strings.Contains(lowerMsg, "exec:") && strings.Contains(lowerMsg, "not found")) ||
		strings.Contains(lowerMsg, "executable not found") {
		return "config"
	}

	// Auth errors — narrowed to messages that clearly indicate an identity
	// or credential problem. Previously this branch also matched generic
	// "not found" substrings, which misclassified exec-plugin-missing errors
	// as auth failures (#6508).
	if strings.Contains(lowerMsg, "401") ||
		strings.Contains(lowerMsg, "403") ||
		strings.Contains(lowerMsg, "unauthorized") ||
		strings.Contains(lowerMsg, "forbidden") ||
		strings.Contains(lowerMsg, "authentication") ||
		strings.Contains(lowerMsg, "credentials") ||
		strings.Contains(lowerMsg, "invalid token") ||
		strings.Contains(lowerMsg, "token expired") ||
		strings.Contains(lowerMsg, "exec plugin") ||
		strings.Contains(lowerMsg, "getting credentials") {
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

	// Not-found errors — cluster context does not exist in kubeconfig (#4907)
	if strings.Contains(lowerMsg, "not found") ||
		strings.Contains(lowerMsg, "does not exist") ||
		strings.Contains(lowerMsg, "no configuration") ||
		strings.Contains(lowerMsg, "not exist") {
		return "not_found"
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

	// Only cache successful results or non-transient configuration/auth errors.
	// We don't cache transient failures (timeout, network) so the next
	// request retries immediately. (#3158)
	if health.Reachable || health.ErrorType == "auth" || health.ErrorType == "config" {
		m.mu.Lock()
		m.healthCache[contextName] = health
		m.cacheTime[contextName] = time.Now()
		m.mu.Unlock()
	}

	return health, nil
}

// defaultAPIServerPort is the port assumed when the API server URL doesn't
// include one. HTTPS is the overwhelming case for Kubernetes API servers; bare
// host entries (no scheme, no port) also default here.
const defaultAPIServerPort = "443"

// probeAPIServer performs a lightweight TCP dial to the API server URL to verify
// external reachability. The kc-agent can reach clusters via internal networking
// or VPN, but users/CI runners may not be able to (#4202).
//
// #9338 — IPv6 hosts contain many colons (e.g. `2001:db8::1`). The previous
// implementation used `strings.Contains(host, ":")` to detect "port already
// present", which misclassified bare IPv6 addresses as already-ported and
// produced invalid dial addresses. We now rely on `net.SplitHostPort` for
// hosts that look port-decorated (bracketed or trailing numeric segment),
// and `net.JoinHostPort` to construct the dial address — it handles
// bracketing automatically for IPv6.
func probeAPIServer(host string) bool {
	addr, ok := apiServerDialAddr(host)
	if !ok {
		return false
	}

	conn, err := net.DialTimeout("tcp", addr, clusterProbeTimeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// apiServerDialAddr converts a rest.Config.Host value (which may be a bare
// host, `host:port`, a full URL, or an IPv6 literal) into a `host:port`
// address suitable for net.DialTimeout. Returns ok=false if the input cannot
// be parsed. (#9338)
func apiServerDialAddr(host string) (string, bool) {
	// Full URL form — let net/url handle it.
	if strings.Contains(host, "://") {
		parsed, err := url.Parse(host)
		if err != nil {
			return "", false
		}
		hostname := parsed.Hostname()
		if hostname == "" {
			return "", false
		}
		port := parsed.Port()
		if port == "" {
			if parsed.Scheme == "https" {
				port = defaultAPIServerPort
			} else {
				port = "80"
			}
		}
		return net.JoinHostPort(hostname, port), true
	}

	// Bracketed IPv6, possibly with a port: `[::1]` or `[::1]:8080`.
	if strings.HasPrefix(host, "[") {
		if strings.Contains(host, "]:") {
			// Has an explicit port — net.SplitHostPort handles this correctly.
			h, p, err := net.SplitHostPort(host)
			if err != nil {
				return "", false
			}
			return net.JoinHostPort(h, p), true
		}
		// Bare bracketed IPv6, no port.
		h := strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
		if h == "" {
			return "", false
		}
		return net.JoinHostPort(h, defaultAPIServerPort), true
	}

	// No scheme, no brackets. Decide between "bare IPv6 literal" and
	// "host:port" by looking at the last colon-delimited segment: a port is
	// numeric, an IPv6 segment is hex (may contain letters) or empty.
	lastColon := strings.LastIndex(host, ":")
	if lastColon == -1 {
		// No colons at all — must be a bare host or IPv4.
		return net.JoinHostPort(host, defaultAPIServerPort), true
	}
	tail := host[lastColon+1:]
	if isNumericPort(tail) && !strings.Contains(host[:lastColon], ":") {
		// Exactly one colon with a numeric tail → `host:port` (IPv4/hostname).
		h, p, err := net.SplitHostPort(host)
		if err != nil {
			return "", false
		}
		return net.JoinHostPort(h, p), true
	}
	// Otherwise treat the whole thing as a bare IPv6 literal. JoinHostPort
	// will bracket it correctly for the dial address.
	return net.JoinHostPort(host, defaultAPIServerPort), true
}

// isNumericPort returns true if s is a non-empty sequence of ASCII digits.
// Used by apiServerDialAddr to disambiguate `host:port` from bare IPv6 (#9338).
func isNumericPort(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
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

// GetAllClusterHealth returns health status for all clusters.
//
// A global deadline (totalHealthTimeout) bounds the whole call — one slow
// cluster cannot hold the entire response. Each individual cluster probe
// gets its own perClusterHealthTimeout sub-context. When the global deadline
// fires, clusters that have not yet reported are marked with ErrorType
// "timeout" and Healthy=false so the caller still gets an entry per cluster
// instead of waiting indefinitely or silently dropping slow clusters (#6506).
func (m *MultiClusterClient) GetAllClusterHealth(ctx context.Context) ([]ClusterHealth, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	deadlineCtx, cancel := context.WithTimeout(ctx, totalHealthTimeout)
	defer cancel()

	type slot struct {
		name   string
		health *ClusterHealth
		done   bool
	}
	slots := make([]slot, len(clusters))
	for i, c := range clusters {
		slots[i].name = c.Name
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	for i, cluster := range clusters {
		wg.Add(1)
		go func(idx int, c ClusterInfo) {
			defer wg.Done()
			// #7751: Check for context cancellation before starting an
			// expensive health probe. Without this, goroutines that haven't
			// begun probing yet still launch full k8s API calls even after
			// the global deadline fires, leaking until the probe completes.
			select {
			case <-deadlineCtx.Done():
				return
			default:
			}
			perCtx, perCancel := context.WithTimeout(deadlineCtx, perClusterHealthTimeout)
			defer perCancel()
			health, _ := m.GetClusterHealth(perCtx, c.Name)
			mu.Lock()
			slots[idx].health = health
			slots[idx].done = true
			mu.Unlock()
		}(i, cluster)
	}

	// Wait for either all goroutines to finish or the global deadline to fire.
	waitCh := make(chan struct{})
	go func() {
		wg.Wait()
		close(waitCh)
	}()
	select {
	case <-waitCh:
	case <-deadlineCtx.Done():
		// Global deadline exceeded — any slots still marked !done will be
		// synthesized as timeout entries in the loop below. We do not wait
		// any additional grace period here; doing so would extend the caller's
		// effective timeout beyond deadlineCtx. (#6547)
	}

	now := time.Now().Format(time.RFC3339)
	results := make([]ClusterHealth, 0, len(slots))
	mu.Lock()
	for _, s := range slots {
		if s.done && s.health != nil {
			results = append(results, *s.health)
			continue
		}
		// Not yet reported by the deadline — emit a synthetic timeout entry so
		// the UI shows "timeout" instead of silently dropping the cluster.
		results = append(results, ClusterHealth{
			Cluster:      s.name,
			Healthy:      false,
			Reachable:    false,
			ErrorType:    "timeout",
			ErrorMessage: "cluster health probe exceeded global deadline",
			Issues:       []string{"Cluster health probe exceeded global deadline"},
			CheckedAt:    now,
		})
	}
	mu.Unlock()
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

			// Check for running as root. Container-level SecurityContext.RunAsUser
			// overrides pod-level PodSecurityContext.RunAsUser ONLY when it is
			// non-nil. Previously we only consulted the pod-level value when the
			// ENTIRE container-level SecurityContext was nil — meaning a container
			// with a non-nil SecurityContext that set only unrelated fields (e.g.
			// `Privileged: false`) would hide an inherited pod-level
			// `RunAsUser: 0`. Kubernetes resolves these field-by-field, so we
			// must mirror that: only fall back to pod-level for fields the
			// container didn't set. (#9337)
			var effectiveRunAsUser *int64
			if sc != nil && sc.RunAsUser != nil {
				effectiveRunAsUser = sc.RunAsUser
			} else if podSC != nil && podSC.RunAsUser != nil {
				effectiveRunAsUser = podSC.RunAsUser
			}
			runAsRoot := effectiveRunAsUser != nil && *effectiveRunAsUser == 0
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

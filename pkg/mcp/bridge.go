package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"time"
)

// Bridge manages MCP client connections and provides a unified interface
type Bridge struct {
	opsClient    *Client
	deployClient *Client
	gadgetClient *Client
	mu           sync.RWMutex
	config       BridgeConfig
}

// BridgeConfig holds configuration for the MCP bridge
type BridgeConfig struct {
	KubestellarOpsPath    string
	KubestellarDeployPath string
	InspektorGadgetPath   string
	Kubeconfig            string
}

// ClusterInfo represents basic cluster information
type ClusterInfo struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server,omitempty"`
	User      string `json:"user,omitempty"`
	Healthy   bool   `json:"healthy"`
	Source    string `json:"source,omitempty"`
	NodeCount int    `json:"nodeCount,omitempty"`
	PodCount  int    `json:"podCount,omitempty"`
}

// ClusterHealth represents cluster health status
type ClusterHealth struct {
	Cluster       string   `json:"cluster"`
	Healthy       bool     `json:"healthy"`
	Reachable     bool     `json:"reachable"`
	LastSeen      string   `json:"lastSeen,omitempty"`
	ErrorType     string   `json:"errorType,omitempty"`
	ErrorMessage  string   `json:"errorMessage,omitempty"`
	APIServer     string   `json:"apiServer,omitempty"`
	NodeCount     int      `json:"nodeCount"`
	ReadyNodes    int      `json:"readyNodes"`
	PodCount      int      `json:"podCount"`
	CpuCores      int      `json:"cpuCores"`
	MemoryBytes   int64    `json:"memoryBytes"`
	MemoryGB      float64  `json:"memoryGB"`
	StorageBytes  int64    `json:"storageBytes"`
	StorageGB     float64  `json:"storageGB"`
	PVCCount      int      `json:"pvcCount,omitempty"`
	PVCBoundCount int      `json:"pvcBoundCount,omitempty"`
	Issues        []string `json:"issues,omitempty"`
	CheckedAt     string   `json:"checkedAt,omitempty"`
}

// PodInfo represents pod information
type PodInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Status    string `json:"status"`
	Ready     string `json:"ready"`
	Restarts  int    `json:"restarts"`
	Age       string `json:"age"`
	Node      string `json:"node,omitempty"`
}

// PodIssue represents a pod with issues
type PodIssue struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Cluster   string   `json:"cluster,omitempty"`
	Status    string   `json:"status"`
	Reason    string   `json:"reason,omitempty"`
	Issues    []string `json:"issues"`
	Restarts  int      `json:"restarts"`
}

// Event represents a Kubernetes event
type Event struct {
	Type      string    `json:"type"`
	Reason    string    `json:"reason"`
	Message   string    `json:"message"`
	Object    string    `json:"object"`
	Namespace string    `json:"namespace"`
	Cluster   string    `json:"cluster,omitempty"`
	Count     int       `json:"count"`
	FirstSeen time.Time `json:"firstSeen,omitempty"`
	LastSeen  time.Time `json:"lastSeen,omitempty"`
}

// NewBridge creates a new MCP bridge
func NewBridge(config BridgeConfig) *Bridge {
	return &Bridge{
		config: config,
	}
}

// Start initializes and starts all MCP clients.
// Binaries that are not found on PATH are skipped with a log message
// rather than treated as a fatal error.
func (b *Bridge) Start(ctx context.Context) error {
	var wg sync.WaitGroup
	errCh := make(chan error, 3)

	// Start kubestellar-ops if path is configured and binary exists
	if b.config.KubestellarOpsPath != "" {
		if _, err := exec.LookPath(b.config.KubestellarOpsPath); err != nil {
			slog.Info(fmt.Sprintf("kubestellar-ops binary not found on PATH (%q) — MCP ops tools will be unavailable. Install via: brew install kubestellar/tap/kubestellar-ops", b.config.KubestellarOpsPath))
		} else {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := b.startOpsClient(ctx); err != nil {
					errCh <- fmt.Errorf("ops client: %w", err)
				}
			}()
		}
	}

	// Start kubestellar-deploy if path is configured and binary exists
	if b.config.KubestellarDeployPath != "" {
		if _, err := exec.LookPath(b.config.KubestellarDeployPath); err != nil {
			slog.Info(fmt.Sprintf("kubestellar-deploy binary not found on PATH (%q) — MCP deploy tools will be unavailable. Install via: brew install kubestellar/tap/kubestellar-deploy", b.config.KubestellarDeployPath))
		} else {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := b.startDeployClient(ctx); err != nil {
					errCh <- fmt.Errorf("deploy client: %w", err)
				}
			}()
		}
	}

	// Start inspektor-gadget if path is configured and binary exists
	if b.config.InspektorGadgetPath != "" {
		if _, err := exec.LookPath(b.config.InspektorGadgetPath); err != nil {
			slog.Info(fmt.Sprintf("inspektor-gadget MCP binary not found on PATH (%q) — Gadget tools will be unavailable.", b.config.InspektorGadgetPath))
		} else {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := b.startGadgetClient(ctx); err != nil {
					errCh <- fmt.Errorf("gadget client: %w", err)
				}
			}()
		}
	}

	wg.Wait()
	close(errCh)

	// Collect any errors
	var errs []error
	for err := range errCh {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return fmt.Errorf("failed to start MCP clients: %v", errs)
	}

	return nil
}

// Stop stops all MCP clients
func (b *Bridge) Stop() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	var errs []error

	if b.opsClient != nil {
		if err := b.opsClient.Stop(); err != nil {
			errs = append(errs, fmt.Errorf("ops client: %w", err))
		}
	}

	if b.deployClient != nil {
		if err := b.deployClient.Stop(); err != nil {
			errs = append(errs, fmt.Errorf("deploy client: %w", err))
		}
	}

	if b.gadgetClient != nil {
		if err := b.gadgetClient.Stop(); err != nil {
			errs = append(errs, fmt.Errorf("gadget client: %w", err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors stopping clients: %v", errs)
	}

	return nil
}

func (b *Bridge) startOpsClient(ctx context.Context) error {
	args := []string{"--mcp-server"}
	if b.config.Kubeconfig != "" {
		args = append(args, "--kubeconfig", b.config.Kubeconfig)
	}

	client, err := NewClient("kubestellar-ops", b.config.KubestellarOpsPath, args...)
	if err != nil {
		return err
	}

	if err := client.Start(ctx); err != nil {
		return err
	}

	b.mu.Lock()
	b.opsClient = client
	b.mu.Unlock()

	return nil
}

func (b *Bridge) startGadgetClient(ctx context.Context) error {
	args := []string{"--mcp-server"}
	if b.config.Kubeconfig != "" {
		args = append(args, "--kubeconfig", b.config.Kubeconfig)
	}

	client, err := NewClient("inspektor-gadget", b.config.InspektorGadgetPath, args...)
	if err != nil {
		return err
	}

	if err := client.Start(ctx); err != nil {
		return err
	}

	b.mu.Lock()
	b.gadgetClient = client
	b.mu.Unlock()

	return nil
}

func (b *Bridge) startDeployClient(ctx context.Context) error {
	args := []string{"--mcp"}
	if b.config.Kubeconfig != "" {
		args = append(args, "--kubeconfig", b.config.Kubeconfig)
	}

	client, err := NewClient("kubestellar-deploy", b.config.KubestellarDeployPath, args...)
	if err != nil {
		return err
	}

	if err := client.Start(ctx); err != nil {
		return err
	}

	b.mu.Lock()
	b.deployClient = client
	b.mu.Unlock()

	return nil
}

// GetOpsTools returns the list of available ops tools
func (b *Bridge) GetOpsTools() []Tool {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil
	}
	return b.opsClient.Tools()
}

// GetDeployTools returns the list of available deploy tools
func (b *Bridge) GetDeployTools() []Tool {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.deployClient == nil {
		return nil
	}
	return b.deployClient.Tools()
}

// ListClusters returns all discovered clusters
func (b *Bridge) ListClusters(ctx context.Context) ([]ClusterInfo, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	result, err := b.opsClient.CallTool(ctx, "list_clusters", map[string]interface{}{
		"source": "all",
	})
	if err != nil {
		return nil, err
	}

	return b.parseClustersResult(result)
}

// GetClusterHealth returns health status for a cluster
func (b *Bridge) GetClusterHealth(ctx context.Context, cluster string) (*ClusterHealth, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	args := map[string]interface{}{}
	if cluster != "" {
		args["cluster"] = cluster
	}

	result, err := b.opsClient.CallTool(ctx, "get_cluster_health", args)
	if err != nil {
		return nil, err
	}

	return b.parseHealthResult(result)
}

// GetPods returns pods for a namespace/cluster
func (b *Bridge) GetPods(ctx context.Context, cluster, namespace, labelSelector string) ([]PodInfo, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	args := map[string]interface{}{}
	if cluster != "" {
		args["cluster"] = cluster
	}
	if namespace != "" {
		args["namespace"] = namespace
	}
	if labelSelector != "" {
		args["label_selector"] = labelSelector
	}

	result, err := b.opsClient.CallTool(ctx, "get_pods", args)
	if err != nil {
		return nil, err
	}

	return b.parsePodsResult(result)
}

// FindPodIssues returns pods with issues
func (b *Bridge) FindPodIssues(ctx context.Context, cluster, namespace string) ([]PodIssue, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	args := map[string]interface{}{}
	if cluster != "" {
		args["cluster"] = cluster
	}
	if namespace != "" {
		args["namespace"] = namespace
	}

	result, err := b.opsClient.CallTool(ctx, "find_pod_issues", args)
	if err != nil {
		return nil, err
	}

	return b.parsePodIssuesResult(result)
}

// GetEvents returns events from a cluster
func (b *Bridge) GetEvents(ctx context.Context, cluster, namespace string, limit int) ([]Event, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	args := map[string]interface{}{}
	if cluster != "" {
		args["cluster"] = cluster
	}
	if namespace != "" {
		args["namespace"] = namespace
	}
	if limit > 0 {
		args["limit"] = limit
	}

	result, err := b.opsClient.CallTool(ctx, "get_events", args)
	if err != nil {
		return nil, err
	}

	return b.parseEventsResult(result)
}

// GetWarningEvents returns warning events from a cluster
func (b *Bridge) GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]Event, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	args := map[string]interface{}{}
	if cluster != "" {
		args["cluster"] = cluster
	}
	if namespace != "" {
		args["namespace"] = namespace
	}
	if limit > 0 {
		args["limit"] = limit
	}

	result, err := b.opsClient.CallTool(ctx, "get_warning_events", args)
	if err != nil {
		return nil, err
	}

	return b.parseEventsResult(result)
}

// CallOpsTool calls any ops tool by name
func (b *Bridge) CallOpsTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.opsClient == nil {
		return nil, fmt.Errorf("ops client not available")
	}

	return b.opsClient.CallTool(ctx, name, args)
}

// GetGadgetTools returns the list of available gadget tools
func (b *Bridge) GetGadgetTools() []Tool {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.gadgetClient == nil {
		return nil
	}
	return b.gadgetClient.Tools()
}

// CallGadgetTool calls any gadget tool by name
func (b *Bridge) CallGadgetTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.gadgetClient == nil {
		return nil, fmt.Errorf("gadget client not available")
	}

	return b.gadgetClient.CallTool(ctx, name, args)
}

// CallDeployTool calls any deploy tool by name
func (b *Bridge) CallDeployTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.deployClient == nil {
		return nil, fmt.Errorf("deploy client not available")
	}

	return b.deployClient.CallTool(ctx, name, args)
}

// Helper functions to parse tool results

func (b *Bridge) parseClustersResult(result *CallToolResult) ([]ClusterInfo, error) {
	if result.IsError {
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	// Parse the text content as JSON
	clusters := make([]ClusterInfo, 0)
	for _, content := range result.Content {
		if content.Type == "text" {
			if err := json.Unmarshal([]byte(content.Text), &clusters); err != nil {
				// Try to extract from formatted text
				return b.parseClustersFromText(content.Text), nil
			}
		}
	}
	return clusters, nil
}

func (b *Bridge) parseClustersFromText(text string) []ClusterInfo {
	// Fallback parser for human-readable output
	// This is a simplified parser - in production you'd want proper parsing
	return []ClusterInfo{}
}

func (b *Bridge) parseHealthResult(result *CallToolResult) (*ClusterHealth, error) {
	if result.IsError {
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	var health ClusterHealth
	for _, content := range result.Content {
		if content.Type == "text" {
			if err := json.Unmarshal([]byte(content.Text), &health); err != nil {
				// Parse from text format
				health.Healthy = true // Default assumption
				return &health, nil
			}
		}
	}
	return &health, nil
}

func (b *Bridge) parsePodsResult(result *CallToolResult) ([]PodInfo, error) {
	if result.IsError {
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	pods := make([]PodInfo, 0)
	for _, content := range result.Content {
		if content.Type == "text" {
			if err := json.Unmarshal([]byte(content.Text), &pods); err != nil {
				return []PodInfo{}, nil
			}
		}
	}
	return pods, nil
}

func (b *Bridge) parsePodIssuesResult(result *CallToolResult) ([]PodIssue, error) {
	if result.IsError {
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	issues := make([]PodIssue, 0)
	for _, content := range result.Content {
		if content.Type == "text" {
			if err := json.Unmarshal([]byte(content.Text), &issues); err != nil {
				return []PodIssue{}, nil
			}
		}
	}
	return issues, nil
}

func (b *Bridge) parseEventsResult(result *CallToolResult) ([]Event, error) {
	if result.IsError {
		return nil, fmt.Errorf("tool error: %s", result.Content[0].Text)
	}

	events := make([]Event, 0)
	for _, content := range result.Content {
		if content.Type == "text" {
			if err := json.Unmarshal([]byte(content.Text), &events); err != nil {
				return []Event{}, nil
			}
		}
	}
	return events, nil
}

// Status returns the current status of the MCP bridge
func (b *Bridge) Status() map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()

	opsAvailable := b.opsClient != nil && b.opsClient.IsReady()
	deployAvailable := b.deployClient != nil && b.deployClient.IsReady()
	gadgetAvailable := b.gadgetClient != nil && b.gadgetClient.IsReady()

	opsStatus := map[string]interface{}{
		"available": opsAvailable,
		"toolCount": 0,
	}
	deployStatus := map[string]interface{}{
		"available": deployAvailable,
		"toolCount": 0,
	}
	gadgetStatus := map[string]interface{}{
		"available": gadgetAvailable,
		"toolCount": 0,
	}

	// Add installation hint when binary is not on PATH
	if !opsAvailable {
		if _, err := exec.LookPath(b.config.KubestellarOpsPath); err != nil {
			opsStatus["reason"] = "binary not found on PATH"
			opsStatus["install"] = "brew install kubestellar/tap/kubestellar-ops"
		}
	}
	if !deployAvailable {
		if _, err := exec.LookPath(b.config.KubestellarDeployPath); err != nil {
			deployStatus["reason"] = "binary not found on PATH"
			deployStatus["install"] = "brew install kubestellar/tap/kubestellar-deploy"
		}
	}
	if !gadgetAvailable {
		if _, err := exec.LookPath(b.config.InspektorGadgetPath); err != nil {
			gadgetStatus["reason"] = "binary not found on PATH"
		}
	}

	status := map[string]interface{}{
		"opsClient":    opsStatus,
		"deployClient": deployStatus,
		"gadgetClient": gadgetStatus,
	}

	if opsAvailable {
		opsStatus["toolCount"] = len(b.opsClient.Tools())
	}
	if deployAvailable {
		deployStatus["toolCount"] = len(b.deployClient.Tools())
	}
	if gadgetAvailable {
		gadgetStatus["toolCount"] = len(b.gadgetClient.Tools())
	}

	return status
}

// DefaultBridgeConfig returns a default configuration from environment
func DefaultBridgeConfig() BridgeConfig {
	return BridgeConfig{
		KubestellarOpsPath:    getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
		KubestellarDeployPath: getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
		InspektorGadgetPath:   getEnvOrDefault("INSPEKTOR_GADGET_MCP_PATH", "ig-mcp-server"),
		Kubeconfig:            os.Getenv("KUBECONFIG"),
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Progress percentage constants for cluster creation/deletion phases
const (
	progressValidating = 10  // Pre-flight checks (Docker daemon, tool availability)
	progressCreating   = 30  // Cluster creation command dispatched
	progressDeleting   = 30  // Cluster deletion command dispatched
	progressConnecting = 50  // Connection/disconnect operation in progress
	progressDone       = 100 // Operation completed successfully
	progressFailed     = 0   // Operation failed
)

// vCluster CLI operation timeouts
const (
	vclusterListTimeout    = 15 * time.Second  // Timeout for listing vClusters
	vclusterCreateTimeout  = 120 * time.Second // Timeout for creating a vCluster
	vclusterConnectTimeout = 30 * time.Second  // Timeout for connecting/disconnecting a vCluster
	vclusterDeleteTimeout  = 60 * time.Second  // Timeout for deleting a vCluster
)

var (
	// execCommand is already declared in kubectl.go
	lookPath = exec.LookPath
)

// LocalClusterTool represents a detected local cluster tool
type LocalClusterTool struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Path      string `json:"path,omitempty"`
}

// LocalCluster represents a local cluster instance
type LocalCluster struct {
	Name   string `json:"name"`
	Tool   string `json:"tool"`
	Status string `json:"status"` // "running", "stopped", "unknown"
}

// VClusterInstance represents a vCluster instance
type VClusterInstance struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`    // "Running", "Paused", etc.
	Connected bool   `json:"connected"` // whether kubeconfig context exists
	Context   string `json:"context"`   // kubeconfig context name if connected
}

// vclusterListEntry mirrors the JSON output from `vcluster list --output json`
type vclusterListEntry struct {
	Name      string `json:"Name"`
	Namespace string `json:"Namespace"`
	Status    string `json:"Status"`
	Connected bool   `json:"Connected"`
	Context   string `json:"Context"`
}

// LocalClusterManager handles local cluster operations
type LocalClusterManager struct {
	broadcast func(msgType string, payload interface{})
}

// NewLocalClusterManager creates a new manager with an optional broadcast callback
// for sending real-time progress updates to connected WebSocket clients.
func NewLocalClusterManager(broadcast func(string, interface{})) *LocalClusterManager {
	return &LocalClusterManager{broadcast: broadcast}
}

// broadcastProgress sends a progress update to all connected clients
func (m *LocalClusterManager) broadcastProgress(tool, name, status, message string, progress int) {
	if m.broadcast != nil {
		m.broadcast("local_cluster_progress", map[string]interface{}{
			"tool":     tool,
			"name":     name,
			"status":   status,
			"message":  message,
			"progress": progress,
		})
	}
}

// checkDockerRunning verifies the Docker daemon is reachable (required by kind/k3d)
func (m *LocalClusterManager) checkDockerRunning() error {
	cmd := execCommand("docker", "info")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Docker is not running. Start Docker Desktop or Rancher Desktop first. (%s)", strings.TrimSpace(stderr.String()))
	}
	return nil
}

// DetectTools returns all detected local cluster tools
func (m *LocalClusterManager) DetectTools() []LocalClusterTool {
	tools := []LocalClusterTool{}

	// Check kind
	if tool := m.detectKind(); tool != nil {
		tools = append(tools, *tool)
	}

	// Check k3d
	if tool := m.detectK3d(); tool != nil {
		tools = append(tools, *tool)
	}

	// Check minikube
	if tool := m.detectMinikube(); tool != nil {
		tools = append(tools, *tool)
	}

	// Check vcluster
	if tool := m.detectVCluster(); tool != nil {
		tools = append(tools, *tool)
	}

	return tools
}

func (m *LocalClusterManager) detectKind() *LocalClusterTool {
	path, err := lookPath("kind")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "kind",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := execCommand("kind", "version")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		// Parse "kind v0.20.0 go1.21.0 darwin/arm64"
		version := strings.TrimSpace(out.String())
		if parts := strings.Fields(version); len(parts) >= 2 {
			tool.Version = strings.TrimPrefix(parts[1], "v")
		}
	}

	return tool
}

func (m *LocalClusterManager) detectK3d() *LocalClusterTool {
	path, err := lookPath("k3d")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "k3d",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := execCommand("k3d", "version")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		// Parse "k3d version v5.6.0\nk3s version v1.27.4-k3s1 (default)"
		lines := strings.Split(out.String(), "\n")
		if len(lines) > 0 {
			re := regexp.MustCompile(`v([\d.]+)`)
			if matches := re.FindStringSubmatch(lines[0]); len(matches) > 1 {
				tool.Version = matches[1]
			}
		}
	}

	return tool
}

func (m *LocalClusterManager) detectMinikube() *LocalClusterTool {
	path, err := lookPath("minikube")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "minikube",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := execCommand("minikube", "version", "--short")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		// Parse "v1.31.0"
		version := strings.TrimSpace(out.String())
		tool.Version = strings.TrimPrefix(version, "v")
	}

	return tool
}

// ListClusters returns all local clusters for all detected tools
func (m *LocalClusterManager) ListClusters() []LocalCluster {
	clusters := []LocalCluster{}

	// List kind clusters
	clusters = append(clusters, m.listKindClusters()...)

	// List k3d clusters
	clusters = append(clusters, m.listK3dClusters()...)

	// List minikube clusters
	clusters = append(clusters, m.listMinikubeClusters()...)

	return clusters
}

func (m *LocalClusterManager) listKindClusters() []LocalCluster {
	clusters := []LocalCluster{}

	cmd := execCommand("kind", "get", "clusters")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}

	for _, name := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if name != "" {
			clusters = append(clusters, LocalCluster{
				Name:   name,
				Tool:   "kind",
				Status: "running", // kind clusters are always running if listed
			})
		}
	}

	return clusters
}

func (m *LocalClusterManager) listK3dClusters() []LocalCluster {
	clusters := []LocalCluster{}

	cmd := execCommand("k3d", "cluster", "list", "--no-headers")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}

	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 1 {
			clusters = append(clusters, LocalCluster{
				Name:   fields[0],
				Tool:   "k3d",
				Status: "running",
			})
		}
	}

	return clusters
}

func (m *LocalClusterManager) listMinikubeClusters() []LocalCluster {
	clusters := []LocalCluster{}

	cmd := execCommand("minikube", "profile", "list", "-o", "json")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}

	// Parse JSON output - simplified parsing
	output := out.String()
	if strings.Contains(output, "valid") {
		// Extract profile names from JSON using regex (simplified)
		re := regexp.MustCompile(`"Name":\s*"([^"]+)"`)
		matches := re.FindAllStringSubmatch(output, -1)
		for _, match := range matches {
			if len(match) > 1 {
				clusters = append(clusters, LocalCluster{
					Name:   match[1],
					Tool:   "minikube",
					Status: "unknown", // Would need to check status separately
				})
			}
		}
	}

	return clusters
}

// dns1123LabelRegexp matches valid DNS-1123 labels (RFC 1123 section 2.1).
// Max 63 chars, lowercase alphanumeric, may contain hyphens but not at
// start or end.
var dns1123LabelRegexp = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// validateClusterName ensures the name is a valid DNS-1123 label before
// any exec call runs, preventing orphaned Docker containers from partial
// creates and flag-injection edge cases (#7249).
func validateClusterName(name string) error {
	if name == "" {
		return fmt.Errorf("cluster name must not be empty")
	}
	if !dns1123LabelRegexp.MatchString(name) {
		return fmt.Errorf("cluster name %q is not a valid DNS-1123 label (lowercase alphanumeric and hyphens, 1-63 chars, no leading/trailing hyphens)", name)
	}
	return nil
}

// CreateCluster creates a new local cluster with phased progress broadcasting
func (m *LocalClusterManager) CreateCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}

	// Phase 1: Validating prerequisites
	m.broadcastProgress(tool, name, "validating", "Checking prerequisites...", progressValidating)

	// Docker pre-flight check for tools that require it
	if tool == "kind" || tool == "k3d" {
		if err := m.checkDockerRunning(); err != nil {
			return err
		}
	}

	// Phase 2: Creating the cluster
	m.broadcastProgress(tool, name, "creating", fmt.Sprintf("Creating %s cluster '%s'...", tool, name), progressCreating)

	switch tool {
	case "kind":
		return m.createKindCluster(name)
	case "k3d":
		return m.createK3dCluster(name)
	case "minikube":
		return m.createMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) createKindCluster(name string) error {
	cmd := execCommand("kind", "create", "cluster", "--name", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kind create failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) createK3dCluster(name string) error {
	cmd := execCommand("k3d", "cluster", "create", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d create failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) createMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "start", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube start failed: %s", stderr.String())
	}
	return nil
}

// StartCluster starts a stopped local cluster with phased progress broadcasting
func (m *LocalClusterManager) StartCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to start cluster '%s'...", name), progressValidating)

	m.broadcastProgress(tool, name, "starting", fmt.Sprintf("Starting %s cluster '%s'...", tool, name), progressCreating)

	switch tool {
	case "kind":
		return m.startKindCluster(name)
	case "k3d":
		return m.startK3dCluster(name)
	case "minikube":
		return m.startMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) startKindCluster(name string) error {
	// kind clusters run as Docker containers — start all containers with the cluster label
	cmd := execCommand("docker", "start", name+"-control-plane")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to start kind cluster containers: %s", stderr.String())
	}
	// Also start any worker nodes
	for i := 1; i <= 10; i++ {
		workerName := fmt.Sprintf("%s-worker%s", name, func() string {
			if i == 1 {
				return ""
			}
			return fmt.Sprintf("%d", i)
		}())
		cmd := execCommand("docker", "start", workerName)
		if err := cmd.Run(); err != nil {
			break // No more workers
		}
	}
	return nil
}

func (m *LocalClusterManager) startK3dCluster(name string) error {
	cmd := execCommand("k3d", "cluster", "start", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d start failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) startMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "start", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube start failed: %s", stderr.String())
	}
	return nil
}

// StopCluster stops a running local cluster with phased progress broadcasting
func (m *LocalClusterManager) StopCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to stop cluster '%s'...", name), progressValidating)

	m.broadcastProgress(tool, name, "stopping", fmt.Sprintf("Stopping %s cluster '%s'...", tool, name), progressCreating)

	switch tool {
	case "kind":
		return m.stopKindCluster(name)
	case "k3d":
		return m.stopK3dCluster(name)
	case "minikube":
		return m.stopMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) stopKindCluster(name string) error {
	// kind clusters run as Docker containers — stop all containers with the cluster label
	cmd := execCommand("docker", "stop", name+"-control-plane")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to stop kind cluster containers: %s", stderr.String())
	}
	// Also stop any worker nodes
	for i := 1; i <= 10; i++ {
		workerName := fmt.Sprintf("%s-worker%s", name, func() string {
			if i == 1 {
				return ""
			}
			return fmt.Sprintf("%d", i)
		}())
		cmd := execCommand("docker", "stop", workerName)
		if err := cmd.Run(); err != nil {
			break // No more workers
		}
	}
	return nil
}

func (m *LocalClusterManager) stopK3dCluster(name string) error {
	cmd := execCommand("k3d", "cluster", "stop", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d stop failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) stopMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "stop", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube stop failed: %s", stderr.String())
	}
	return nil
}

// DeleteCluster deletes a local cluster with phased progress broadcasting
func (m *LocalClusterManager) DeleteCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	// Phase 1: Validating
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to delete cluster '%s'...", name), progressValidating)

	// Phase 2: Deleting
	m.broadcastProgress(tool, name, "deleting", fmt.Sprintf("Deleting %s cluster '%s'...", tool, name), progressDeleting)

	switch tool {
	case "kind":
		return m.deleteKindCluster(name)
	case "k3d":
		return m.deleteK3dCluster(name)
	case "minikube":
		return m.deleteMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) deleteKindCluster(name string) error {
	cmd := execCommand("kind", "delete", "cluster", "--name", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kind delete failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) deleteK3dCluster(name string) error {
	cmd := execCommand("k3d", "cluster", "delete", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d delete failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) deleteMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "delete", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube delete failed: %s", stderr.String())
	}
	return nil
}

// detectVCluster checks if the vcluster CLI is installed and returns tool info
func (m *LocalClusterManager) detectVCluster() *LocalClusterTool {
	path, err := lookPath("vcluster")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "vcluster",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := execCommand("vcluster", "version")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		// Parse version output — typically "vcluster version 0.19.0" or just "0.19.0"
		version := strings.TrimSpace(out.String())
		re := regexp.MustCompile(`v?([\d.]+)`)
		if matches := re.FindStringSubmatch(version); len(matches) > 1 {
			tool.Version = matches[1]
		}
	}

	return tool
}

// ListVClusters runs `vcluster list --output json` and returns parsed results
func (m *LocalClusterManager) ListVClusters() ([]VClusterInstance, error) {
	cmd := execCommand("vcluster", "list", "--output", "json")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterListTimeout); err != nil {
		return nil, fmt.Errorf("vcluster list failed: %s", strings.TrimSpace(stderr.String()))
	}

	var entries []vclusterListEntry
	if err := json.Unmarshal(stdout.Bytes(), &entries); err != nil {
		return nil, fmt.Errorf("failed to parse vcluster list output: %w", err)
	}

	instances := make([]VClusterInstance, 0, len(entries))
	for _, e := range entries {
		instances = append(instances, VClusterInstance{
			Name:      e.Name,
			Namespace: e.Namespace,
			Status:    e.Status,
			Connected: e.Connected,
			Context:   e.Context,
		})
	}

	return instances, nil
}

// CreateVCluster creates a new vCluster with progress broadcasting
func (m *LocalClusterManager) CreateVCluster(name, namespace string) error {
	// Phase 1: Validating
	m.broadcastProgress("vcluster", name, "validating", "Checking vcluster CLI...", progressValidating)

	if _, err := lookPath("vcluster"); err != nil {
		return fmt.Errorf("vcluster CLI is not installed")
	}

	// Phase 2: Creating
	m.broadcastProgress("vcluster", name, "creating",
		fmt.Sprintf("Creating vCluster '%s' in namespace '%s'...", name, namespace), progressCreating)

	cmd := execCommand("vcluster", "create", name, "-n", namespace)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterCreateTimeout); err != nil {
		return fmt.Errorf("vcluster create failed: %s", strings.TrimSpace(stderr.String()))
	}

	return nil
}

// ConnectVCluster connects to an existing vCluster by updating kubeconfig
func (m *LocalClusterManager) ConnectVCluster(name, namespace string) error {
	m.broadcastProgress("vcluster", name, "connecting",
		fmt.Sprintf("Connecting to vCluster '%s' in namespace '%s'...", name, namespace), progressConnecting)

	cmd := execCommand("vcluster", "connect", name, "-n", namespace, "--update-current=false")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterConnectTimeout); err != nil {
		return fmt.Errorf("vcluster connect failed: %s", strings.TrimSpace(stderr.String()))
	}

	return nil
}

// DisconnectVCluster disconnects from a vCluster
func (m *LocalClusterManager) DisconnectVCluster(name, namespace string) error {
	m.broadcastProgress("vcluster", name, "disconnecting",
		fmt.Sprintf("Disconnecting from vCluster '%s'...", name), progressConnecting)

	cmd := execCommand("vcluster", "disconnect")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterConnectTimeout); err != nil {
		return fmt.Errorf("vcluster disconnect failed: %s", strings.TrimSpace(stderr.String()))
	}

	return nil
}

// DeleteVCluster deletes a vCluster with progress broadcasting
func (m *LocalClusterManager) DeleteVCluster(name, namespace string) error {
	// Phase 1: Validating
	m.broadcastProgress("vcluster", name, "validating",
		fmt.Sprintf("Preparing to delete vCluster '%s'...", name), progressValidating)

	// Phase 2: Deleting
	m.broadcastProgress("vcluster", name, "deleting",
		fmt.Sprintf("Deleting vCluster '%s' from namespace '%s'...", name, namespace), progressDeleting)

	cmd := execCommand("vcluster", "delete", name, "-n", namespace)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterDeleteTimeout); err != nil {
		return fmt.Errorf("vcluster delete failed: %s", strings.TrimSpace(stderr.String()))
	}

	return nil
}

// runWithTimeout runs a pre-built *exec.Cmd with a timeout context.
// It kills the process if the timeout expires before the command finishes.
func runWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	if err := cmd.Start(); err != nil {
		return err
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		return fmt.Errorf("command timed out after %s", timeout)
	}
}

// VClusterClusterStatus represents vCluster status on a specific host cluster
type VClusterClusterStatus struct {
	Context    string `json:"context"`
	Name       string `json:"name"`
	HasCRD     bool   `json:"hasCRD"`
	Version    string `json:"version,omitempty"`
	Instances  int    `json:"instances"`
	VClusters  []VClusterInstance `json:"vclusters,omitempty"`
}

/** Timeout for CRD check operations */
const vclusterCRDCheckTimeout = 10 * time.Second

// CheckVClusterOnCluster checks if vCluster CRDs are installed on a specific cluster
// and lists any existing vCluster instances
func (m *LocalClusterManager) CheckVClusterOnCluster(context string) (*VClusterClusterStatus, error) {
	status := &VClusterClusterStatus{
		Context: context,
		Name:    context,
	}

	// Check for vCluster by looking for vcluster pods (works with v0.20+ which
	// doesn't use CRDs) and also check for legacy CRDs (vCluster Platform)
	cmd := execCommand("kubectl", "--context", context, "get", "statefulset", "-n", "vcluster", "-l", "app=vcluster", "-o", "jsonpath={.items[*].metadata.name}")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterCRDCheckTimeout); err == nil && strings.TrimSpace(stdout.String()) != "" {
		status.HasCRD = true // reusing field name — means "vCluster is installed"
	}

	// Also check for legacy CRD (vCluster Platform)
	if !status.HasCRD {
		cmd = execCommand("kubectl", "--context", context, "get", "crd", "virtualclusters.storage.loft.sh", "-o", "jsonpath={.metadata.name}")
		var crdOut bytes.Buffer
		cmd.Stdout = &crdOut
		if err := runWithTimeout(cmd, vclusterCRDCheckTimeout); err == nil && strings.TrimSpace(crdOut.String()) != "" {
			status.HasCRD = true
		}
	}

	if status.HasCRD {
		// Get version from vcluster pod image tag
		cmd = execCommand("kubectl", "--context", context, "get", "pods", "-n", "vcluster", "-l", "app=vcluster", "-o", "jsonpath={.items[0].spec.containers[0].image}")
		var verOut bytes.Buffer
		cmd.Stdout = &verOut
		if err := runWithTimeout(cmd, vclusterCRDCheckTimeout); err == nil {
			image := strings.TrimSpace(verOut.String())
			// Extract version from image tag (e.g., "ghcr.io/loft-sh/vcluster:0.23.0")
			re := regexp.MustCompile(`v?([\d]+\.[\d]+\.[\d]+)`)
			if matches := re.FindStringSubmatch(image); len(matches) > 1 {
				status.Version = matches[1]
			}
		}

		// List vCluster instances by finding StatefulSets with app=vcluster
		cmd = execCommand("kubectl", "--context", context, "get", "statefulset", "-A", "-l", "app=vcluster", "-o", "jsonpath={range .items[*]}{.metadata.name},{.metadata.namespace},{.status.readyReplicas}/{.status.replicas}{\"\\n\"}{end}")
		var listOut bytes.Buffer
		cmd.Stdout = &listOut
		if err := runWithTimeout(cmd, vclusterCRDCheckTimeout); err == nil {
			lines := strings.Split(strings.TrimSpace(listOut.String()), "\n")
			for _, line := range lines {
				parts := strings.SplitN(line, ",", 3)
				if len(parts) >= 2 && parts[0] != "" {
					inst := VClusterInstance{
						Name:      parts[0],
						Namespace: parts[1],
						Status:    "Running",
					}
					if len(parts) >= 3 && parts[2] != "" {
						inst.Status = parts[2]
					}
					status.VClusters = append(status.VClusters, inst)
				}
			}
			status.Instances = len(status.VClusters)
		}
	}

	return status, nil
}

// CheckVClusterOnAllClusters checks vCluster status across all kubeconfig contexts
func (m *LocalClusterManager) CheckVClusterOnAllClusters() ([]VClusterClusterStatus, error) {
	cmd := execCommand("kubectl", "config", "get-contexts", "-o", "name")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to list contexts: %w", err)
	}

	contexts := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	var results []VClusterClusterStatus

	for _, ctx := range contexts {
		if ctx == "" {
			continue
		}
		status, err := m.CheckVClusterOnCluster(ctx)
		if err != nil {
			continue
		}
		if status.HasCRD {
			results = append(results, *status)
		}
	}

	return results, nil
}

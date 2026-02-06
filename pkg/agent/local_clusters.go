package agent

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
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

// LocalClusterManager handles local cluster operations
type LocalClusterManager struct{}

// NewLocalClusterManager creates a new manager
func NewLocalClusterManager() *LocalClusterManager {
	return &LocalClusterManager{}
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

	return tools
}

func (m *LocalClusterManager) detectKind() *LocalClusterTool {
	path, err := exec.LookPath("kind")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "kind",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := exec.Command("kind", "version")
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
	path, err := exec.LookPath("k3d")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "k3d",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := exec.Command("k3d", "version")
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
	path, err := exec.LookPath("minikube")
	if err != nil {
		return nil
	}

	tool := &LocalClusterTool{
		Name:      "minikube",
		Installed: true,
		Path:      path,
	}

	// Get version
	cmd := exec.Command("minikube", "version", "--short")
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

	cmd := exec.Command("kind", "get", "clusters")
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

	cmd := exec.Command("k3d", "cluster", "list", "--no-headers")
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

	cmd := exec.Command("minikube", "profile", "list", "-o", "json")
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

// CreateCluster creates a new local cluster
func (m *LocalClusterManager) CreateCluster(tool, name string) error {
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
	cmd := exec.Command("kind", "create", "cluster", "--name", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kind create failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) createK3dCluster(name string) error {
	cmd := exec.Command("k3d", "cluster", "create", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d create failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) createMinikubeCluster(name string) error {
	cmd := exec.Command("minikube", "start", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube start failed: %s", stderr.String())
	}
	return nil
}

// DeleteCluster deletes a local cluster
func (m *LocalClusterManager) DeleteCluster(tool, name string) error {
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
	cmd := exec.Command("kind", "delete", "cluster", "--name", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kind delete failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) deleteK3dCluster(name string) error {
	cmd := exec.Command("k3d", "cluster", "delete", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("k3d delete failed: %s", stderr.String())
	}
	return nil
}

func (m *LocalClusterManager) deleteMinikubeCluster(name string) error {
	cmd := exec.Command("minikube", "delete", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube delete failed: %s", stderr.String())
	}
	return nil
}

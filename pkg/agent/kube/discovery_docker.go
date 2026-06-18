package kube

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
)

var k3dVersionRegexp = regexp.MustCompile(`v([\d.]+)`)

func (m *LocalClusterManager) detectKind() *LocalClusterTool {
	path, err := findExecutablePath("kind")
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
	path, err := findExecutablePath("k3d")
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
			if matches := k3dVersionRegexp.FindStringSubmatch(lines[0]); len(matches) > 1 {
				tool.Version = matches[1]
			}
		}
	}

	return tool
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

func (m *LocalClusterManager) startKindCluster(name string) error {
	containers, err := listKindContainers(name)
	if err != nil {
		return fmt.Errorf("failed to list kind cluster containers: %w", err)
	}
	if len(containers) == 0 {
		return fmt.Errorf("no containers found for kind cluster %q", name)
	}
	for _, c := range containers {
		cmd := execCommand("docker", "start", c)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to start container %q: %s", c, stderr.String())
		}
	}
	return nil
}

// listKindContainers returns all Docker container names that belong to the
// given kind cluster, by querying the kind cluster label. This avoids the
// previous fixed-loop limit of 10 worker nodes.
func listKindContainers(name string) ([]string, error) {
	labelFilter := fmt.Sprintf("label=io.x-k8s.kind.cluster=%s", name)
	cmd := execCommand("docker", "ps", "-a", "--filter", labelFilter, "--format", "{{.Names}}")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("docker ps failed: %s", stderr.String())
	}
	var names []string
	for _, line := range strings.Split(strings.TrimSpace(stdout.String()), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			names = append(names, line)
		}
	}
	return names, nil
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

func (m *LocalClusterManager) stopKindCluster(name string) error {
	containers, err := listKindContainers(name)
	if err != nil {
		return fmt.Errorf("failed to list kind cluster containers: %w", err)
	}
	if len(containers) == 0 {
		return fmt.Errorf("no containers found for kind cluster %q", name)
	}
	for _, c := range containers {
		cmd := execCommand("docker", "stop", c)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to stop container %q: %s", c, stderr.String())
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

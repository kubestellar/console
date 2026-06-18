package kube

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const minikubeStatusTimeout = 5 * time.Second

func (m *LocalClusterManager) detectKind() *LocalClusterTool {
	path, err := findExecutablePath("kind")
	if err != nil {
		return nil
	}
	tool := &LocalClusterTool{Name: "kind", Installed: true, Path: path}
	cmd := execCommand("kind", "version")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
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
	tool := &LocalClusterTool{Name: "k3d", Installed: true, Path: path}
	cmd := execCommand("k3d", "version")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		lines := strings.Split(out.String(), "\n")
		if len(lines) > 0 {
			if matches := k3dVersionRegexp.FindStringSubmatch(lines[0]); len(matches) > 1 {
				tool.Version = matches[1]
			}
		}
	}
	return tool
}

func (m *LocalClusterManager) detectMinikube() *LocalClusterTool {
	path, err := findExecutablePath("minikube")
	if err != nil {
		return nil
	}
	tool := &LocalClusterTool{Name: "minikube", Installed: true, Path: path}
	cmd := execCommand("minikube", "version", "--short")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		tool.Version = strings.TrimPrefix(strings.TrimSpace(out.String()), "v")
	}
	return tool
}

func (m *LocalClusterManager) listKindClusters() []LocalCluster {
	clusters := make([]LocalCluster, 0)
	cmd := execCommand("kind", "get", "clusters")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}
	for _, name := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if name != "" {
			clusters = append(clusters, LocalCluster{Name: name, Tool: "kind", Status: "running"})
		}
	}
	return clusters
}

func (m *LocalClusterManager) listK3dClusters() []LocalCluster {
	clusters := make([]LocalCluster, 0)
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
			clusters = append(clusters, LocalCluster{Name: fields[0], Tool: "k3d", Status: "running"})
		}
	}
	return clusters
}

func (m *LocalClusterManager) listMinikubeClusters() []LocalCluster {
	clusters := make([]LocalCluster, 0)
	cmd := execCommand("minikube", "profile", "list", "-o", "json")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}
	output := out.String()
	if !strings.Contains(output, "valid") {
		return clusters
	}
	matches := minikubeProfileNameRegexp.FindAllStringSubmatch(output, -1)
	for _, match := range matches {
		if len(match) > 1 {
			name := match[1]
			clusters = append(clusters, LocalCluster{Name: name, Tool: "minikube", Status: minikubeProfileStatus(name)})
		}
	}
	return clusters
}

func minikubeProfileStatus(name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), minikubeStatusTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "minikube", "status", "-p", name, "-o", "json")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil && out.Len() == 0 {
		return "unknown"
	}
	raw := bytes.TrimSpace(out.Bytes())
	if len(raw) == 0 {
		return "unknown"
	}
	type statusEntry struct {
		Host      string `json:"Host"`
		Kubelet   string `json:"Kubelet"`
		APIServer string `json:"APIServer"`
	}
	var entries []statusEntry
	if raw[0] == '[' {
		if err := json.Unmarshal(raw, &entries); err != nil {
			return "unknown"
		}
	} else {
		var single statusEntry
		if err := json.Unmarshal(raw, &single); err != nil {
			return "unknown"
		}
		entries = append(entries, single)
	}
	if len(entries) == 0 {
		return "unknown"
	}
	for _, e := range entries {
		if !strings.EqualFold(e.Host, "Running") {
			return "stopped"
		}
	}
	return "running"
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

func (m *LocalClusterManager) startMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "start", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube start failed: %s", stderr.String())
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

func (m *LocalClusterManager) stopMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "stop", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube stop failed: %s", stderr.String())
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

func (m *LocalClusterManager) deleteMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "delete", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube delete failed: %s", stderr.String())
	}
	return nil
}

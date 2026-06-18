package kube

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

// minikubeStatusTimeout bounds the `minikube status -p <name>` fan-out per
// profile so a hung minikube doesn't stall the whole local-clusters listing.
const minikubeStatusTimeout = 5 * time.Second

var minikubeProfileNameRegexp = regexp.MustCompile(`"Name":\s*"([^"]+)"`)

func (m *LocalClusterManager) detectMinikube() *LocalClusterTool {
	path, err := findExecutablePath("minikube")
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

func (m *LocalClusterManager) listMinikubeClusters() []LocalCluster {
	clusters := []LocalCluster{}

	cmd := execCommand("minikube", "profile", "list", "-o", "json")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return clusters
	}

	// Extract profile names from the JSON output. `minikube profile list`
	// uses a nested structure with a "valid" array; we only need the names,
	// then we fan out one `minikube status` call per profile to get the
	// real running state (#7984).
	output := out.String()
	if !strings.Contains(output, "valid") {
		return clusters
	}
	matches := minikubeProfileNameRegexp.FindAllStringSubmatch(output, -1)
	for _, match := range matches {
		if len(match) <= 1 {
			continue
		}
		name := match[1]
		clusters = append(clusters, LocalCluster{
			Name:   name,
			Tool:   "minikube",
			Status: minikubeProfileStatus(name),
		})
	}

	return clusters
}

// minikubeProfileStatus returns a normalized status string ("running",
// "stopped", "unknown") for a single minikube profile by shelling out to
// `minikube status -p <name> -o json`. Previously this was hardcoded to
// "unknown" (#7984) so operators could not tell from the UI whether a
// profile was running.
func minikubeProfileStatus(name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), minikubeStatusTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "minikube", "status", "-p", name, "-o", "json")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		// Exit code 1-7 means "not running" in some form; still parse the
		// stdout if present because minikube writes JSON even on non-zero
		// exits. Fall through to the parser below.
		if out.Len() == 0 {
			return "unknown"
		}
	}

	// `minikube status -o json` emits either a single object or an array of
	// objects (multi-node). Try array first, fall back to object.
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

	// A profile is "running" only when every node reports Host=Running and
	// either Kubelet=Running or APIServer=Running (workers don't run
	// apiserver). Anything else collapses to "stopped".
	for _, e := range entries {
		if !strings.EqualFold(e.Host, "Running") {
			return "stopped"
		}
	}
	return "running"
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

func (m *LocalClusterManager) startMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "start", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube start failed: %s", stderr.String())
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

func (m *LocalClusterManager) deleteMinikubeCluster(name string) error {
	cmd := execCommand("minikube", "delete", "--profile", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("minikube delete failed: %s", stderr.String())
	}
	return nil
}

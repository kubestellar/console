package kube

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

// detectVCluster checks if the vcluster CLI is installed and returns tool info.
func (m *LocalClusterManager) detectVCluster() *LocalClusterTool {
	path, err := findExecutablePath("vcluster")
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
		if matches := vclusterVersionRegexp.FindStringSubmatch(version); len(matches) > 1 {
			tool.Version = matches[1]
		}
	}

	return tool
}

// ListVClusters runs `vcluster list --output json` and returns parsed results.
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

// CreateVCluster creates a new vCluster and connects it so it is immediately usable.
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

	if err := m.ConnectVCluster(name, namespace); err != nil {
		return fmt.Errorf("vcluster created but connection failed: %w", err)
	}

	return nil
}

// ConnectVCluster connects to an existing vCluster by updating kubeconfig.
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

// DisconnectVCluster disconnects from a vCluster by removing its kubeconfig
// context entry. The plain `vcluster disconnect` command operates on the
// current-context (last connected) regardless of arguments, so a user asking
// to disconnect vCluster B could end up disconnecting A if A was the current
// context (#7921).
//
// To disconnect a specific instance we look it up in `vcluster list --output
// json` (which populates VClusterInstance.Context for connected entries),
// then run `kubectl config delete-context <context>` on that exact entry.
// This matches the ConnectVCluster path, which adds a context entry via
// `vcluster connect --update-current=false` without changing current-context.
func (m *LocalClusterManager) DisconnectVCluster(name, namespace string) error {
	m.broadcastProgress("vcluster", name, "disconnecting",
		fmt.Sprintf("Disconnecting from vCluster '%s'...", name), progressConnecting)

	instances, err := m.ListVClusters()
	if err != nil {
		return fmt.Errorf("vcluster disconnect failed: could not list vclusters to find target context: %w", err)
	}

	var targetContext string
	for _, inst := range instances {
		if inst.Name == name && inst.Namespace == namespace {
			targetContext = inst.Context
			break
		}
	}
	if targetContext == "" {
		return fmt.Errorf("vcluster disconnect failed: vcluster %q in namespace %q has no kubeconfig context (already disconnected?)", name, namespace)
	}

	// If the target context is currently active, unset current-context before
	// deleting. Otherwise kubectl is left pointing at a stale reference and
	// subsequent commands fail with `current-context is "<deleted>", but does
	// not exist`. This happens when a user manually ran `kubectl config
	// use-context <vcluster-ctx>` between connect and disconnect. (#8076)
	currentCmd := execCommand("kubectl", "config", "current-context")
	currentOut, currentErr := currentCmd.Output()
	if currentErr == nil && strings.TrimSpace(string(currentOut)) == targetContext {
		unsetCmd := execCommand("kubectl", "config", "unset", "current-context")
		// Best-effort: a failure here shouldn't block the delete, the user
		// can always re-pick a context manually.
		_ = unsetCmd.Run()
	}

	cmd := execCommand("kubectl", "config", "delete-context", targetContext)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, vclusterConnectTimeout); err != nil {
		return fmt.Errorf("vcluster disconnect failed: %s", strings.TrimSpace(stderr.String()))
	}

	return nil
}

// DeleteVCluster deletes a vCluster with progress broadcasting.
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
	safego.GoWith("run-with-timeout", func() {
		done <- cmd.Wait()
	})

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		if cmd.Process != nil {
			if killErr := cmd.Process.Kill(); killErr != nil {
				slog.Warn("[runWithTimeout] failed to kill timed-out process, possible zombie", "error", killErr)
			}
		}
		return fmt.Errorf("command timed out after %s", timeout)
	}
}

// VClusterClusterStatus represents vCluster status on a specific host cluster.
type VClusterClusterStatus struct {
	Context   string             `json:"context"`
	Name      string             `json:"name"`
	HasCRD    bool               `json:"hasCRD"`
	Version   string             `json:"version,omitempty"`
	Instances int                `json:"instances"`
	VClusters []VClusterInstance `json:"vclusters,omitempty"`
}

// Timeout for CRD check operations.
const vclusterCRDCheckTimeout = 10 * time.Second

// CheckVClusterOnCluster checks if vCluster CRDs are installed on a specific cluster
// and lists any existing vCluster instances.
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
			if matches := semverRegexp.FindStringSubmatch(image); len(matches) > 1 {
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

// CheckVClusterOnAllClusters checks vCluster status across all kubeconfig contexts.
func (m *LocalClusterManager) CheckVClusterOnAllClusters() ([]VClusterClusterStatus, error) {
	cmd := execCommand("kubectl", "config", "get-contexts", "-o", "name")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to list contexts: %w", err)
	}

	contexts := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	results := make([]VClusterClusterStatus, 0)

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

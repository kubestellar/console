package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// GitOpsHandlers handles GitOps-related API endpoints
type GitOpsHandlers struct {
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// NewGitOpsHandlers creates a new GitOps handlers instance
func NewGitOpsHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) *GitOpsHandlers {
	return &GitOpsHandlers{
		bridge:    bridge,
		k8sClient: k8sClient,
	}
}

// DriftedResource represents a resource that has drifted from git
type DriftedResource struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Field        string `json:"field"`
	GitValue     string `json:"gitValue"`
	ClusterValue string `json:"clusterValue"`
	DiffOutput   string `json:"diffOutput,omitempty"`
}

// DetectDriftRequest is the request body for drift detection
type DetectDriftRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// DetectDriftResponse is the response from drift detection
type DetectDriftResponse struct {
	Drifted   bool              `json:"drifted"`
	Resources []DriftedResource `json:"resources"`
	Source    string            `json:"source"` // "mcp" or "kubectl"
	RawDiff   string            `json:"rawDiff,omitempty"`
	TokensUsed int              `json:"tokensUsed,omitempty"`
}

// SyncRequest is the request body for sync operation
type SyncRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	DryRun    bool   `json:"dryRun,omitempty"`
}

// SyncResponse is the response from sync operation
type SyncResponse struct {
	Success    bool     `json:"success"`
	Message    string   `json:"message"`
	Applied    []string `json:"applied,omitempty"`
	Errors     []string `json:"errors,omitempty"`
	Source     string   `json:"source"` // "mcp" or "kubectl"
	TokensUsed int      `json:"tokensUsed,omitempty"`
}

// DetectDrift detects drift between git and cluster state
func (h *GitOpsHandlers) DetectDrift(c *fiber.Ctx) error {
	var req DetectDriftRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.RepoURL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repoUrl is required"})
	}

	// Try MCP bridge first (detect_drift tool from klaude-ops)
	if h.bridge != nil {
		result, err := h.detectDriftViaMCP(c.Context(), req)
		if err == nil {
			return c.JSON(result)
		}
		log.Printf("MCP detect_drift failed, falling back to kubectl: %v", err)
	}

	// Fall back to kubectl diff
	result, err := h.detectDriftViaKubectl(c.Context(), req)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// detectDriftViaMCP uses the klaude-ops detect_drift tool
func (h *GitOpsHandlers) detectDriftViaMCP(ctx context.Context, req DetectDriftRequest) (*DetectDriftResponse, error) {
	args := map[string]interface{}{
		"repo_url": req.RepoURL,
		"path":     req.Path,
	}
	if req.Branch != "" {
		args["branch"] = req.Branch
	}
	if req.Cluster != "" {
		args["cluster"] = req.Cluster
	}
	if req.Namespace != "" {
		args["namespace"] = req.Namespace
	}

	result, err := h.bridge.CallOpsTool(ctx, "detect_drift", args)
	if err != nil {
		return nil, err
	}

	if result.IsError {
		if len(result.Content) > 0 {
			return nil, fmt.Errorf("MCP tool error: %s", result.Content[0].Text)
		}
		return nil, fmt.Errorf("MCP tool returned error")
	}

	// Parse MCP result - content is text that may contain JSON
	response := &DetectDriftResponse{
		Source:     "mcp",
		TokensUsed: 350, // Estimate
	}

	// Try to parse the first content item as JSON
	if len(result.Content) > 0 {
		text := result.Content[0].Text
		response.RawDiff = text

		// Try to parse as JSON for structured data
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(text), &parsed); err == nil {
			if drifted, ok := parsed["drifted"].(bool); ok {
				response.Drifted = drifted
			}
			if resources, ok := parsed["resources"].([]interface{}); ok {
				for _, r := range resources {
					if rm, ok := r.(map[string]interface{}); ok {
						dr := DriftedResource{
							Kind:         getString(rm, "kind"),
							Name:         getString(rm, "name"),
							Namespace:    getString(rm, "namespace"),
							Field:        getString(rm, "field"),
							GitValue:     getString(rm, "gitValue"),
							ClusterValue: getString(rm, "clusterValue"),
						}
						response.Resources = append(response.Resources, dr)
					}
				}
			}
		} else {
			// If not JSON, treat the text output as drift info
			response.Drifted = strings.Contains(text, "drift") || strings.Contains(text, "changed")
		}
	}

	return response, nil
}

// detectDriftViaKubectl uses kubectl diff to detect drift
func (h *GitOpsHandlers) detectDriftViaKubectl(ctx context.Context, req DetectDriftRequest) (*DetectDriftResponse, error) {
	// Clone the repo to a temp directory
	tempDir, err := cloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		return nil, fmt.Errorf("failed to clone repo: %w", err)
	}
	defer cleanupTempDir(tempDir)

	// Build the manifest path
	manifestPath := tempDir
	if req.Path != "" {
		manifestPath = fmt.Sprintf("%s/%s", tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	// Build kubectl diff command
	args := []string{"diff", "-f", manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// kubectl diff returns exit code 1 if there are differences
	err = cmd.Run()
	diffOutput := stdout.String()

	response := &DetectDriftResponse{
		Source:     "kubectl",
		RawDiff:    diffOutput,
		TokensUsed: 0, // No AI tokens used for kubectl
	}

	// Exit code 0 = no diff, 1 = diff exists, other = error
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				// Diff exists - parse it
				response.Drifted = true
				response.Resources = parseDiffOutput(diffOutput, req.Namespace)
			} else {
				return nil, fmt.Errorf("kubectl diff failed: %s", stderr.String())
			}
		} else {
			return nil, fmt.Errorf("kubectl diff failed: %w", err)
		}
	}

	return response, nil
}

// Sync applies manifests from git to the cluster
func (h *GitOpsHandlers) Sync(c *fiber.Ctx) error {
	var req SyncRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.RepoURL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repoUrl is required"})
	}

	// Try MCP bridge first
	if h.bridge != nil {
		result, err := h.syncViaMCP(c.Context(), req)
		if err == nil {
			return c.JSON(result)
		}
		log.Printf("MCP sync failed, falling back to kubectl: %v", err)
	}

	// Fall back to kubectl apply
	result, err := h.syncViaKubectl(c.Context(), req)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// syncViaMCP uses klaude-deploy for sync
func (h *GitOpsHandlers) syncViaMCP(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	args := map[string]interface{}{
		"repo_url": req.RepoURL,
		"path":     req.Path,
	}
	if req.Branch != "" {
		args["branch"] = req.Branch
	}
	if req.Cluster != "" {
		args["cluster"] = req.Cluster
	}
	if req.Namespace != "" {
		args["namespace"] = req.Namespace
	}
	if req.DryRun {
		args["dry_run"] = true
	}

	result, err := h.bridge.CallDeployTool(ctx, "apply_manifests", args)
	if err != nil {
		return nil, err
	}

	response := &SyncResponse{
		Source:     "mcp",
		TokensUsed: 200,
	}

	if result.IsError {
		response.Success = false
		if len(result.Content) > 0 {
			response.Message = result.Content[0].Text
			response.Errors = []string{result.Content[0].Text}
		}
		return response, nil
	}

	// Parse content
	if len(result.Content) > 0 {
		text := result.Content[0].Text
		response.Message = text
		response.Success = true

		// Try to parse as JSON
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(text), &parsed); err == nil {
			if success, ok := parsed["success"].(bool); ok {
				response.Success = success
			}
			if message, ok := parsed["message"].(string); ok {
				response.Message = message
			}
		}
	}

	return response, nil
}

// syncViaKubectl uses kubectl apply
func (h *GitOpsHandlers) syncViaKubectl(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	// Clone the repo
	tempDir, err := cloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		return nil, fmt.Errorf("failed to clone repo: %w", err)
	}
	defer cleanupTempDir(tempDir)

	// Build manifest path
	manifestPath := tempDir
	if req.Path != "" {
		manifestPath = fmt.Sprintf("%s/%s", tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	// Build kubectl apply command
	args := []string{"apply", "-f", manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}
	if req.DryRun {
		args = append(args, "--dry-run=client")
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err != nil {
		return &SyncResponse{
			Success: false,
			Message: stderr.String(),
			Source:  "kubectl",
			Errors:  []string{stderr.String()},
		}, nil
	}

	// Parse applied resources from output
	applied := parseApplyOutput(stdout.String())

	return &SyncResponse{
		Success:    true,
		Message:    "Successfully applied manifests",
		Applied:    applied,
		Source:     "kubectl",
		TokensUsed: 0,
	}, nil
}

// Helper functions

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func cloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	tempDir := fmt.Sprintf("/tmp/gitops-%d", time.Now().UnixNano())

	args := []string{"clone", "--depth", "1"}
	if branch != "" {
		args = append(args, "-b", branch)
	}
	args = append(args, repoURL, tempDir)

	cmd := exec.CommandContext(ctx, "git", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git clone failed: %s", stderr.String())
	}

	return tempDir, nil
}

func cleanupTempDir(dir string) {
	exec.Command("rm", "-rf", dir).Run()
}

func parseDiffOutput(output, namespace string) []DriftedResource {
	var resources []DriftedResource
	resourceMap := make(map[string]*DriftedResource) // key: kind/name

	lines := strings.Split(output, "\n")
	var currentKind, currentName string
	var lastChange string

	for _, line := range lines {
		// Strip diff prefix (+/-) for parsing YAML content
		cleanLine := line
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			cleanLine = strings.TrimPrefix(line, "+")
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			cleanLine = strings.TrimPrefix(line, "-")
		}
		cleanLine = strings.TrimSpace(cleanLine)

		// Parse kind from YAML
		if strings.HasPrefix(cleanLine, "kind:") {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentKind = strings.TrimSpace(parts[1])
			}
		}

		// Parse name from YAML metadata
		if strings.HasPrefix(cleanLine, "name:") && currentKind != "" {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentName = strings.TrimSpace(parts[1])
				// Create or get resource entry
				key := currentKind + "/" + currentName
				if _, exists := resourceMap[key]; !exists {
					resourceMap[key] = &DriftedResource{
						Kind:      currentKind,
						Name:      currentName,
						Namespace: namespace,
					}
				}
			}
		}

		// Capture meaningful changes
		if currentKind != "" && currentName != "" {
			key := currentKind + "/" + currentName
			if r, exists := resourceMap[key]; exists {
				if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
					lastChange = strings.TrimSpace(strings.TrimPrefix(line, "-"))
					if r.ClusterValue == "" && lastChange != "" {
						r.ClusterValue = truncateValue(lastChange)
					}
				}
				if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
					change := strings.TrimSpace(strings.TrimPrefix(line, "+"))
					if r.GitValue == "" && change != "" {
						r.GitValue = truncateValue(change)
					}
				}
			}
		}

		// Reset on new diff file
		if strings.HasPrefix(line, "diff ") {
			currentKind = ""
			currentName = ""
		}
	}

	// Convert map to slice
	for _, r := range resourceMap {
		if r.Name != "" {
			resources = append(resources, *r)
		}
	}

	return resources
}

func truncateValue(s string) string {
	if len(s) > 60 {
		return s[:57] + "..."
	}
	return s
}

func parseApplyOutput(output string) []string {
	var applied []string
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && (strings.Contains(line, "created") ||
			strings.Contains(line, "configured") ||
			strings.Contains(line, "unchanged")) {
			applied = append(applied, line)
		}
	}
	return applied
}

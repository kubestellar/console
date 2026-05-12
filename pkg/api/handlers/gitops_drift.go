package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"
)

func extractYAMLParseError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	lower := strings.ToLower(msg)
	yamlMarkers := []string{
		"error parsing",
		"yaml: line",
		"yaml: unmarshal",
		"error converting yaml",
		"error validating data",
		"mapping values are not allowed",
		"did not find expected",
		"could not find expected",
		"found character that cannot start any token",
	}
	for _, m := range yamlMarkers {
		if strings.Contains(lower, m) {
			return msg
		}
	}
	return ""
}

// detectDriftViaMCP uses the kubestellar-ops detect_drift tool
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
	// SECURITY: Validate K8s name params before passing to kubectl CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", field, err)
		}
	}

	// Validate path parameter to prevent path traversal attacks
	if err := validatePath(req.Path); err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

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

	// Check if this is a kustomize directory - use -k instead of -f
	fileFlag := "-f"
	if isKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// Build kubectl diff command
	args := []string{"diff", fileFlag, manifestPath}
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

// Sync was removed in #7993 Phase 4 — this user-initiated operation now runs
// through kc-agent at POST /gitops/sync under the user's kubeconfig. See
// pkg/agent/server_gitops.go#handleGitopsSync.

// syncViaMCP uses kubestellar-deploy for sync
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

		// Detect kubectl errors in plain-text MCP responses.
		// MCP servers often return kubectl failures as text without
		// setting IsError, so we scan for known error patterns.
		if errs := detectKubectlErrors(text); len(errs) > 0 {
			response.Success = false
			response.Errors = errs
		} else if !response.Success {
			// Keep Success=false if JSON parsing already set it
		} else {
			response.Success = true
		}
	}

	return response, nil
}

// syncViaKubectl uses kubectl apply
func (h *GitOpsHandlers) syncViaKubectl(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	// SECURITY: Validate K8s name params before passing to kubectl CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", field, err)
		}
	}

	// Validate path parameter to prevent path traversal attacks
	if err := validatePath(req.Path); err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

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

	// Check if this is a kustomize directory - use -k instead of -f
	fileFlag := "-f"
	if isKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// Build kubectl apply command
	args := []string{"apply", fileFlag, manifestPath}
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

// kubectlErrorPatterns are substrings (lowercase) that indicate kubectl failures.
// MCP servers often return these as plain text without setting the isError flag.
var kubectlErrorPatterns = []string{
	"error:",
	"error from server",
	"forbidden",
	"no matches for kind",
	"unable to",
	"cannot",
	"not found",
	"connection refused",
	"timeout",
	"unauthorized",
	"invalid",
	"failed to",
	"is not valid",
	"already exists",
	"admission webhook",
	"denied the request",
}

// detectKubectlErrors scans text for known kubectl/K8s error patterns
// and returns the matching error lines. Returns nil when no errors are found.
func detectKubectlErrors(text string) []string {
	errs := make([]string, 0)
	for _, line := range strings.Split(text, "\n") {
		lineLower := strings.ToLower(line)
		for _, pattern := range kubectlErrorPatterns {
			if strings.Contains(lineLower, pattern) {
				errs = append(errs, strings.TrimSpace(line))
				break
			}
		}
	}
	return errs
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// gitOpsTempDirPrefix is the required prefix for all GitOps temp directories
const gitOpsTempDirPrefix = "/tmp/gitops-"

// maxK8sNameLen is the maximum allowed length for Kubernetes resource names (RFC 1123)
const maxK8sNameLen = 253

// maxHelmChartLen is the maximum allowed length for a Helm chart reference
const maxHelmChartLen = 512

// validateK8sName validates a Kubernetes-style name (cluster, namespace, release, pod).
// SECURITY: Prevents flag injection and shell metacharacters in CLI args.
func validateK8sName(name, field string) error {
	if name == "" {
		return nil // Empty is OK — callers handle required-field checks separately
	}
	if len(name) > maxK8sNameLen {
		return fmt.Errorf("%s exceeds maximum length of %d", field, maxK8sNameLen)
	}
	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("%s must not start with '-'", field)
	}
	for _, ch := range name {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.') {
			return fmt.Errorf("%s contains invalid character: %c", field, ch)
		}
	}
	return nil
}

// validateHelmChart validates a Helm chart reference (e.g. "bitnami/nginx", "oci://...").
// SECURITY: Prevents flag injection via chart parameter.
func validateHelmChart(chart string) error {
	if chart == "" {
		return fmt.Errorf("chart is required")
	}
	if len(chart) > maxHelmChartLen {
		return fmt.Errorf("chart reference exceeds maximum length of %d", maxHelmChartLen)
	}
	if strings.HasPrefix(chart, "-") {
		return fmt.Errorf("chart must not start with '-'")
	}
	// Allow alphanumeric, -, _, ., /, : (for oci:// and repo/chart)
	for _, ch := range chart {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '/' || ch == ':') {
			return fmt.Errorf("chart contains invalid character: %c", ch)
		}
	}
	return nil
}

// validateHelmVersion validates a Helm chart version string.
func validateHelmVersion(version string) error {
	if version == "" {
		return nil
	}
	if strings.HasPrefix(version, "-") {
		return fmt.Errorf("version must not start with '-'")
	}
	for _, ch := range version {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '+') {
			return fmt.Errorf("version contains invalid character: %c", ch)
		}
	}
	return nil
}

// validateRepoURL validates that a repository URL is safe to clone
// SECURITY: Prevents command injection and malformed URLs
func validateRepoURL(repoURL string) error {
	if repoURL == "" {
		return fmt.Errorf("repository URL is required")
	}

	// Only allow https:// and git@ (SSH) URLs
	if !strings.HasPrefix(repoURL, "https://") && !strings.HasPrefix(repoURL, "git@") {
		return fmt.Errorf("only HTTPS and SSH git URLs are allowed")
	}

	// Block URLs with shell metacharacters
	dangerousChars := []string{";", "|", "&", "$", "`", "(", ")", "{", "}", "<", ">", "\\", "'", "\"", "\n", "\r"}
	for _, char := range dangerousChars {
		if strings.Contains(repoURL, char) {
			return fmt.Errorf("invalid characters in repository URL")
		}
	}

	// Block file:// URLs which could be used for local file access
	if strings.Contains(strings.ToLower(repoURL), "file://") {
		return fmt.Errorf("file:// URLs are not allowed")
	}

	return nil
}

// validateBranchName validates that a branch name is safe
func validateBranchName(branch string) error {
	if branch == "" {
		return nil // Empty branch is OK - git will use default
	}

	// Only allow alphanumeric, -, _, /, .
	for _, char := range branch {
		if !((char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '/' || char == '.') {
			return fmt.Errorf("invalid character in branch name: %c", char)
		}
	}

	// Block dangerous patterns
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("branch name cannot start with '-'")
	}
	if strings.Contains(branch, "..") {
		return fmt.Errorf("branch name cannot contain '..'")
	}

	return nil
}

// validatePath validates a repository path parameter.
// SECURITY: Prevents path traversal attacks and flag injection.
func validatePath(path string) error {
	if path == "" {
		return nil // Empty path is OK - refers to repo root
	}
	// Block null bytes
	if strings.ContainsRune(path, 0) {
		return fmt.Errorf("path contains null bytes")
	}
	// Only allow alphanumeric, -, _, /, . (common in git repo paths)
	for _, char := range path {
		if !((char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '/' || char == '.') {
			return fmt.Errorf("invalid character in path: %c", char)
		}
	}
	// Block dangerous patterns
	if strings.HasPrefix(path, "-") {
		return fmt.Errorf("path cannot start with '-'")
	}
	if strings.Contains(path, "..") {
		return fmt.Errorf("path traversal (..) is not allowed")
	}
	return nil
}

func cloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	// SECURITY: Validate inputs before executing
	if err := validateRepoURL(repoURL); err != nil {
		return "", fmt.Errorf("invalid repository URL: %w", err)
	}
	if err := validateBranchName(branch); err != nil {
		return "", fmt.Errorf("invalid branch name: %w", err)
	}

	tempDir := fmt.Sprintf("%s%d", gitOpsTempDirPrefix, time.Now().UnixNano())

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

// isKustomizeDir checks if a directory contains kustomization.yaml or kustomization.yml
func isKustomizeDir(path string) bool {
	const kustomizeCheckTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), kustomizeCheckTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "test", "-f", path+"/kustomization.yaml")
	if cmd.Run() == nil {
		return true
	}
	cmd = exec.CommandContext(ctx, "test", "-f", path+"/kustomization.yml")
	return cmd.Run() == nil
}

// cleanupTempDir safely removes a temporary directory
// SECURITY: Validates the path is within expected temp directory to prevent path traversal
func cleanupTempDir(dir string) {
	// Only remove directories that match our expected pattern
	if !strings.HasPrefix(dir, gitOpsTempDirPrefix) {
		slog.Warn("[GitOps] SECURITY: refused to delete directory outside gitops temp prefix", "dir", dir)
		return
	}

	// Additional validation: ensure no path traversal
	if strings.Contains(dir, "..") {
		slog.Warn("[GitOps] SECURITY: refused to delete directory with path traversal", "dir", dir)
		return
	}

	// Use os.RemoveAll instead of shell command for safety
	if err := os.RemoveAll(dir); err != nil {
		slog.Warn("[GitOps] failed to cleanup temp directory", "dir", dir, "error", err)
	}
}

func parseDiffOutput(output, namespace string) []DriftedResource {
	resources := make([]DriftedResource, 0)
	resourceMap := make(map[string]*DriftedResource) // key: kind/name

	lines := strings.Split(output, "\n")
	var currentKind, currentName string

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
					lastChange := strings.TrimSpace(strings.TrimPrefix(line, "-"))
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
	applied := make([]string, 0)
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

// getDemoDrifts returns demo drift data for testing

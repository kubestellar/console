package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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



// Sync was removed in #7993 Phase 4 — this user-initiated operation now runs
// through kc-agent at POST /gitops/sync under the user's kubeconfig. See
// pkg/agent/server_gitops.go#handleGitopsSync.

// syncViaMCP uses kubestellar-deploy for sync

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
	lines := strings.Split(text, "\n")
	errs := make([]string, 0, len(lines)/4)
	for _, line := range lines {
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

// getDemoDrifts returns demo drift data for testing

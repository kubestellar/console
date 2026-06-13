// Package gitops provides GitOps validation, parsing, and repository
// utilities for the kc-agent. These are security-critical helpers shared
// between the drift-detect and sync handlers.
package gitops

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// DefaultTimeout bounds a single drift-detect / sync HTTP request.
const DefaultTimeout = 30 * time.Second

// DNSLookupTimeout is the deadline for resolving a repository hostname.
const DNSLookupTimeout = 3 * time.Second

// TempDirPrefix is the required prefix for all GitOps temp directories.
const TempDirPrefix = "gitops-"

// TruncationMaxLen is the threshold above which a value is shortened.
const TruncationMaxLen = 60

// TruncationKeepLen is how many characters are kept before the ellipsis.
const TruncationKeepLen = 57

// LookupIPAddr is the DNS resolver function; replaceable for testing.
var LookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
	return net.DefaultResolver.LookupIPAddr(ctx, host)
}

// ExecCommandContext is the function used to create exec.Cmd instances.
// Tests can replace this to mock git commands.
var ExecCommandContext = exec.CommandContext

var (
	_, cgnatNet, _        = net.ParseCIDR("100.64.0.0/10")
	_, cloudMetadataIP, _ = net.ParseCIDR("169.254.169.254/32")
	_, ietfProtocolNet, _ = net.ParseCIDR("192.0.0.0/24")
)

// DriftedResource represents a single Kubernetes resource that has drifted
// from its git-declared state.
type DriftedResource struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Field        string `json:"field"`
	GitValue     string `json:"gitValue"`
	ClusterValue string `json:"clusterValue"`
	DiffOutput   string `json:"diffOutput,omitempty"`
}

// DetectDriftRequest is the request body for the drift-detect endpoint.
type DetectDriftRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// DetectDriftResponse is the response body for the drift-detect endpoint.
type DetectDriftResponse struct {
	Drifted    bool              `json:"drifted"`
	Resources  []DriftedResource `json:"resources"`
	Source     string            `json:"source"`
	RawDiff    string            `json:"rawDiff,omitempty"`
	TokensUsed int               `json:"tokensUsed,omitempty"`
}

// SyncRequest is the request body for the gitops sync endpoint.
type SyncRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	DryRun    bool   `json:"dryRun,omitempty"`
}

// SyncResponse is the response body for the gitops sync endpoint.
type SyncResponse struct {
	Success    bool     `json:"success"`
	Message    string   `json:"message"`
	Applied    []string `json:"applied,omitempty"`
	Errors     []string `json:"errors,omitempty"`
	Source     string   `json:"source"`
	TokensUsed int      `json:"tokensUsed,omitempty"`
}

// NormalizeHost cleans a host string for comparison.
func NormalizeHost(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	return strings.ToLower(host)
}

// IsBlockedIP returns true if the IP is in a reserved/private range.
func IsBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		cgnatNet.Contains(ip) || cloudMetadataIP.Contains(ip) || ietfProtocolNet.Contains(ip)
}

// ValidateResolvedIPs ensures a hostname does not resolve to blocked IPs.
func ValidateResolvedIPs(ctx context.Context, host string) error {
	normalizedHost := NormalizeHost(host)
	if normalizedHost == "" {
		return fmt.Errorf("repository URL must include a host")
	}
	if ip := net.ParseIP(normalizedHost); ip != nil {
		if IsBlockedIP(ip) {
			return fmt.Errorf("repository host resolves to a blocked IP address")
		}
		return nil
	}

	lookupCtx, cancel := context.WithTimeout(ctx, DNSLookupTimeout)
	defer cancel()

	ips, err := LookupIPAddr(lookupCtx, normalizedHost)
	if err != nil {
		return fmt.Errorf("resolve repository host: %w", err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("repository host did not resolve to any IP addresses")
	}
	for _, ip := range ips {
		if IsBlockedIP(ip.IP) {
			return fmt.Errorf("repository host resolves to a blocked IP address")
		}
	}
	return nil
}

// ValidateRepoURL validates a git repository URL for security.
// SECURITY: Prevents SSRF via private/blocked IPs and dangerous characters.
func ValidateRepoURL(repoURL string) error {
	if repoURL == "" {
		return fmt.Errorf("repository URL is required")
	}
	isSSH := strings.HasPrefix(repoURL, "git@")
	dangerousChars := []string{";", "|", "&", "$", "`", "(", ")", "{", "}", "<", ">", "\\", "'", "\"", "\n", "\r"}
	for _, char := range dangerousChars {
		if strings.Contains(repoURL, char) {
			return fmt.Errorf("invalid characters in repository URL")
		}
	}
	if strings.Contains(strings.ToLower(repoURL), "file://") {
		return fmt.Errorf("file:// URLs are not allowed")
	}
	if isSSH {
		host, _, found := strings.Cut(strings.TrimPrefix(repoURL, "git@"), ":")
		if !found || strings.TrimSpace(host) == "" {
			return fmt.Errorf("invalid repository URL")
		}
		return ValidateResolvedIPs(context.Background(), host)
	}

	parsed, err := url.Parse(repoURL)
	if err != nil || parsed.Scheme != "https" {
		return fmt.Errorf("only HTTPS and SSH git URLs are allowed")
	}
	if parsed.Hostname() == "" {
		return fmt.Errorf("repository URL must include a host")
	}
	return ValidateResolvedIPs(context.Background(), parsed.Hostname())
}

// ValidateBranchName validates a git branch name.
func ValidateBranchName(branch string) error {
	if branch == "" {
		return nil
	}
	for _, char := range branch {
		if !((char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '/' || char == '.') {
			return fmt.Errorf("invalid character in branch name: %c", char)
		}
	}
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("branch name cannot start with '-'")
	}
	if strings.Contains(branch, "..") {
		return fmt.Errorf("branch name cannot contain '..'")
	}
	return nil
}

// ValidatePath validates a repository path parameter.
// SECURITY: Prevents path traversal attacks and flag injection.
func ValidatePath(path string) error {
	if path == "" {
		return nil
	}
	if strings.ContainsRune(path, 0) {
		return fmt.Errorf("path contains null bytes")
	}
	for _, char := range path {
		if !((char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '/' || char == '.') {
			return fmt.Errorf("invalid character in path: %c", char)
		}
	}
	if strings.HasPrefix(path, "-") {
		return fmt.Errorf("path cannot start with '-'")
	}
	if strings.Contains(path, "..") {
		return fmt.Errorf("path traversal (..) is not allowed")
	}
	return nil
}

// CloneRepo clones a git repository into a temp directory.
func CloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	if err := ValidateRepoURL(repoURL); err != nil {
		return "", fmt.Errorf("invalid repository URL: %w", err)
	}
	if err := ValidateBranchName(branch); err != nil {
		return "", fmt.Errorf("invalid branch name: %w", err)
	}

	tempDir, err := os.MkdirTemp("", TempDirPrefix)
	if err != nil {
		return "", fmt.Errorf("create temp directory: %w", err)
	}
	cleanTempDir := filepath.Clean(tempDir)
	if filepath.Dir(cleanTempDir) != os.TempDir() || !strings.HasPrefix(filepath.Base(cleanTempDir), TempDirPrefix) {
		_ = os.RemoveAll(cleanTempDir)
		return "", fmt.Errorf("temp dir in unexpected location: %s", tempDir)
	}

	args := []string{"clone", "--depth", "1"}
	if branch != "" {
		args = append(args, "-b", branch)
	}
	args = append(args, "--", repoURL, tempDir)

	cmd := ExecCommandContext(ctx, "git", args...) // #nosec G204 -- validated above
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		CleanupTempDir(tempDir)
		return "", fmt.Errorf("git clone failed: %s", stderr.String())
	}
	return tempDir, nil
}

// IsKustomizeDir checks if the given path contains a kustomization file.
func IsKustomizeDir(path string) bool {
	if err := ValidatePath(path); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(path, "kustomization.yaml")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(path, "kustomization.yml")); err == nil {
		return true
	}
	return false
}

// CleanupTempDir safely removes a gitops temp directory.
func CleanupTempDir(dir string) {
	cleanDir := filepath.Clean(dir)
	if filepath.Dir(cleanDir) != os.TempDir() || !strings.HasPrefix(filepath.Base(cleanDir), TempDirPrefix) {
		slog.Warn("[agent] SECURITY: refused to delete directory outside managed gitops temp dir", "dir", dir)
		return
	}
	if strings.Contains(cleanDir, "..") {
		slog.Warn("[agent] SECURITY: refused to delete directory with path traversal", "dir", dir)
		return
	}
	if err := os.RemoveAll(cleanDir); err != nil {
		slog.Warn("[agent] failed to cleanup temp directory", "dir", cleanDir, "error", err)
	}
}

// TruncateValue shortens a string if it exceeds TruncationMaxLen.
func TruncateValue(s string) string {
	if len(s) > TruncationMaxLen {
		return s[:TruncationKeepLen] + "..."
	}
	return s
}

// ParseDiffOutput parses kubectl diff output into drifted resources.
func ParseDiffOutput(output, namespace string) []DriftedResource {
	resources := make([]DriftedResource, 0)
	resourceMap := make(map[string]*DriftedResource)

	lines := strings.Split(output, "\n")
	var currentKind, currentName string

	for _, line := range lines {
		cleanLine := line
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			cleanLine = strings.TrimPrefix(line, "+")
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			cleanLine = strings.TrimPrefix(line, "-")
		}
		cleanLine = strings.TrimSpace(cleanLine)

		if strings.HasPrefix(cleanLine, "kind:") {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentKind = strings.TrimSpace(parts[1])
			}
		}

		if strings.HasPrefix(cleanLine, "name:") && currentKind != "" {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentName = strings.TrimSpace(parts[1])
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

		if currentKind != "" && currentName != "" {
			key := currentKind + "/" + currentName
			if r, exists := resourceMap[key]; exists {
				if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
					lastChange := strings.TrimSpace(strings.TrimPrefix(line, "-"))
					if r.ClusterValue == "" && lastChange != "" {
						r.ClusterValue = TruncateValue(lastChange)
					}
				}
				if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
					change := strings.TrimSpace(strings.TrimPrefix(line, "+"))
					if r.GitValue == "" && change != "" {
						r.GitValue = TruncateValue(change)
					}
				}
			}
		}

		if strings.HasPrefix(line, "diff ") {
			currentKind = ""
			currentName = ""
		}
	}

	for _, r := range resourceMap {
		if r.Name != "" {
			resources = append(resources, *r)
		}
	}
	return resources
}

// ParseApplyOutput parses kubectl apply output into applied resource lines.
func ParseApplyOutput(output string) []string {
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

package agent

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
	"regexp"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/sanitize"
	"github.com/kubestellar/console/pkg/ssrf"
)

const gitopsDNSLookupTimeout = 3 * time.Second

// gitOpsTempDirPrefix is the required prefix for all GitOps temp directories
// in kc-agent. os.MkdirTemp uses it to create a race-safe unique directory
// under the OS temp root.
const gitOpsTempDirPrefix = "gitops-"

// gitopsSafeBranchPattern is a strict allowlist for git branch names, checked
// immediately before the git invocation so the sanitization is local to the
// command sink: alphanumerics plus "._/-", and never a leading "-" (flag
// injection) — validateGitopsBranchName separately rejects "..".
var gitopsSafeBranchPattern = regexp.MustCompile(`^[a-zA-Z0-9._/][a-zA-Z0-9._/-]*$`)

var gitopsLookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
	return net.DefaultResolver.LookupIPAddr(ctx, host)
}

func normalizeGitopsHost(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	return strings.ToLower(host)
}

func validateGitopsResolvedIPs(ctx context.Context, host string) error {
	normalizedHost := normalizeGitopsHost(host)
	if normalizedHost == "" {
		return fmt.Errorf("repository URL must include a host")
	}
	if ip := net.ParseIP(normalizedHost); ip != nil {
		if ssrf.IsBlockedIP(ip) {
			return fmt.Errorf("repository host resolves to a blocked IP address")
		}
		return nil
	}

	lookupCtx, cancel := context.WithTimeout(ctx, gitopsDNSLookupTimeout)
	defer cancel()

	ips, err := gitopsLookupIPAddr(lookupCtx, normalizedHost)
	if err != nil {
		return fmt.Errorf("resolve repository host: %w", err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("repository host did not resolve to any IP addresses")
	}
	for _, ip := range ips {
		if ssrf.IsBlockedIP(ip.IP) {
			return fmt.Errorf("repository host resolves to a blocked IP address")
		}
	}
	return nil
}

// validateGitopsRepoURL mirrors the backend validateRepoURL (#6022 SECURITY).
// Uses net/url.Parse for scheme validation instead of strings.HasPrefix to
// satisfy CodeQL js/incomplete-url-substring-sanitization (issue #9119).
func validateGitopsRepoURL(repoURL string) error {
	if repoURL == "" {
		return fmt.Errorf("repository URL is required")
	}
	// SSH git URLs (git@host:path) are not parseable by net/url; handle explicitly.
	// For HTTPS URLs, use net/url.Parse to extract the scheme safely.
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
		return validateGitopsResolvedIPs(context.Background(), host)
	}

	parsed, err := url.Parse(repoURL)
	if err != nil || parsed.Scheme != "https" {
		return fmt.Errorf("only HTTPS and SSH git URLs are allowed")
	}
	if parsed.Hostname() == "" {
		return fmt.Errorf("repository URL must include a host")
	}
	return validateGitopsResolvedIPs(context.Background(), parsed.Hostname())
}

// validateGitopsBranchName mirrors the backend validateBranchName.
func validateGitopsBranchName(branch string) error {
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

// validateGitopsPath validates a repository path parameter.
// SECURITY: Prevents path traversal attacks and flag injection.
func validateGitopsPath(path string) error {
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

// gitopsCloneRepo mirrors the backend cloneRepo helper.
func gitopsCloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	if err := validateGitopsRepoURL(repoURL); err != nil {
		return "", fmt.Errorf("invalid repository URL: %w", err)
	}
	if err := validateGitopsBranchName(branch); err != nil {
		return "", fmt.Errorf("invalid branch name: %w", err)
	}

	tempDir, err := os.MkdirTemp("", gitOpsTempDirPrefix)
	if err != nil {
		return "", fmt.Errorf("create temp directory: %w", err)
	}
	cleanTempDir := filepath.Clean(tempDir)
	if filepath.Dir(cleanTempDir) != os.TempDir() || !strings.HasPrefix(filepath.Base(cleanTempDir), gitOpsTempDirPrefix) {
		_ = os.RemoveAll(cleanTempDir)
		return "", fmt.Errorf("temp dir in unexpected location: %s", tempDir)
	}

	// repoURL and branch are validated by validateGitopsRepoURL/validateGitopsBranchName
	// above before reaching this point. exec.CommandContext with a discrete arg list
	// (never "sh -c") is immune to shell injection; the literal "--" terminates git
	// option parsing so repoURL and tempDir are never misinterpreted as flags, and
	// branch is additionally re-checked against a strict allowlist pattern here, local
	// to the sink, so no shell metacharacters or leading dashes can reach git.
	if branch != "" && !gitopsSafeBranchPattern.MatchString(branch) {
		return "", fmt.Errorf("invalid branch name")
	}
	var cmd *exec.Cmd
	if branch != "" {
		cmd = exec.CommandContext(ctx, "git", "clone", "--depth", "1", "-b", branch, "--", repoURL, tempDir) // #nosec G204 -- validated above; no shell invoked
	} else {
		cmd = exec.CommandContext(ctx, "git", "clone", "--depth", "1", "--", repoURL, tempDir) // #nosec G204 -- validated above; no shell invoked
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		gitopsCleanupTempDir(tempDir)
		return "", fmt.Errorf("git clone failed: %s", stderr.String())
	}
	return tempDir, nil
}

// gitopsIsKustomizeDir mirrors the backend isKustomizeDir helper.
// SECURITY: Uses filepath.Join (not string concatenation) so CodeQL's
// path-injection taint model (alerts #561 and #562) can see that the
// path component is passed through a recognised path-construction API
// before reaching os.Stat. validateGitopsPath is also called at the
// sink as a defence-in-depth measure; callers already validate req.Path
// at handler entry.
func gitopsIsKustomizeDir(path string) bool {
	if err := validateGitopsPath(path); err != nil {
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

// gitopsCleanupTempDir mirrors the backend cleanupTempDir helper.
func gitopsCleanupTempDir(dir string) {
	cleanDir := filepath.Clean(dir)
	if filepath.Dir(cleanDir) != os.TempDir() || !strings.HasPrefix(filepath.Base(cleanDir), gitOpsTempDirPrefix) {
		slog.Warn("[agent] SECURITY: refused to delete directory outside managed gitops temp dir", "dir", sanitize.LogString(dir))
		return
	}
	if strings.Contains(cleanDir, "..") {
		slog.Warn("[agent] SECURITY: refused to delete directory with path traversal", "dir", sanitize.LogString(dir))
		return
	}
	if err := os.RemoveAll(cleanDir); err != nil {
		slog.Warn("[agent] failed to cleanup temp directory", "dir", sanitize.LogString(cleanDir), "error", err)
	}
}

// gitopsTruncateValue mirrors the backend truncateValue helper.
// truncationMaxLen is the threshold above which a value is shortened.
// truncationKeepLen is how many characters are kept before the ellipsis.
const (
	truncationMaxLen  = 60
	truncationKeepLen = 57
)

func gitopsTruncateValue(s string) string {
	if len(s) > truncationMaxLen {
		return s[:truncationKeepLen] + "..."
	}
	return s
}

// gitopsParseDiffOutput mirrors the backend parseDiffOutput helper.
func gitopsParseDiffOutput(output, namespace string) []agentDriftedResource {
	resources := make([]agentDriftedResource, 0)
	resourceMap := make(map[string]*agentDriftedResource)

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
					resourceMap[key] = &agentDriftedResource{
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
						r.ClusterValue = gitopsTruncateValue(lastChange)
					}
				}
				if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
					change := strings.TrimSpace(strings.TrimPrefix(line, "+"))
					if r.GitValue == "" && change != "" {
						r.GitValue = gitopsTruncateValue(change)
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

// gitopsParseApplyOutput mirrors the backend parseApplyOutput helper.
func gitopsParseApplyOutput(output string) []string {
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


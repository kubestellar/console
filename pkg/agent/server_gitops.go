package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// gitopsDefaultTimeout bounds a single drift-detect / sync HTTP request. The
// backend uses the same 30-second bound in pkg/api/handlers/gitops.go — keep
// in lockstep until Phase 4 deletes the backend handlers.
const gitopsDefaultTimeout = 30 * time.Second

// gitOpsTempDirPrefix is the required prefix for all GitOps temp directories
// in kc-agent. Matches the backend's prefix exactly so cleanup sweeps and
// diagnostic logs behave identically.
const gitOpsTempDirPrefix = "/tmp/gitops-"

// agentDriftedResource mirrors pkg/api/handlers/gitops.go#DriftedResource.
// Kept local to pkg/agent because the agent cannot import pkg/api/handlers
// (that package imports pkg/k8s internals that pull in the rest of the
// handlers graph).
type agentDriftedResource struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Field        string `json:"field"`
	GitValue     string `json:"gitValue"`
	ClusterValue string `json:"clusterValue"`
	DiffOutput   string `json:"diffOutput,omitempty"`
}

// agentDetectDriftRequest mirrors pkg/api/handlers/gitops.go#DetectDriftRequest.
type agentDetectDriftRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// agentDetectDriftResponse mirrors pkg/api/handlers/gitops.go#DetectDriftResponse.
// The agent-side path only supports the kubectl backend (kc-agent does not
// carry the MCP bridge used by the backend handler as an optional first
// attempt), so the Source field is always "kubectl".
type agentDetectDriftResponse struct {
	Drifted    bool                   `json:"drifted"`
	Resources  []agentDriftedResource `json:"resources"`
	Source     string                 `json:"source"`
	RawDiff    string                 `json:"rawDiff,omitempty"`
	TokensUsed int                    `json:"tokensUsed,omitempty"`
}

// agentSyncRequest mirrors pkg/api/handlers/gitops.go#SyncRequest.
type agentSyncRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	DryRun    bool   `json:"dryRun,omitempty"`
}

// agentSyncResponse mirrors pkg/api/handlers/gitops.go#SyncResponse.
type agentSyncResponse struct {
	Success    bool     `json:"success"`
	Message    string   `json:"message"`
	Applied    []string `json:"applied,omitempty"`
	Errors     []string `json:"errors,omitempty"`
	Source     string   `json:"source"`
	TokensUsed int      `json:"tokensUsed,omitempty"`
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
	if !isSSH {
		parsed, err := url.Parse(repoURL)
		if err != nil || parsed.Scheme != "https" {
			return fmt.Errorf("only HTTPS and SSH git URLs are allowed")
		}
	}
	dangerousChars := []string{";", "|", "&", "$", "`", "(", ")", "{", "}", "<", ">", "\\", "'", "\"", "\n", "\r"}
	for _, char := range dangerousChars {
		if strings.Contains(repoURL, char) {
			return fmt.Errorf("invalid characters in repository URL")
		}
	}
	if strings.Contains(strings.ToLower(repoURL), "file://") {
		return fmt.Errorf("file:// URLs are not allowed")
	}
	return nil
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

	tempDir := fmt.Sprintf("%s%d", gitOpsTempDirPrefix, time.Now().UnixNano())

	// repoURL and branch are validated by validateGitopsRepoURL/validateGitopsBranchName
	// above before reaching this point. exec.CommandContext with a discrete arg list
	// (never "sh -c") is immune to shell injection; CodeQL flags the taint flow from
	// user input but there is no shell involved. // lgtm[go/command-injection]
	args := []string{"clone", "--depth", "1"}
	if branch != "" {
		args = append(args, "-b", branch)
	}
	// "--" terminates option parsing so repoURL and tempDir are never
	// misinterpreted as flags by git, regardless of their content.
	args = append(args, "--", repoURL, tempDir)

	cmd := execCommandContext(ctx, "git", args...) // #nosec G204 -- validated above; no shell invoked
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
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
	if !strings.HasPrefix(dir, gitOpsTempDirPrefix) {
		slog.Warn("[agent] SECURITY: refused to delete directory outside gitops temp prefix", "dir", dir)
		return
	}
	if strings.Contains(dir, "..") {
		slog.Warn("[agent] SECURITY: refused to delete directory with path traversal", "dir", dir)
		return
	}
	if err := os.RemoveAll(dir); err != nil {
		slog.Warn("[agent] failed to cleanup temp directory", "dir", dir, "error", err)
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

// handleDetectDrift is the kc-agent version of the legacy backend
// /api/gitops/detect-drift endpoint. Shells `kubectl diff -f <manifests>`
// under the user's kubeconfig. The backend has an MCP-first path that's not
// portable to kc-agent — this handler always uses the kubectl path, matching
// the backend's fallback behavior when `h.bridge` is nil (#7993 Phase 3b).
func (s *Server) handleDetectDrift(w http.ResponseWriter, r *http.Request) {
	// POST-only drift detection — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "POST required"})
		return
	}

	var req agentDetectDriftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid request body"})
		return
	}
	if req.RepoURL == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "repoUrl is required"})
		return
	}

	// Validate K8s name params before passing to kubectl CLI.
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateHelmK8sName(val, field); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": fmt.Sprintf("invalid %s: %v", field, err)})
			return
		}
	}

	// Validate path parameter to prevent path traversal attacks.
	if err := validateGitopsPath(req.Path); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": fmt.Sprintf("invalid path: %v", err)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), gitopsDefaultTimeout)
	defer cancel()

	tempDir, err := gitopsCloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		slog.Warn("[agent] detect-drift: clone failed", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": err.Error(), "source": "agent"})
		return
	}
	defer gitopsCleanupTempDir(tempDir)

	manifestPath := tempDir
	if req.Path != "" {
		// filepath.Join cleans the result and is recognised by CodeQL's
		// path-injection taint model as a safe path-construction API.
		manifestPath = filepath.Join(tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	fileFlag := "-f"
	if gitopsIsKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// "--" terminates kubectl option parsing so manifestPath (which is derived
	// from user-supplied req.Path) cannot be misinterpreted as a kubectl flag.
	args := []string{"diff", fileFlag, "--", manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}

	cmd := execCommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	diffOutput := stdout.String()

	resp := agentDetectDriftResponse{
		Source:     "kubectl",
		RawDiff:    diffOutput,
		TokensUsed: 0,
	}

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			// kubectl diff returns 1 when drift is detected — this is a
			// success, not a failure.
			const kubectlDiffDriftExitCode = 1
			if exitErr.ExitCode() == kubectlDiffDriftExitCode {
				resp.Drifted = true
				resp.Resources = gitopsParseDiffOutput(diffOutput, req.Namespace)
			} else {
				slog.Warn("[agent] detect-drift: kubectl diff failed", "stderr", stderr.String())
				w.WriteHeader(http.StatusInternalServerError)
				writeJSON(w, map[string]string{"error": stderr.String(), "source": "agent"})
				return
			}
		} else {
			slog.Warn("[agent] detect-drift: kubectl diff failed", "error", runErr)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": runErr.Error(), "source": "agent"})
			return
		}
	}

	writeJSON(w, resp)
}

// handleGitopsSync is the kc-agent version of the legacy backend
// /api/gitops/sync endpoint. Shells `kubectl apply -f <manifests>` under the
// user's kubeconfig. Backend had an MCP-first path; kc-agent always uses
// kubectl (#7993 Phase 3b).
func (s *Server) handleGitopsSync(w http.ResponseWriter, r *http.Request) {
	// POST-only gitops sync — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "POST required"})
		return
	}

	var req agentSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid request body"})
		return
	}
	if req.RepoURL == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "repoUrl is required"})
		return
	}
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateHelmK8sName(val, field); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": fmt.Sprintf("invalid %s: %v", field, err)})
			return
		}
	}

	// Validate path parameter to prevent path traversal attacks.
	if err := validateGitopsPath(req.Path); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": fmt.Sprintf("invalid path: %v", err)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), gitopsDefaultTimeout)
	defer cancel()

	tempDir, err := gitopsCloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		slog.Warn("[agent] sync: clone failed", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": err.Error(), "source": "agent"})
		return
	}
	defer gitopsCleanupTempDir(tempDir)

	manifestPath := tempDir
	if req.Path != "" {
		// filepath.Join cleans the result and is recognised by CodeQL's
		// path-injection taint model as a safe path-construction API.
		manifestPath = filepath.Join(tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	fileFlag := "-f"
	if gitopsIsKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// "--" terminates kubectl option parsing so manifestPath (which is derived
	// from user-supplied req.Path) cannot be misinterpreted as a kubectl flag.
	args := []string{"apply", fileFlag, "--", manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}
	if req.DryRun {
		args = append(args, "--dry-run=client")
	}

	cmd := execCommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Backend returns 200 with Success=false and the stderr in Errors. Do
		// the same here so frontend behavior is identical after the Phase 4
		// URL swap.
		writeJSON(w, agentSyncResponse{
			Success: false,
			Message: stderr.String(),
			Source:  "kubectl",
			Errors:  []string{stderr.String()},
		})
		return
	}

	writeJSON(w, agentSyncResponse{
		Success:    true,
		Message:    "Successfully applied manifests",
		Applied:    gitopsParseApplyOutput(stdout.String()),
		Source:     "kubectl",
		TokensUsed: 0,
	})
}

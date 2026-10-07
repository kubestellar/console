package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/sanitize"
)

// gitopsDefaultTimeout bounds a single drift-detect / sync HTTP request. The
// backend uses the same 30-second bound in pkg/api/handlers/gitops.go — keep
// in lockstep until Phase 4 deletes the backend handlers.
const gitopsDefaultTimeout = 30 * time.Second

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
			slog.Error("invalid GitOps detect-drift input", "field", sanitize.LogString(field), "value", sanitize.LogString(val), "error", sanitize.LogString(err.Error()))
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
			return
		}
	}

	// Validate path parameter to prevent path traversal attacks.
	if err := validateGitopsPath(req.Path); err != nil {
		slog.Error("invalid GitOps detect-drift path", "path", sanitize.LogString(req.Path), "error", sanitize.LogString(err.Error()))
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), gitopsDefaultTimeout)
	defer cancel()

	tempDir, err := gitopsCloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		slog.Warn("[agent] detect-drift: clone failed", "error", sanitize.LogString(err.Error()))
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("clone repository", err), "source": "agent"})
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

	cmd := exec.CommandContext(ctx, "kubectl", args...)
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
				slog.Warn("[agent] detect-drift: kubectl diff failed", "stderr", sanitize.LogString(stderr.String()))
				w.WriteHeader(http.StatusInternalServerError)
				writeJSON(w, map[string]string{"error": sanitizeAgentError("detect drift", runErr), "source": "agent"})
				return
			}
		} else {
			slog.Warn("[agent] detect-drift: kubectl diff failed", "error", runErr)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("detect drift", runErr), "source": "agent"})
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
			slog.Error("invalid GitOps sync input", "field", sanitize.LogString(field), "value", sanitize.LogString(val), "error", sanitize.LogString(err.Error()))
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
			return
		}
	}

	// Validate path parameter to prevent path traversal attacks.
	if err := validateGitopsPath(req.Path); err != nil {
		slog.Error("invalid GitOps sync path", "path", sanitize.LogString(req.Path), "error", sanitize.LogString(err.Error()))
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), gitopsDefaultTimeout)
	defer cancel()

	tempDir, err := gitopsCloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		slog.Warn("[agent] sync: clone failed", "error", sanitize.LogString(err.Error()))
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("clone repository", err), "source": "agent"})
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

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		slog.Warn("[agent] sync: kubectl apply failed", "error", err, "stderr", sanitize.LogString(stderr.String()))
		msg := sanitizeAgentError("sync manifests", err)
		// Backend returns 200 with Success=false and the stderr in Errors. Do
		// the same here so frontend behavior is identical after the Phase 4
		// URL swap.
		writeJSON(w, agentSyncResponse{
			Success: false,
			Message: msg,
			Source:  "kubectl",
			Errors:  []string{msg},
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

package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// helmOperationTimeout bounds any single helm subprocess invocation. The
// backend used the same value for the legacy /api/gitops/helm-* routes;
// kc-agent preserves the bound verbatim so clients see identical behavior.
const helmOperationTimeout = 10 * time.Minute

// Helm argument validation constants. These are duplicated from the backend's
// pkg/api/handlers/gitops.go validators because the helm handlers move here
// in #7993 Phase 3a. Keep the values in lockstep with the backend until the
// backend routes are deleted in Phase 4.
const (
	// helmMaxK8sNameLen is the maximum length of cluster/release/namespace
	// names passed on the helm CLI. Matches Kubernetes DNS subdomain max.
	helmMaxK8sNameLen = 253

	// helmMaxChartLen is the maximum length of a chart reference string
	// (e.g. `bitnami/nginx`, `oci://...`). Prevents flag injection via
	// absurdly long inputs.
	helmMaxChartLen = 512
)

// validateHelmK8sName mirrors the backend validateK8sName validator used for
// helm CLI arguments. Empty is allowed — callers enforce required fields.
func validateHelmK8sName(name, field string) error {
	if name == "" {
		return nil
	}
	if len(name) > helmMaxK8sNameLen {
		return fmt.Errorf("%s exceeds maximum length of %d", field, helmMaxK8sNameLen)
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

// validateHelmChartArg mirrors the backend validateHelmChart validator.
func validateHelmChartArg(chart string) error {
	if chart == "" {
		return fmt.Errorf("chart is required")
	}
	if len(chart) > helmMaxChartLen {
		return fmt.Errorf("chart reference exceeds maximum length of %d", helmMaxChartLen)
	}
	if strings.HasPrefix(chart, "-") {
		return fmt.Errorf("chart must not start with '-'")
	}
	// Allow alphanumeric, -, _, ., /, : (for oci:// and repo/chart).
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

// validateHelmChartVersion mirrors the backend validateHelmVersion validator.
func validateHelmChartVersion(version string) error {
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

// detachedHelmCtx returns a context that is decoupled from the inbound HTTP
// request so a disconnected client doesn't SIGKILL helm mid-operation and
// leave the release in a broken/pending state. Same rationale as the backend's
// gitops.go#detachedHelmContext (see #6592).
func detachedHelmCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), helmOperationTimeout)
}

// helmRollbackRequest is the request body for POST /helm/rollback. Mirrors
// pkg/api/handlers/gitops.go#HelmRollbackRequest exactly so the frontend
// request body doesn't change during Phase 4.
type helmRollbackRequest struct {
	Release   string `json:"release"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Revision  int    `json:"revision"`
}

// helmUninstallRequest mirrors pkg/api/handlers/gitops.go#HelmUninstallRequest.
type helmUninstallRequest struct {
	Release   string `json:"release"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
}

// helmUpgradeRequest mirrors pkg/api/handlers/gitops.go#HelmUpgradeRequest.
type helmUpgradeRequest struct {
	Release     string `json:"release"`
	Namespace   string `json:"namespace"`
	Cluster     string `json:"cluster"`
	Chart       string `json:"chart"`
	Version     string `json:"version,omitempty"`
	Values      string `json:"values,omitempty"` // YAML string of override values
	ReuseValues bool   `json:"reuseValues,omitempty"`
}

// handleHelmRollback is the kc-agent version of the legacy backend
// /api/gitops/helm-rollback endpoint. Shells `helm rollback <release>
// <revision> -n <namespace> [--kube-context <cluster>]` under the user's
// kubeconfig (the one loaded from ~/.kube/config by kc-agent at startup).
// Part of #7993 Phase 3a — the backend handler is still present until
// Phase 4 deletes it.
func (s *Server) handleHelmRollback(w http.ResponseWriter, r *http.Request) {
	// POST-only Helm rollback — preflight must advertise POST (#8201).
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

	var req helmRollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Release == "" || req.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "release and namespace are required"})
		return
	}
	if req.Revision <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "revision must be a positive integer"})
		return
	}
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateHelmK8sName(val, field); err != nil {
			slog.Error("invalid Helm rollback input", "field", field, "value", val, "error", err)
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
			return
		}
	}

	args := []string{"rollback", req.Release, fmt.Sprintf("%d", req.Revision), "-n", req.Namespace}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := detachedHelmCtx()
	defer cancel()

	cmd := execCommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	slog.Info("[agent] helm rollback", "release", req.Release, "revision", req.Revision, "cluster", req.Cluster, "namespace", req.Namespace)
	if err := cmd.Run(); err != nil {
		slog.Warn("[agent] helm rollback failed", "release", req.Release, "error", err, "stderr", stderr.String())
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"error":  sanitizeAgentError("rollback release", err),
			"source": "agent",
		})
		return
	}

	slog.Info("[agent] helm rollback succeeded", "release", req.Release, "revision", req.Revision)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Rolled back %s to revision %d", req.Release, req.Revision),
		"output":  stdout.String(),
		"source":  "agent",
	})
}

// handleHelmUninstall is the kc-agent version of the legacy backend
// /api/gitops/helm-uninstall endpoint.
func (s *Server) handleHelmUninstall(w http.ResponseWriter, r *http.Request) {
	// POST-only Helm uninstall — preflight must advertise POST (#8201).
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

	var req helmUninstallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Release == "" || req.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "release and namespace are required"})
		return
	}
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateHelmK8sName(val, field); err != nil {
			slog.Error("invalid Helm uninstall input", "field", field, "value", val, "error", err)
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
			return
		}
	}

	args := []string{"uninstall", req.Release, "-n", req.Namespace}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := detachedHelmCtx()
	defer cancel()

	cmd := execCommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	slog.Info("[agent] helm uninstall", "release", req.Release, "cluster", req.Cluster, "namespace", req.Namespace)
	if err := cmd.Run(); err != nil {
		slog.Warn("[agent] helm uninstall failed", "release", req.Release, "error", err, "stderr", stderr.String())
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"error":  sanitizeAgentError("uninstall release", err),
			"source": "agent",
		})
		return
	}

	slog.Info("[agent] helm uninstall succeeded", "release", req.Release)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Uninstalled release %s", req.Release),
		"output":  stdout.String(),
		"source":  "agent",
	})
}

// handleHelmUpgrade is the kc-agent version of the legacy backend
// /api/gitops/helm-upgrade endpoint.
func (s *Server) handleHelmUpgrade(w http.ResponseWriter, r *http.Request) {
	// POST-only Helm upgrade — preflight must advertise POST (#8201).
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

	var req helmUpgradeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Release == "" || req.Namespace == "" || req.Chart == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "release, namespace, and chart are required"})
		return
	}
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateHelmK8sName(val, field); err != nil {
			slog.Error("invalid Helm upgrade input", "field", field, "value", val, "error", err)
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
			return
		}
	}
	if err := validateHelmChartArg(req.Chart); err != nil {
		slog.Error("invalid Helm chart", "chart", req.Chart, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
		return
	}
	if err := validateHelmChartVersion(req.Version); err != nil {
		slog.Error("invalid Helm chart version", "version", req.Version, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": sanitizeAgentError("", err)})
		return
	}

	args := []string{"upgrade", req.Release, req.Chart, "-n", req.Namespace}
	if req.Version != "" {
		args = append(args, "--version", req.Version)
	}
	if req.ReuseValues {
		args = append(args, "--reuse-values")
	}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := detachedHelmCtx()
	defer cancel()

	cmd := execCommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// If values provided, write to temp file and pass via -f. Matches
	// pkg/api/handlers/gitops.go#UpgradeHelmRelease exactly (including the
	// #7747 fix that reassigns stdout/stderr on the rebuilt command).
	if req.Values != "" {
		tmpFile, err := os.CreateTemp("", "helm-values-*.yaml")
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": "failed to create temp values file"})
			return
		}
		defer os.Remove(tmpFile.Name())

		if _, err := tmpFile.WriteString(req.Values); err != nil {
			tmpFile.Close()
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": "failed to write values"})
			return
		}
		tmpFile.Close()

		args = append(args, "-f", tmpFile.Name())
		cmd = execCommandContext(ctx, "helm", args...)
		stdout.Reset()
		stderr.Reset()
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
	}

	slog.Info("[agent] helm upgrade", "release", req.Release, "chart", req.Chart, "cluster", req.Cluster, "namespace", req.Namespace)
	if err := cmd.Run(); err != nil {
		slog.Warn("[agent] helm upgrade failed", "release", req.Release, "error", err, "stderr", stderr.String())
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"error":  sanitizeAgentError("upgrade release", err),
			"source": "agent",
		})
		return
	}

	slog.Info("[agent] helm upgrade succeeded", "release", req.Release)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Upgraded release %s", req.Release),
		"output":  stdout.String(),
		"source":  "agent",
	})
}

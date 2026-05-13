package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
)

// GPU-health CronJob install/uninstall handlers (#7993 Phase 3e). User-initiated
// tooling installs like this CronJob + RBAC bundle must run under the user's
// kubeconfig via kc-agent, not the backend pod ServiceAccount.

// Tier range for the GPU health check. Must stay in sync with the frontend
// TIER_OPTIONS in ProactiveGPUNodeHealthMonitor.tsx and with the backend's
// InstallGPUHealthCronJob validator in pkg/api/handlers/mcp_resources.go
// (issue #6110).
const (
	minGPUHealthTier = 1 // Critical
	maxGPUHealthTier = 4 // Deep (privileged)
)

// cronFieldCount is the number of fields in a standard cron expression.
// (minute, hour, day-of-month, month, day-of-week)
const cronFieldCount = 5

// maxCronFieldLen caps the length of a single cron field to prevent abuse.
const maxCronFieldLen = 64

// cronFieldPattern matches a single standard cron field. Matches the backend
// validation.go#cronFieldPattern exactly.
var cronFieldPattern = regexp.MustCompile(`^[0-9*/,\-LW#?]+$`)

// isValidCronScheduleAgent mirrors pkg/api/handlers/validation.go's
// isValidCronSchedule. Re-implemented here because pkg/agent cannot import
// pkg/api/handlers. Kept lockstep until the backend handler is removed.
func isValidCronScheduleAgent(schedule string) bool {
	fields := strings.Fields(schedule)
	if len(fields) != cronFieldCount {
		return false
	}
	for _, f := range fields {
		if len(f) > maxCronFieldLen {
			return false
		}
		if !cronFieldPattern.MatchString(f) {
			return false
		}
	}
	return true
}

// handleGPUHealthCronJob serves POST (install) and DELETE (uninstall) for the
// GPU health-check CronJob + associated RBAC. Both paths shell through
// s.k8sClient (MultiClusterClient) which, in kc-agent, uses the user's
// kubeconfig.
func (s *Server) handleGPUHealthCronJob(w http.ResponseWriter, r *http.Request) {
	// #8201: POST install, DELETE uninstall — preflight must advertise both.
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "No cluster access"})
		return
	}

	switch r.Method {
	case http.MethodPost:
		s.gpuHealthCronJobInstall(w, r)
	case http.MethodDelete:
		s.gpuHealthCronJobUninstall(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "POST or DELETE required"})
	}
}

// gpuHealthCronJobInstall handles POST /gpu-health-cronjob. Mirrors the
// backend MCPHandlers.InstallGPUHealthCronJob request body and validation.
func (s *Server) gpuHealthCronJobInstall(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Schedule  string `json:"schedule"`
		Tier      int    `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Invalid request body"})
		return
	}
	if body.Cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "cluster is required"})
		return
	}
	if body.Schedule != "" && !isValidCronScheduleAgent(body.Schedule) {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "invalid cron schedule format — expected 5-field cron expression (e.g. '*/15 * * * *')"})
		return
	}
	if body.Tier < minGPUHealthTier || body.Tier > maxGPUHealthTier {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": fmt.Sprintf("tier must be between %d and %d", minGPUHealthTier, maxGPUHealthTier)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	if err := s.k8sClient.InstallGPUHealthCronJob(ctx, body.Cluster, body.Namespace, body.Schedule, body.Tier); err != nil {
		slog.Warn("[agent] GPU health cronjob install failed", "cluster", body.Cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"error": sanitizeAgentError("install GPU health CronJob", err), "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("GPU health CronJob installed on %s (tier %d)", body.Cluster, body.Tier),
		"source":  "agent",
	})
}

// gpuHealthCronJobUninstall handles DELETE /gpu-health-cronjob. Mirrors the
// backend MCPHandlers.UninstallGPUHealthCronJob request body.
func (s *Server) gpuHealthCronJobUninstall(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Invalid request body"})
		return
	}
	if body.Cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "cluster is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	if err := s.k8sClient.UninstallGPUHealthCronJob(ctx, body.Cluster, body.Namespace); err != nil {
		slog.Warn("[agent] GPU health cronjob uninstall failed", "cluster", body.Cluster, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"error": sanitizeAgentError("remove GPU health CronJob", err), "source": "agent"})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("GPU health CronJob removed from %s", body.Cluster),
		"source":  "agent",
	})
}

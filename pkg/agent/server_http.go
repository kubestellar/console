package agent

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/kubestellar/console/pkg/settings"
)

// mapK8sErrorToHTTP translates a Kubernetes API error into the appropriate
// HTTP status + sanitized user-facing message. Opaque 500s leak apiserver
// internals; instead we map the well-known StatusError kinds so callers can
// render sensible UI (e.g. "already exists" -> 409 with a friendly message).
// Non-status errors fall through to 500 with a generic message — the real
// error is still logged by the caller via slog.Warn. #8034 Copilot followup
// to PR #8028.
func mapK8sErrorToHTTP(err error) (int, string) {
	switch {
	case k8serrors.IsAlreadyExists(err):
		return http.StatusConflict, err.Error()
	case k8serrors.IsForbidden(err):
		return http.StatusForbidden, err.Error()
	case k8serrors.IsInvalid(err):
		return http.StatusBadRequest, err.Error()
	case k8serrors.IsNotFound(err):
		return http.StatusNotFound, err.Error()
	case k8serrors.IsUnauthorized(err):
		return http.StatusUnauthorized, err.Error()
	case k8serrors.IsConflict(err):
		return http.StatusConflict, err.Error()
	case k8serrors.IsTimeout(err), k8serrors.IsServerTimeout(err):
		return http.StatusGatewayTimeout, err.Error()
	case k8serrors.IsServiceUnavailable(err):
		return http.StatusServiceUnavailable, err.Error()
	default:
		return http.StatusInternalServerError, "internal server error"
	}
}

// writeJSON encodes v as JSON to w and logs any encoding error.
// After headers have been written, the only safe action is to log the failure.
func writeJSON(w http.ResponseWriter, v interface{}) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("[HTTP] failed to encode JSON response", "error", err)
	}
}

// writeJSONError writes an error response with the appropriate HTTP status code.
// Use this instead of writeJSON for error cases to ensure clients see a non-200
// status (#7275). The response body includes an "error" field with the message.
func writeJSONError(w http.ResponseWriter, statusCode int, msg string) {
	w.WriteHeader(statusCode)
	writeJSON(w, map[string]string{"error": msg})
}

// handleAutoUpdateConfig handles GET/POST for auto-update configuration.
func (s *Server) handleAutoUpdateConfig(w http.ResponseWriter, r *http.Request) {
	// #8201: GET reads config, POST writes config — preflight must advertise both.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	switch r.Method {
	case "GET":
		mgr := settings.GetSettingsManager()
		all, _ := mgr.GetAll()
		enabled := false
		channel := "stable"
		if all != nil {
			enabled = all.AutoUpdateEnabled
			if all.AutoUpdateChannel != "" {
				channel = all.AutoUpdateChannel
			}
		}
		writeJSON(w, AutoUpdateConfigRequest{
			Enabled: enabled,
			Channel: channel,
		})

	case "POST":
		// Limit request body to prevent OOM from oversized payloads (#7268)
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		var req AutoUpdateConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": "invalid request body"})
			return
		}

		// Validate channel
		switch req.Channel {
		case "stable", "unstable", "developer":
			// ok
		default:
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": "invalid channel"})
			return
		}

		// Persist to settings
		mgr := settings.GetSettingsManager()
		if all, err := mgr.GetAll(); err == nil {
			all.AutoUpdateEnabled = req.Enabled
			all.AutoUpdateChannel = req.Channel
			mgr.SaveAll(all)
		}

		// Apply to running checker
		if s.updateChecker != nil {
			s.updateChecker.Configure(req.Enabled, req.Channel)
		}

		writeJSON(w, map[string]interface{}{"success": true})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleAutoUpdateStatus returns the current auto-update status.
func (s *Server) handleAutoUpdateStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "update checker not initialized"})
		return
	}

	writeJSON(w, s.updateChecker.Status())
}

// handleAutoUpdateTrigger triggers an immediate update check.
func (s *Server) handleAutoUpdateTrigger(w http.ResponseWriter, r *http.Request) {
	// POST-only trigger endpoint — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "update checker not initialized"})
		return
	}

	// Accept optional channel override from frontend.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var body struct {
		Channel string `json:"channel"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": "invalid JSON body"})
			return
		}
	}
	if !s.updateChecker.TriggerNow(body.Channel) {
		w.WriteHeader(http.StatusConflict)
		writeJSON(w, map[string]interface{}{"success": false, "error": "update already in progress"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "message": "update check triggered"})
}

// handleAutoUpdateCancel cancels an in-progress update. Cancellation is
// best-effort: the currently-running step may complete before the abort is
// honored, and the update cannot be cancelled once the restart step has begun
// (startup-oauth.sh is spawned as a detached process).
func (s *Server) handleAutoUpdateCancel(w http.ResponseWriter, r *http.Request) {
	// POST-only cancel endpoint — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "update checker not initialized"})
		return
	}

	if !s.updateChecker.CancelUpdate() {
		w.WriteHeader(http.StatusConflict)
		writeJSON(w, map[string]interface{}{"success": false, "error": "no update in progress"})
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "message": "cancellation requested"})
}

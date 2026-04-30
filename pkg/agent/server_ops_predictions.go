package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// =============================================================================
// Prediction Handlers
// =============================================================================

// handlePredictionsAI returns current AI predictions
func (s *Server) handlePredictionsAI(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		json.NewEncoder(w).Encode(AIPredictionsResponse{
			Predictions: []AIPrediction{},
			Stale:       true,
		})
		return
	}

	json.NewEncoder(w).Encode(s.predictionWorker.GetPredictions())
}

// handlePredictionsAnalyze triggers a manual AI analysis
func (s *Server) handlePredictionsAnalyze(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		http.Error(w, "Prediction worker not available", http.StatusServiceUnavailable)
		return
	}

	// Parse optional providers from request body.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var req AIAnalysisRequest
	if r.Body != nil {
		if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes)).Decode(&req); err != nil && err != io.EOF {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
			return
		}
	}

	if s.predictionWorker.IsAnalyzing() {
		json.NewEncoder(w).Encode(map[string]string{
			"status": "already_running",
		})
		return
	}

	if err := s.predictionWorker.TriggerAnalysis(req.Providers); err != nil {
		slog.Error("prediction analysis error", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":        "started",
		"estimatedTime": "30s",
	})
}

// PredictionFeedbackRequest represents a feedback submission
type PredictionFeedbackRequest struct {
	PredictionID string `json:"predictionId"`
	Feedback     string `json:"feedback"` // "accurate" or "inaccurate"
}

// handlePredictionsFeedback handles prediction feedback submissions
func (s *Server) handlePredictionsFeedback(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PredictionFeedbackRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PredictionID == "" || (req.Feedback != "accurate" && req.Feedback != "inaccurate") {
		http.Error(w, "Invalid predictionId or feedback", http.StatusBadRequest)
		return
	}

	// For now, just acknowledge - feedback is stored client-side
	// In the future, this could store to a database for model improvement
	slog.Info("[Predictions] feedback received", "predictionID", req.PredictionID, "feedback", req.Feedback)

	json.NewEncoder(w).Encode(map[string]string{
		"status": "recorded",
	})
}

// handlePredictionsStats returns prediction accuracy statistics
func (s *Server) handlePredictionsStats(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Stats are calculated client-side from localStorage
	// This endpoint is for future server-side aggregation
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalPredictions":   0,
		"accurateFeedback":   0,
		"inaccurateFeedback": 0,
		"accuracyRate":       0.0,
		"byProvider":         map[string]interface{}{},
	})
}

// handleMetricsHistory returns historical metrics for trend analysis
func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// SECURITY: require auth before returning sensitive metrics (#7223).
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.metricsHistory == nil {
		json.NewEncoder(w).Encode(MetricsHistoryResponse{
			Snapshots: []MetricsSnapshot{},
			Retention: "24h",
		})
		return
	}

	json.NewEncoder(w).Encode(s.metricsHistory.GetSnapshots())
}

// handleDeviceAlerts returns current hardware device alerts
func (s *Server) handleDeviceAlerts(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceAlertsResponse{
			Alerts:    []DeviceAlert{},
			NodeCount: 0,
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(s.deviceTracker.GetAlerts())
}

// handleDeviceAlertsClear clears a specific device alert
func (s *Server) handleDeviceAlertsClear(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Validate request body before checking device tracker availability so
	// callers always get a 400 for malformed requests regardless of server state.
	var req struct {
		AlertID string `json:"alertId"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.AlertID == "" {
		http.Error(w, "alertId is required", http.StatusBadRequest)
		return
	}

	if s.deviceTracker == nil {
		http.Error(w, "Device tracker not available", http.StatusServiceUnavailable)
		return
	}

	cleared := s.deviceTracker.ClearAlert(req.AlertID)
	json.NewEncoder(w).Encode(map[string]bool{"cleared": cleared})
}

func (s *Server) handleDeviceInventory(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// SECURITY: require auth before returning device inventory (#7228).
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceInventoryResponse{
			Nodes:     []NodeDeviceInventory{},
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	response := s.deviceTracker.GetInventory()
	json.NewEncoder(w).Encode(response)
}

// sendNativeNotification sends a native macOS notification for device alerts
func (s *Server) sendNativeNotification(alerts []DeviceAlert) {
	if len(alerts) == 0 {
		return
	}

	// Build notification message
	var title, message string
	if len(alerts) == 1 {
		alert := alerts[0]
		title = fmt.Sprintf("⚠️ Hardware Alert: %s", alert.DeviceType)
		message = fmt.Sprintf("%s on %s/%s: %d → %d",
			alert.DeviceType, alert.Cluster, alert.NodeName,
			alert.PreviousCount, alert.CurrentCount)
	} else {
		critical := 0
		for _, a := range alerts {
			if a.Severity == "critical" {
				critical++
			}
		}
		title = fmt.Sprintf("⚠️ %d Hardware Alerts", len(alerts))
		if critical > 0 {
			message = fmt.Sprintf("%d critical, %d warning - devices have disappeared",
				critical, len(alerts)-critical)
		} else {
			message = fmt.Sprintf("%d devices have disappeared from nodes", len(alerts))
		}
	}

	// Build a deep link URL so clicking the notification opens the console
	consoleURL := fmt.Sprintf("http://localhost:%d/?action=hardware-health", s.config.Port)

	// Prefer terminal-notifier (supports click-to-open via -open flag).
	// Fall back to osascript display notification (no click handler support).
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[DeviceTracker] recovered from panic in notification", "panic", r)
			}
		}()

		if tnPath, err := exec.LookPath("terminal-notifier"); err == nil {
			cmd := execCommand(tnPath,
				"-title", "KubeStellar Console",
				"-subtitle", title,
				"-message", message,
				"-sound", "Glass",
				"-open", consoleURL,
				"-sender", "com.google.Chrome",
			)
			if err := cmd.Run(); err != nil {
				slog.Error("[DeviceTracker] terminal-notifier failed, falling back to osascript", "error", err)
			} else {
				return
			}
		}

		// Fallback: osascript (no click-to-open support on macOS).
		// Sanitize inputs to prevent AppleScript injection via crafted
		// Kubernetes labels (#7238). Backslash and double-quote are the
		// only characters that can escape an AppleScript string literal.
		sanitize := func(s string) string {
			s = strings.ReplaceAll(s, `\`, `\\`)
			s = strings.ReplaceAll(s, `"`, `\"`)
			return s
		}
		script := fmt.Sprintf(`display notification "%s" with title "%s" sound name "Glass"`,
			sanitize(message), sanitize(title))
		cmd := execCommand("osascript", "-e", script)
		if err := cmd.Run(); err != nil {
			slog.Error("[DeviceTracker] failed to send notification", "error", err)
		}
	}()
}

// cloudCLI describes a cloud provider CLI binary and its purpose.
type cloudCLI struct {
	Name     string `json:"name"`     // Binary name (e.g. "aws")
	Provider string `json:"provider"` // Cloud provider label
	Found    bool   `json:"found"`    // Whether the binary is on PATH
	Path     string `json:"path,omitempty"`
}

// handleCloudCLIStatus detects installed cloud CLIs (aws, gcloud, az, oc)

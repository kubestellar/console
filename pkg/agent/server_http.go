package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/settings"
)

// healthCheckHTTPClient is reused across all backend health checks to enable
// connection pooling and reduce per-request allocation overhead.
var healthCheckHTTPClient = &http.Client{Timeout: healthCheckTimeout}

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
		return http.StatusConflict, sanitizeAgentError("", err)
	case k8serrors.IsForbidden(err):
		return http.StatusForbidden, sanitizeAgentError("", err)
	case k8serrors.IsInvalid(err):
		return http.StatusBadRequest, sanitizeAgentError("", err)
	case k8serrors.IsNotFound(err):
		return http.StatusNotFound, sanitizeAgentError("", err)
	case k8serrors.IsUnauthorized(err):
		return http.StatusUnauthorized, sanitizeAgentError("", err)
	case k8serrors.IsConflict(err):
		return http.StatusConflict, sanitizeAgentError("", err)
	case k8serrors.IsTimeout(err), k8serrors.IsServerTimeout(err):
		return http.StatusGatewayTimeout, sanitizeAgentError("", err)
	case k8serrors.IsServiceUnavailable(err):
		return http.StatusServiceUnavailable, sanitizeAgentError("", err)
	default:
		return http.StatusInternalServerError, sanitizeAgentError("", err)
	}
}

// writeJSON encodes v as JSON to w; logs on failure.
func writeJSON(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

// writeJSONError writes an error response with the appropriate HTTP status code.
// Use this instead of writeJSON for error cases to ensure clients see a non-200
// status (#7275). The response body includes an "error" field with the message.
func writeJSONError(w http.ResponseWriter, statusCode int, msg string) {
	w.WriteHeader(statusCode)
	writeJSON(w, map[string]string{"error": msg})
}

// defaultCORSAllowedMethods is the Access-Control-Allow-Methods value used
// when a caller of setCORSHeaders does not supply an explicit method list.
// Historically this helper hard-coded "GET, OPTIONS", so this preserves
// back-compat for every GET-only handler that still passes no methods.
const defaultCORSAllowedMethods = "GET, OPTIONS"

// catchallCORSAllowedMethods is the Access-Control-Allow-Methods value used
// by the mux fallback ("/") preflight handler. It is intentionally the
// superset of HTTP verbs supported by any registered handler so that a
// preflight which falls through to "/" (e.g. due to a path typo or future
// route refactor) does not silently strip DELETE/PUT/PATCH from the
// browser's allowed methods. See #9155 — local-cluster delete was reported
// as blocked when the fallback advertised only "GET, POST, OPTIONS".
// Per-handler setCORSHeaders() calls still narrow this to the exact
// methods each endpoint accepts, so this superset never relaxes auth on a
// real route.
const catchallCORSAllowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

// corsPreflightMaxAge is sent as Access-Control-Max-Age so browsers cache
// preflight responses instead of re-issuing OPTIONS on every request.
// 600 s (10 min) balances responsiveness during development with reduced
// network overhead in normal use.
const corsPreflightMaxAge = "600"

// setCORSHeaders sets common CORS headers for HTTP endpoints. An optional
// list of HTTP methods may be supplied to override the default
// Access-Control-Allow-Methods value — this is required for POST/PUT/DELETE
// endpoints so browser preflight requests succeed. When no methods are
// supplied the header defaults to defaultCORSAllowedMethods.
//
// Audit rule (#8201): every handler that serves any method other than GET
// MUST pass an explicit method list including OPTIONS, e.g.
// setCORSHeaders(w, r, http.MethodPost, http.MethodOptions). Handlers that
// rely on the default and silently advertise "GET, OPTIONS" will fail
// browser preflight for cross-origin POST/DELETE requests.
func (s *Server) setCORSHeaders(w http.ResponseWriter, r *http.Request, methods ...string) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	allowed := defaultCORSAllowedMethods
	if len(methods) > 0 {
		allowed = strings.Join(methods, ", ")
	}
	w.Header().Set("Access-Control-Allow-Methods", allowed)
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
	// #10461: Credentialed requests (Authorization header) require this header
	// or browsers block the response even when the origin is allowed.
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Max-Age", corsPreflightMaxAge)
}

// corsMiddleware returns an http.Handler that sets baseline CORS headers on
// every response — including error responses produced by downstream
// middleware (e.g. requireCSRF). Without this outer wrapper the CSRF
// middleware's 403 response lacks Access-Control-Allow-Origin and browsers
// report a CORS failure instead of surfacing the actual error (#10699).
//
// The middleware also short-circuits OPTIONS preflight requests so they
// never reach requireCSRF (which would otherwise demand the
// X-Requested-With header that browsers intentionally omit from
// preflight).
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Access-Control-Allow-Methods", catchallCORSAllowedMethods)
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", corsPreflightMaxAge)

		// Short-circuit preflight: respond immediately so OPTIONS never
		// reaches requireCSRF or any handler.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// watchdogPidFileStat is indirected through a package variable so unit tests
// can substitute a fake stat without touching the real /tmp path. Production
// callers always use os.Stat.
var watchdogPidFileStat = func(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

// resolveBackendPort returns the port the backend is actually listening on.
//
// Resolution priority (highest first):
//  1. BACKEND_PORT env var (set by startup-oauth.sh when the watchdog is in use).
//  2. backendPortWatchdogMode (8081) if the watchdog PID file exists on disk.
//  3. backendPortLegacyDefault (8080) for no-watchdog deployments.
//
// Historically this file hard-coded 8080 for both the kill and health-check
// paths (#7945). That was correct before the watchdog landed, but after the
// watcher architecture (cmd/watcher/watcher.go) port 8080 became the
// reverse-proxy listener and the real backend moved to 8081. The old code
// therefore killed the watchdog instead of the backend on restart, leaving
// the real backend alive — the exact opposite of the intent.
func resolveBackendPort() int {
	if v := os.Getenv(backendPortEnvVar); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			return p
		}
	}
	if _, err := watchdogPidFileStat(watchdogPidFilePath); err == nil {
		return backendPortWatchdogMode
	}
	return backendPortLegacyDefault
}

// backendHealthURL returns the /health URL for the currently resolved backend port.
func backendHealthURL() string {
	return fmt.Sprintf("%s://%s:%d%s", backendHealthScheme, backendHealthHost, resolveBackendPort(), backendHealthPath)
}

// handleRestartBackend kills the existing backend on its resolved listen port and starts a new one.
func (s *Server) handleRestartBackend(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "POST required"})
		return
	}

	s.backendMux.Lock()
	defer s.backendMux.Unlock()

	killed := s.killBackendProcess()

	if err := s.startBackendProcess(); err != nil {
		slog.Error("[RestartBackend] failed to start backend", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{
			"success": false,
			"message": "operation failed",
		})
		return
	}

	// Wait for backend to become healthy
	time.Sleep(stabilizationDelay)
	healthy := s.checkBackendHealth()

	slog.Info("[RestartBackend] backend restarted", "killed", killed, "healthy", healthy)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"killed":  killed,
		"healthy": healthy,
	})
}

// killBackendProcess finds and kills the process listening on the backend's
// resolved listen port. See resolveBackendPort for how the port is chosen —
// in watchdog deployments this is 8081, not 8080 (#7945).
func (s *Server) killBackendProcess() bool {
	// If we have a tracked process, kill it
	if s.backendCmd != nil && s.backendCmd.Process != nil {
		s.backendCmd.Process.Kill()
		s.backendCmd.Wait()
		s.backendCmd = nil
		return true
	}

	// Fallback: find only the LISTEN process on the resolved backend port
	// (not connected clients). Using -sTCP:LISTEN ensures we only kill the
	// server, not browsers/proxies.
	// lsof is Unix-only; on Windows skip to return false (#7263, #11075).
	if isWindows() {
		return false
	}
	portArg := fmt.Sprintf(":%d", resolveBackendPort())
	const lsofTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), lsofTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "lsof", "-ti", portArg, "-sTCP:LISTEN").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		// No process found — return false so callers know nothing was killed (#7264)
		return false
	}

	killed := false
	for _, pidStr := range strings.Fields(strings.TrimSpace(string(out))) {
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
			killed = true
		}
	}

	if !killed {
		return false
	}

	time.Sleep(startupDelay)
	return true
}

// consoleBinaryEnvVar lets operators override the path to the `console` backend
// binary used when restarting the backend from kc-agent. Needed for non-standard
// installs where the binary is not next to kc-agent or on $PATH.
const consoleBinaryEnvVar = "KC_CONSOLE_BINARY"

// consoleBinaryName is the canonical filename of the backend binary produced by
// `go build ./cmd/console`.
const consoleBinaryName = "console"

// resolveConsoleBinary locates the `console` backend binary for startBackendProcess.
//
// The previous implementation re-execed `os.Executable()` which, in the
// kc-agent process, returns the kc-agent binary — NOT `cmd/console`. That
// spawned a second kc-agent that failed to bind port 8585 and never restored
// the backend (#7945). Search order:
//  1. KC_CONSOLE_BINARY env var if set.
//  2. A `console` binary next to os.Executable() — brew installs put both
//     binaries side-by-side under $(brew --prefix)/bin/.
//  3. `console` on $PATH (exec.LookPath).
//
// Returns an error if none resolve; callers must NOT fall back to self-exec
// because that silently restarts the wrong process.
func resolveConsoleBinary() (string, error) {
	if v := os.Getenv(consoleBinaryEnvVar); v != "" {
		return v, nil
	}
	if execPath, err := os.Executable(); err == nil {
		candidate := execPath[:len(execPath)-len(filepathBase(execPath))] + consoleBinaryName
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	if p, err := exec.LookPath(consoleBinaryName); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("console binary not found — cannot restart backend; please restart via startup-oauth.sh or your package manager")
}

// filepathBase is a tiny inlined replacement for filepath.Base to avoid adding
// a new import in this file — it only handles Unix-style separators because
// kc-agent's restart-backend path is Unix-only (lsof fallback already gates
// Windows out in killBackendProcess).
func filepathBase(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' || p[i] == '\\' {
			return p[i+1:]
		}
	}
	return p
}

// envWithBackendPort returns a copy of the current environment with
// BACKEND_PORT set to the resolved backend port. If BACKEND_PORT is already
// present it is replaced in place (no duplicate entries, per the Go docs on
// exec.Cmd.Env where the last value wins but duplicates are discouraged).
func envWithBackendPort(extra ...string) []string {
	backendPortKV := fmt.Sprintf("%s=%d", backendPortEnvVar, resolveBackendPort())
	src := os.Environ()
	out := make([]string, 0, len(src)+1+len(extra))
	prefix := backendPortEnvVar + "="
	replaced := false
	for _, kv := range src {
		if strings.HasPrefix(kv, prefix) {
			out = append(out, backendPortKV)
			replaced = true
			continue
		}
		out = append(out, kv)
	}
	if !replaced {
		out = append(out, backendPortKV)
	}
	out = append(out, extra...)
	return out
}

// startBackendProcess restarts the backend process.
//
// When KC_DEV_MODE=1 is set, runs `go run ./cmd/console` (dev path). Otherwise
// it locates the prebuilt `console` binary (see resolveConsoleBinary) and
// execs it. The resolved BACKEND_PORT is injected into the child environment
// so the child binds the same port the watchdog proxies to.
//
// Historically (#7265) this function re-execed os.Executable() on the
// assumption that kc-agent and the backend were the same binary. They are
// not — fixed in #7945.
func (s *Server) startBackendProcess() error {
	var cmd *exec.Cmd
	if os.Getenv("KC_DEV_MODE") == "1" {
		cmd = exec.Command("go", "run", "./cmd/console")
		cmd.Env = envWithBackendPort("GOWORK=off")
	} else {
		binary, err := resolveConsoleBinary()
		if err != nil {
			slog.Error("[Backend] cannot locate console binary for restart", "error", err)
			return err
		}
		cmd = exec.Command(binary)
		cmd.Env = envWithBackendPort()
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start backend: %w", err)
	}

	s.backendCmd = cmd

	// Reap process in background to avoid zombies
	safego.GoWith("backend-process-reaper", func() {
		cmd.Wait()
		s.backendMux.Lock()
		if s.backendCmd == cmd {
			s.backendCmd = nil
		}
		s.backendMux.Unlock()
	})

	return nil
}

// checkBackendHealth verifies the backend is responding on its resolved
// listen port (see resolveBackendPort). Previously this was pinned to 8080,
// which in watchdog deployments is the reverse proxy and NOT the real
// backend, yielding false-positive health results after a restart (#7945).
func (s *Server) checkBackendHealth() bool {
	resp, err := healthCheckHTTPClient.Get(backendHealthURL())
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// handleAutoUpdateConfig handles GET/POST for auto-update configuration.
func (s *Server) handleAutoUpdateConfig(w http.ResponseWriter, r *http.Request) {
	// #8201: GET reads config, POST writes config — preflight must advertise both.
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
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
		all, _ := mgr.GetAll()
		if all == nil {
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": "failed to read settings"})
			return
		}
		all.AutoUpdateEnabled = req.Enabled
		all.AutoUpdateChannel = req.Channel
		if err := mgr.SaveAll(all); err != nil {
			slog.Error("failed to save auto-update config", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, map[string]string{"error": "failed to save settings"})
			return
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
		w.WriteHeader(http.StatusNoContent)
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
		w.WriteHeader(http.StatusNoContent)
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
		w.WriteHeader(http.StatusNoContent)
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

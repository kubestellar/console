package agent

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/fileutil"
)

func (s *Server) checkClaudeAvailable() bool {
	// Check if any AI provider is available
	return s.registry.HasAvailableProviders()
}

// getClaudeInfo returns AI provider info (for backward compatibility)
func (s *Server) getClaudeInfo() *protocol.ClaudeInfo {
	if !s.registry.HasAvailableProviders() {
		return nil
	}

	// Return info about available providers
	available := s.registry.ListAvailable()
	var providerNames []string
	for _, p := range available {
		providerNames = append(providerNames, p.DisplayName)
	}

	// Get current token usage
	s.tokenMux.RLock()
	sessionIn := s.sessionTokensIn
	sessionOut := s.sessionTokensOut
	todayIn := s.todayTokensIn
	todayOut := s.todayTokensOut
	s.tokenMux.RUnlock()

	return &protocol.ClaudeInfo{
		Installed: true,
		Version:   fmt.Sprintf("Multi-agent: %s", strings.Join(providerNames, ", ")),
		TokenUsage: protocol.TokenUsage{
			Session: protocol.TokenCount{
				Input:  sessionIn,
				Output: sessionOut,
			},
			Today: protocol.TokenCount{
				Input:  todayIn,
				Output: todayOut,
			},
		},
	}
}

// isSessionQuotaExceeded returns true when the aggregate session token count
// (input + output) has reached or passed the configured quota. A quota of 0
// means unlimited — the check is skipped (#9438).
func (s *Server) isSessionQuotaExceeded() bool {
	if s.sessionTokenQuota <= 0 {
		return false // unlimited
	}
	s.tokenMux.Lock()
	total := s.sessionTokensIn + s.sessionTokensOut
	s.tokenMux.Unlock()
	return total >= s.sessionTokenQuota
}

// sessionTokenQuotaMessage builds a human-readable error string returned to
// the client when the session token quota is exceeded.
func (s *Server) sessionTokenQuotaMessage() string {
	return fmt.Sprintf(
		"Session token quota exceeded (limit: %d tokens). "+
			"Restart kc-agent to reset the session quota, or increase "+
			"the limit via the %s environment variable.",
		s.sessionTokenQuota, sessionTokenQuotaEnvVar)
}

// tokenUsageFlushInterval is how often accumulated in-memory token usage
// is flushed to disk. Batching prevents high-frequency disk I/O when many
// AI responses arrive in quick succession (#9483).
const tokenUsageFlushInterval = 5 * time.Second

// addTokenUsage accumulates token usage from a chat response.
// Instead of writing to disk on every call, it schedules a debounced
// flush that fires after tokenUsageFlushInterval of inactivity (#9483).
func (s *Server) addTokenUsage(usage *ProviderTokenUsage) {
	if usage == nil {
		return
	}

	s.tokenMux.Lock()

	// Check if day changed - reset daily counters
	today := time.Now().Format("2006-01-02")
	if today != s.todayDate {
		s.todayDate = today
		s.todayTokensIn = 0
		s.todayTokensOut = 0
	}

	// Accumulate tokens
	s.sessionTokensIn += int64(usage.InputTokens)
	s.sessionTokensOut += int64(usage.OutputTokens)
	s.todayTokensIn += int64(usage.InputTokens)
	s.todayTokensOut += int64(usage.OutputTokens)

	// Schedule a non-resetting flush: if no timer is pending, start one.
	// Unlike the previous debounce that reset on every call (#9616), this
	// guarantees the flush fires within tokenUsageFlushInterval of the FIRST
	// token update, preventing unbounded data loss if tokens arrive faster
	// than the interval.
	if s.tokenFlushTimer == nil {
		s.tokenFlushTimer = time.AfterFunc(tokenUsageFlushInterval, func() {
			s.tokenMux.Lock()
			s.tokenFlushTimer = nil
			s.tokenMux.Unlock()
			s.saveTokenUsage()
		})
	}

	s.tokenMux.Unlock()
}

// tokenUsageData is persisted to disk
type tokenUsageData struct {
	Date      string `json:"date"`
	InputIn   int64  `json:"inputIn"`
	OutputOut int64  `json:"outputOut"`
}

// getTokenUsagePath returns the path to the token usage file
func getTokenUsagePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp/kc-agent-tokens.json"
	}
	return home + "/.kc-agent-tokens.json"
}

// tokenUsageLockSuffix is appended to the token usage file path to form
// the advisory lock file path used by flock (#9730).
const tokenUsageLockSuffix = ".lock"

// loadTokenUsage loads token usage from disk on startup.
// An advisory file lock (flock) is held during the read to prevent
// observing a partially-written file from a concurrent instance (#9730).
func (s *Server) loadTokenUsage() {
	path := getTokenUsagePath()
	lockPath := path + tokenUsageLockSuffix

	release, err := acquireFileLock(lockPath)
	if err != nil {
		slog.Warn("could not acquire file lock for token load", "error", err)
		// Fall through to best-effort unlocked read so a single-instance
		// deployment is not broken by a lock failure.
	}
	if release != nil {
		defer release()
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return // File doesn't exist yet
	}

	var usage tokenUsageData
	if err := json.Unmarshal(data, &usage); err != nil {
		slog.Warn("could not parse token usage file", "error", err)
		return
	}

	s.tokenMux.Lock()
	defer s.tokenMux.Unlock()

	// Only load if same day
	today := time.Now().Format("2006-01-02")
	if usage.Date == today {
		s.todayTokensIn = usage.InputIn
		s.todayTokensOut = usage.OutputOut
		s.todayDate = today
		// Seed lastSaved so the first saveTokenUsage computes the correct
		// delta relative to what was already on disk (#9730).
		s.lastSavedIn = usage.InputIn
		s.lastSavedOut = usage.OutputOut
		slog.Info("loaded token usage", "inputTokens", usage.InputIn, "outputTokens", usage.OutputOut)
	}
}

// saveTokenUsage persists token usage to disk.
//
// To prevent multi-instance data corruption (#9730), this function:
//  1. Acquires an inter-process advisory file lock (flock / LockFileEx).
//  2. Reads the current on-disk state (which may include writes from other
//     instances since our last save).
//  3. Computes the delta this instance has accumulated since its last save.
//  4. Merges the delta into the on-disk totals.
//  5. Writes the merged result back and releases the lock.
//
// tokenFileMux continues to serialize concurrent goroutines within this
// process (#9441); flock serializes across OS processes.
func (s *Server) saveTokenUsage() {
	s.tokenFileMux.Lock()
	defer s.tokenFileMux.Unlock()

	path := getTokenUsagePath()
	lockPath := path + tokenUsageLockSuffix

	// Acquire inter-process lock (#9730).
	release, lockErr := acquireFileLock(lockPath)
	if lockErr != nil {
		slog.Warn("could not acquire file lock for token save", "error", lockErr)
		// Fall through to best-effort unlocked write for single-instance
		// deployments where flock is unavailable (e.g. NFS without lock
		// daemon). The in-process tokenFileMux still prevents goroutine races.
	}
	if release != nil {
		defer release()
	}

	// Snapshot current in-memory counters.
	s.tokenMux.Lock()
	currentDate := s.todayDate
	currentIn := s.todayTokensIn
	currentOut := s.todayTokensOut
	prevSavedIn := s.lastSavedIn
	prevSavedOut := s.lastSavedOut
	s.tokenMux.Unlock()

	// Compute the delta this instance accumulated since its last save.
	deltaIn := currentIn - prevSavedIn
	deltaOut := currentOut - prevSavedOut

	// Read on-disk state (may contain writes from other instances).
	var onDisk tokenUsageData
	if diskData, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(diskData, &onDisk)
	}

	// Merge: if the on-disk date matches, add our delta to the on-disk
	// totals. Otherwise start fresh for the new day.
	merged := tokenUsageData{Date: currentDate}
	if onDisk.Date == currentDate {
		merged.InputIn = onDisk.InputIn + deltaIn
		merged.OutputOut = onDisk.OutputOut + deltaOut
	} else {
		merged.InputIn = deltaIn
		merged.OutputOut = deltaOut
	}

	data, err := json.Marshal(merged)
	if err != nil {
		return
	}

	// Atomic write: temp file → fsync → rename to avoid corruption
	// if the process is killed mid-write (#6996).
	if err := fileutil.AtomicWriteFile(path, data, agentFileMode); err != nil {
		slog.Warn("could not write token usage file", "error", err)
		return
	}

	// Update last-saved watermarks so the next save computes the correct
	// delta. Also update in-memory counters to reflect the merged on-disk
	// totals (includes other instances' contributions).
	s.tokenMux.Lock()
	s.lastSavedIn = currentIn
	s.lastSavedOut = currentOut
	// If another instance wrote tokens while we held the lock, our
	// in-memory view should reflect the merged total so that getClaudeInfo
	// reports accurate numbers.
	if currentDate == s.todayDate {
		s.todayTokensIn = merged.InputIn
		s.todayTokensOut = merged.OutputOut
		// Re-base lastSaved to merged totals so the next delta is correct.
		s.lastSavedIn = merged.InputIn
		s.lastSavedOut = merged.OutputOut
	}
	s.tokenMux.Unlock()
}

// extractCommandsFromResponse parses an LLM thinking response to find
// executable commands. It handles multiple formats (#9440):
//   - Lines prefixed with "CMD: ", "CMD:", "Command: ", "command:" (case-insensitive)
//   - kubectl/helm/oc commands inside markdown fenced code blocks (```...```)
//   - Bare kubectl/helm/oc commands on standalone lines
func extractCommandsFromResponse(content string) []string {
	var commands []string
	seen := make(map[string]bool) // deduplicate commands
	inCodeBlock := false

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)

		// Track markdown fenced code block boundaries
		if strings.HasPrefix(trimmed, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}

		// 1. Check for CMD:/Command: prefix (case-insensitive)
		if m := cmdPrefixRe.FindStringSubmatch(trimmed); m != nil {
			cmd := strings.TrimSpace(m[1])
			if cmd != "" && !seen[cmd] {
				seen[cmd] = true
				commands = append(commands, cmd)
			}
			continue
		}

		// 2. Inside a code block, accept kubectl/helm/oc commands
		if inCodeBlock {
			if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
				seen[trimmed] = true
				commands = append(commands, trimmed)
			}
			continue
		}

		// 3. Bare kubectl/helm/oc commands outside code blocks (standalone lines)
		if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
			seen[trimmed] = true
			commands = append(commands, trimmed)
		}
	}

	return commands
}

// KeyStatus represents the status of an API key for a provider
type KeyStatus struct {
	Provider    string `json:"provider"`
	DisplayName string `json:"displayName"`
	Configured  bool   `json:"configured"`
	Source      string `json:"source,omitempty"` // "env" or "config"
	Valid       *bool  `json:"valid,omitempty"`  // nil = not tested, true/false = test result
	Error       string `json:"error,omitempty"`
	// BaseURL is the currently-resolved base URL for this provider (env var,
	// then ~/.kc/config.yaml, then compiled default). Empty when the provider
	// does not support a base URL override (vendor HTTP APIs).
	BaseURL string `json:"baseURL,omitempty"`
	// BaseURLEnvVar is the environment variable this provider honors for
	// base URL overrides (e.g. "OLLAMA_URL", "GROQ_BASE_URL"). Empty when
	// the provider has no base URL override. Surfaced to the UI so the
	// Advanced section can show the env var name as an operator hint.
	BaseURLEnvVar string `json:"baseURLEnvVar,omitempty"`
	// BaseURLSource is "env" when the current BaseURL value came from the
	// env var, "config" when it came from ~/.kc/config.yaml, or empty when
	// the resolved value is the compiled-in default.
	BaseURLSource string `json:"baseURLSource,omitempty"`
}

// KeysStatusResponse is the response for GET /settings/keys.
// RegisteredProviders is populated from the live agent registry so the
// frontend settings UI can display only providers that are actually
// registered in the backend, avoiding stale hardcoded lists (#9488).
type KeysStatusResponse struct {
	Keys                []KeyStatus    `json:"keys"`
	ConfigPath          string         `json:"configPath"`
	RegisteredProviders []ProviderInfo `json:"registeredProviders"`
}

// SetKeyRequest is the request body for POST /settings/keys.
// Setting APIKey requires a valid key; setting BaseURL is independent
// (operators can configure a base URL without an API key, which is the
// common path for unauthenticated local LLM runners).
//
// To clear a previously-set base URL (reverting to the compiled-in default),
// set ClearBaseURL=true with an empty BaseURL. This avoids the "missing
// field" guard that rejects requests where all three fields are empty (#8259).
type SetKeyRequest struct {
	Provider     string `json:"provider"`
	APIKey       string `json:"apiKey,omitempty"`
	Model        string `json:"model,omitempty"`
	BaseURL      string `json:"baseURL,omitempty"`
	ClearBaseURL bool   `json:"clearBaseURL,omitempty"`
}

// handleSettingsKeys handles GET and POST for /settings/keys

// Package tokentracker encapsulates AI token usage accounting — tracking
// session and daily token consumption, persisting to disk with inter-process
// locking, and enforcing session quotas.
package tokentracker

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/fileutil"
)

// FlushInterval is how often accumulated in-memory token usage is flushed
// to disk. Batching prevents high-frequency disk I/O when many AI responses
// arrive in quick succession (#9483).
const FlushInterval = 5 * time.Second

// SessionQuotaEnvVar is the environment variable operators can set to
// limit per-session token consumption.
const SessionQuotaEnvVar = "KC_SESSION_TOKEN_QUOTA"

// fileMode is the permission bits for the token usage file.
const fileMode = 0600

// lockSuffix is appended to the token usage file path to form the
// advisory lock file path used by flock (#9730).
const lockSuffix = ".lock"

// Tracker manages token usage accounting for the agent server.
// It is safe for concurrent use.
type Tracker struct {
	mu            sync.RWMutex
	fileMu        sync.Mutex  // serializes file I/O (#9441)
	flushTimer    *time.Timer // debounced flush timer (#9483)
	sessionStart  time.Time
	sessionIn     int64
	sessionOut    int64
	todayIn       int64
	todayOut      int64
	todayDate     string // YYYY-MM-DD
	lastSavedIn   int64  // for delta computation (#9730)
	lastSavedOut  int64  // for delta computation (#9730)
	sessionQuota  int64  // 0 = unlimited (#9438)
}

// New creates a Tracker with the given session quota (0 = unlimited).
func New(sessionQuota int64) *Tracker {
	return &Tracker{
		sessionStart: time.Now(),
		sessionQuota: sessionQuota,
	}
}

// AddUsage accumulates token usage from a chat response.
// Instead of writing to disk on every call, it schedules a debounced
// flush that fires after FlushInterval of inactivity (#9483).
func (t *Tracker) AddUsage(usage *ai.ProviderTokenUsage) {
	if usage == nil {
		return
	}

	t.mu.Lock()

	// Check if day changed — reset daily counters
	today := time.Now().Format("2006-01-02")
	if today != t.todayDate {
		t.todayDate = today
		t.todayIn = 0
		t.todayOut = 0
	}

	// Accumulate tokens
	t.sessionIn += int64(usage.InputTokens)
	t.sessionOut += int64(usage.OutputTokens)
	t.todayIn += int64(usage.InputTokens)
	t.todayOut += int64(usage.OutputTokens)

	// Schedule a non-resetting flush (#9616).
	if t.flushTimer == nil {
		t.flushTimer = time.AfterFunc(FlushInterval, func() {
			t.mu.Lock()
			t.flushTimer = nil
			t.mu.Unlock()
			t.Save()
		})
	}

	t.mu.Unlock()
}

// IsQuotaExceeded returns true when the aggregate session token count
// has reached or passed the configured quota. A quota of 0 means
// unlimited (#9438).
func (t *Tracker) IsQuotaExceeded() bool {
	if t.sessionQuota <= 0 {
		return false
	}
	t.mu.RLock()
	total := t.sessionIn + t.sessionOut
	t.mu.RUnlock()
	return total >= t.sessionQuota
}

// QuotaMessage builds a human-readable error string returned to the
// client when the session token quota is exceeded.
func (t *Tracker) QuotaMessage() string {
	return fmt.Sprintf(
		"Session token quota exceeded (limit: %d tokens). "+
			"Restart kc-agent to reset the session quota, or increase "+
			"the limit via the %s environment variable.",
		t.sessionQuota, SessionQuotaEnvVar)
}

// GetUsage returns current token usage counters.
func (t *Tracker) GetUsage() (sessionIn, sessionOut, todayIn, todayOut int64) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.sessionIn, t.sessionOut, t.todayIn, t.todayOut
}

// usageData is persisted to disk.
type usageData struct {
	Date      string `json:"date"`
	InputIn   int64  `json:"inputIn"`
	OutputOut int64  `json:"outputOut"`
}

// usagePath returns the path to the token usage file.
func usagePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp/kc-agent-tokens.json"
	}
	return home + "/.kc-agent-tokens.json"
}

// Load loads token usage from disk on startup.
func (t *Tracker) Load() {
	path := usagePath()
	lockPath := path + lockSuffix

	release, err := acquireFileLock(lockPath)
	if err != nil {
		slog.Warn("could not acquire file lock for token load", "error", err)
	}
	if release != nil {
		defer release()
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return // File doesn't exist yet
	}

	var usage usageData
	if err := json.Unmarshal(data, &usage); err != nil {
		slog.Warn("could not parse token usage file", "error", err)
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	today := time.Now().Format("2006-01-02")
	if usage.Date == today {
		t.todayIn = usage.InputIn
		t.todayOut = usage.OutputOut
		t.todayDate = today
		t.lastSavedIn = usage.InputIn
		t.lastSavedOut = usage.OutputOut
		slog.Info("loaded token usage", "inputTokens", usage.InputIn, "outputTokens", usage.OutputOut)
	}
}

// Save persists token usage to disk with inter-process locking (#9730).
func (t *Tracker) Save() {
	t.fileMu.Lock()
	defer t.fileMu.Unlock()

	path := usagePath()
	lockPath := path + lockSuffix

	release, lockErr := acquireFileLock(lockPath)
	if lockErr != nil {
		slog.Warn("could not acquire file lock for token save", "error", lockErr)
	}
	if release != nil {
		defer release()
	}

	// Snapshot current in-memory counters.
	t.mu.Lock()
	currentDate := t.todayDate
	currentIn := t.todayIn
	currentOut := t.todayOut
	prevSavedIn := t.lastSavedIn
	prevSavedOut := t.lastSavedOut
	t.mu.Unlock()

	// Compute delta since last save.
	deltaIn := currentIn - prevSavedIn
	deltaOut := currentOut - prevSavedOut

	// Read on-disk state (may contain writes from other instances).
	var onDisk usageData
	if diskData, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(diskData, &onDisk); err != nil {
			slog.Warn("could not parse token usage file during save", "path", path, "error", err)
		}
	}

	// Merge: add delta to on-disk totals if same day, else start fresh.
	merged := usageData{Date: currentDate}
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

	if err := fileutil.AtomicWriteFile(path, data, fileMode); err != nil {
		slog.Warn("could not write token usage file", "error", err)
		return
	}

	// Update watermarks.
	t.mu.Lock()
	t.lastSavedIn = currentIn
	t.lastSavedOut = currentOut
	if currentDate == t.todayDate {
		t.todayIn = merged.InputIn
		t.todayOut = merged.OutputOut
		t.lastSavedIn = merged.InputIn
		t.lastSavedOut = merged.OutputOut
	}
	t.mu.Unlock()
}

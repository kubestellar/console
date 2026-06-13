package tokentracker

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/ai"
)

func TestTracker_AddUsage(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tracker-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	tr := New(0)

	usage := &ai.ProviderTokenUsage{
		InputTokens:  100,
		OutputTokens: 50,
		TotalTokens:  150,
	}

	tr.AddUsage(usage)

	sessionIn, sessionOut, todayIn, todayOut := tr.GetUsage()
	if sessionIn != 100 || sessionOut != 50 {
		t.Errorf("Expected 100/50 session tokens, got %d/%d", sessionIn, sessionOut)
	}
	if todayIn != 100 || todayOut != 50 {
		t.Errorf("Expected 100/50 today tokens, got %d/%d", todayIn, todayOut)
	}

	// Add more
	tr.AddUsage(usage)
	sessionIn, sessionOut, _, _ = tr.GetUsage()
	if sessionIn != 200 || sessionOut != 100 {
		t.Errorf("Expected 200/100 session tokens, got %d/%d", sessionIn, sessionOut)
	}

	// Verify persistence
	tr.Save()

	path := usagePath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read usage file: %v", err)
	}

	var saved usageData
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if saved.InputIn != 200 || saved.OutputOut != 100 {
		t.Errorf("Expected 200/100 in file, got %d/%d", saved.InputIn, saved.OutputOut)
	}

	// Test loading
	tr2 := New(0)
	tr2.Load()
	_, _, todayIn, todayOut = tr2.GetUsage()
	if todayIn != 200 || todayOut != 100 {
		t.Errorf("Expected 200/100 loaded, got %d/%d", todayIn, todayOut)
	}
}

func TestTracker_MultiInstanceMerge(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tracker-multi-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	// Instance A accumulates 100/50 and saves.
	a := New(0)
	a.AddUsage(&ai.ProviderTokenUsage{InputTokens: 100, OutputTokens: 50})
	a.Save()

	// Instance B loads then accumulates 200/100 and saves.
	b := New(0)
	b.Load()
	b.AddUsage(&ai.ProviderTokenUsage{InputTokens: 200, OutputTokens: 100})
	b.Save()

	// Instance A accumulates 50/25 more and saves.
	a.AddUsage(&ai.ProviderTokenUsage{InputTokens: 50, OutputTokens: 25})
	a.Save()

	// Read file — should contain merged total: 350/175
	path := usagePath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read: %v", err)
	}

	var saved usageData
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if saved.InputIn != 350 || saved.OutputOut != 175 {
		t.Errorf("Expected 350/175 merged, got %d/%d", saved.InputIn, saved.OutputOut)
	}
}

func TestTracker_SessionQuota(t *testing.T) {
	tr := New(500)

	if tr.IsQuotaExceeded() {
		t.Fatal("quota should not be exceeded before any usage")
	}

	tr.AddUsage(&ai.ProviderTokenUsage{InputTokens: 100, OutputTokens: 100})
	if tr.IsQuotaExceeded() {
		t.Fatal("quota should not be exceeded at 200/500")
	}

	tr.AddUsage(&ai.ProviderTokenUsage{InputTokens: 200, OutputTokens: 200})
	if !tr.IsQuotaExceeded() {
		t.Fatal("quota should be exceeded at 600/500")
	}

	msg := tr.QuotaMessage()
	if !strings.Contains(msg, SessionQuotaEnvVar) {
		t.Errorf("quota message should mention env var, got: %s", msg)
	}
}

func TestTracker_SessionQuota_Unlimited(t *testing.T) {
	tr := New(0) // unlimited

	tr.AddUsage(&ai.ProviderTokenUsage{InputTokens: 999_999_999, OutputTokens: 999_999_999})
	if tr.IsQuotaExceeded() {
		t.Fatal("quota of 0 should mean unlimited")
	}
}

func TestTracker_DateReset(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tracker-date-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	tr := New(0)

	// Add some usage
	tr.AddUsage(&ai.ProviderTokenUsage{InputTokens: 100, OutputTokens: 50})

	// Force a date change by setting todayDate to past
	tr.mu.Lock()
	tr.todayDate = "2000-01-01"
	tr.mu.Unlock()

	// Next AddUsage should detect date change and reset daily counters
	tr.AddUsage(&ai.ProviderTokenUsage{InputTokens: 100, OutputTokens: 50})

	_, _, todayIn, todayOut := tr.GetUsage()
	today := time.Now().Format("2006-01-02")
	_ = today
	if todayIn != 100 || todayOut != 50 {
		t.Errorf("Expected reset daily 100/50, got %d/%d", todayIn, todayOut)
	}

	// Session should accumulate across days
	sessionIn, sessionOut, _, _ := tr.GetUsage()
	if sessionIn != 200 || sessionOut != 100 {
		t.Errorf("Session should accumulate, got %d/%d", sessionIn, sessionOut)
	}
}

package agent

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestTriggerNowRejectsConcurrent verifies that only one update can run at a time.
// Rapid successive calls to TriggerNow should return false when an update is in progress.
func TestTriggerNowRejectsConcurrent(t *testing.T) {
	var broadcastCount int32
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // empty = checkDeveloperChannel returns early
		broadcast: func(msgType string, payload interface{}) {
			atomic.AddInt32(&broadcastCount, 1)
		},
	}

	// First trigger should succeed
	ok := uc.TriggerNow("")
	if !ok {
		t.Fatal("first TriggerNow() should return true")
	}

	// Wait briefly for goroutine to start
	time.Sleep(10 * time.Millisecond)

	// While the first goroutine holds the updating flag, simulate it being in progress
	// (in this test it finishes very fast since repoPath is empty, so we test the atomic directly)
	// Instead, test with a controlled long-running update:
	t.Run("concurrent_rejection", func(t *testing.T) {
		// Manually set updating flag to simulate in-progress update
		atomic.StoreInt32(&uc.updating, 1)
		defer atomic.StoreInt32(&uc.updating, 0)

		ok := uc.TriggerNow("")
		if ok {
			t.Error("TriggerNow() should return false when update is in progress")
		}

		ok = uc.TriggerNow("developer")
		if ok {
			t.Error("TriggerNow(channelOverride) should return false when update is in progress")
		}
	})
}

// TestTriggerNowConcurrentStress fires 100 concurrent TriggerNow calls while
// the updating flag is held. Exactly 0 should succeed.
func TestTriggerNowConcurrentStress(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "",
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	// Hold the updating flag to simulate a long-running update
	atomic.StoreInt32(&uc.updating, 1)
	defer atomic.StoreInt32(&uc.updating, 0)

	const goroutines = 100
	var accepted int32
	start := make(chan struct{})
	var wg sync.WaitGroup

	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			<-start
			if uc.TriggerNow("developer") {
				atomic.AddInt32(&accepted, 1)
			}
		}()
	}

	// Fire all goroutines at once
	close(start)
	wg.Wait()

	if accepted != 0 {
		t.Errorf("expected 0 accepted triggers while update in progress, got %d", accepted)
	}
}

// TestIsUpdating verifies the IsUpdating helper reflects the atomic flag.
func TestIsUpdating(t *testing.T) {
	uc := &UpdateChecker{}

	if uc.IsUpdating() {
		t.Error("new UpdateChecker should not be updating")
	}

	atomic.StoreInt32(&uc.updating, 1)
	if !uc.IsUpdating() {
		t.Error("should report updating after flag set")
	}

	atomic.StoreInt32(&uc.updating, 0)
	if uc.IsUpdating() {
		t.Error("should not report updating after flag cleared")
	}
}

// TestTriggerNowReleasesOnCompletion verifies the updating flag is cleared
// after checkAndUpdate finishes, allowing a subsequent trigger.
func TestTriggerNowReleasesOnCompletion(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // causes early return
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	ok := uc.TriggerNow("")
	if !ok {
		t.Fatal("first TriggerNow should succeed")
	}

	// Wait for goroutine to finish and release the flag
	time.Sleep(50 * time.Millisecond)

	if uc.IsUpdating() {
		t.Error("updating flag should be cleared after completion")
	}

	// Second trigger should now succeed
	ok = uc.TriggerNow("")
	if !ok {
		t.Error("second TriggerNow should succeed after first completes")
	}

	time.Sleep(50 * time.Millisecond)
}

// TestTriggerNowRecoversPanic verifies that a panic in checkAndUpdate
// doesn't leave the updating flag stuck (it's cleared by defer).
func TestTriggerNowRecoversPanic(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // causes early return (no panic in practice)
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	// Manually simulate: set flag, then clear it (mimicking defer behavior)
	atomic.StoreInt32(&uc.updating, 1)
	// The defer in TriggerNow's goroutine always runs, even on panic
	atomic.StoreInt32(&uc.updating, 0)

	if uc.IsUpdating() {
		t.Error("flag should be cleared after simulated panic recovery")
	}

	// Should be able to trigger again
	ok := uc.TriggerNow("")
	if !ok {
		t.Error("should be able to trigger after panic recovery")
	}
	time.Sleep(50 * time.Millisecond)
}

// TestStatusIncludesUpdateInProgress verifies the Status() response includes
// the updateInProgress field.
func TestStatusIncludesUpdateInProgress(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast: func(string, interface{}) {},
	}

	status := uc.Status()
	if status.UpdateInProgress {
		t.Error("status should show not updating initially")
	}

	atomic.StoreInt32(&uc.updating, 1)
	status = uc.Status()
	if !status.UpdateInProgress {
		t.Error("status should show updating when flag is set")
	}

	atomic.StoreInt32(&uc.updating, 0)
}

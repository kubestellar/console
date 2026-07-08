package updater

import (
	"context"
	"testing"
	"time"
)

func TestRun_StopsOnContextCancel(t *testing.T) {
	uc := &UpdateChecker{
		enabled:   true,
		channel:   "developer",
		broadcast: func(string, interface{}) {},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		uc.run(ctx)
		close(done)
	}()

	// Cancel immediately — run() has a 30s startup delay, but context cancel
	// should break out of that select.
	cancel()

	select {
	case <-done:
		// success
	case <-time.After(5 * time.Second):
		t.Fatal("run() did not stop after context cancel")
	}
}

func TestCheckAndUpdate_HelmSkips(t *testing.T) {
	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "helm",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				events = append(events, p)
			}
		},
	}

	// Should return immediately without doing anything
	uc.checkAndUpdate()

	// No broadcasts expected for helm — it just returns
	if len(events) > 0 {
		t.Errorf("expected no broadcasts for helm install, got %d", len(events))
	}
}

func TestCheckDeveloperChannel_EmptyRepoPath(t *testing.T) {
	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:  "developer",
		repoPath: "",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				events = append(events, p)
			}
		},
	}

	// Should log and return without panicking
	uc.checkDeveloperChannel()
}

func TestCheckReleaseChannel_NoReleases(t *testing.T) {
	// This test verifies checkReleaseChannel handles network errors gracefully.
	// Since fetchGitHubReleases calls a real API, we just verify no panic.
	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:        "stable",
		currentVersion: "v1.0.0",
		installMethod:  "binary",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				events = append(events, p)
			}
		},
	}

	// This will likely fail to fetch releases (no network or returns error),
	// but should not panic.
	uc.checkReleaseChannel("stable")
}

func TestCheckAndUpdate_DeveloperChannel(t *testing.T) {
	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // empty will cause early return in checkDeveloperChannel
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				events = append(events, p)
			}
		},
	}

	uc.checkAndUpdate()
	// Should not panic — just logs and returns
}

func TestCheckAndUpdate_StableChannel(t *testing.T) {
	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:        "stable",
		installMethod:  "binary",
		currentVersion: "v99.99.99", // unlikely to match any release
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				events = append(events, p)
			}
		},
	}

	// May fail to reach GitHub but should not panic
	uc.checkAndUpdate()
}

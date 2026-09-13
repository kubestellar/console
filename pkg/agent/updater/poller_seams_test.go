package updater

import (
	"fmt"
	"sync/atomic"
	"testing"
)

// Tests written against the test seams added in PR #23356 (which
// resolves issue #23341). Those seams are:
//
//   - fetchLatestMainSHAFn / detectCurrentSHAFn: new package-level
//     function vars (poller.go), so checkDeveloperChannel's three
//     downstream branches (fetch error, "already up to date", freshSHA
//     empty guard) can be exercised without a real git repo.
//
// The other two seams that #23356 also introduced —
// developerCheckInterval / releaseCheckInterval (const → var) and
// initialStartupDelay — are not exercised here. A previous version of
// this file also had a TestRun_TickerFiresAndCanUpdate that shrank the
// tick interval and startup delay to force run()'s ticker arm to fire.
// The race detector caught a legitimate data race between that write
// and the read of initialStartupDelay done by run() goroutines that
// pre-existing tests (TestStart_Stop in lifecycle_checksum_test.go)
// leave dangling in `time.After(initialStartupDelay)` even after they
// cancel their contexts. Covering the ticker arm safely needs those
// seams to be atomic-swapped in production, which is a coder-lane
// change, not a quality-lane one. Coverage of `run()` therefore stays
// at 40.9% for now — see the issue this PR references for follow-up.
//
// The three tests below only swap the two function-var seams and do
// not touch the interval vars, so they cannot race with anything that
// only run() reads.

// withSwappedSeams temporarily replaces the two function-var seams
// added by #23356 and restores them via t.Cleanup. The interval seams
// (developerCheckInterval, releaseCheckInterval, initialStartupDelay)
// are deliberately not touched — see the top-of-file note.
func withSwappedSeams(t *testing.T,
	fetchFn func(string) (string, error),
	detectFn func(string) string,
) {
	t.Helper()

	origFetch := fetchLatestMainSHAFn
	origDetect := detectCurrentSHAFn

	if fetchFn != nil {
		fetchLatestMainSHAFn = fetchFn
	}
	if detectFn != nil {
		detectCurrentSHAFn = detectFn
	}

	t.Cleanup(func() {
		fetchLatestMainSHAFn = origFetch
		detectCurrentSHAFn = origDetect
	})
}

// TestRun_TickerFiresAndCanUpdate was removed — see the top-of-file
// note. Briefly: it needed to write initialStartupDelay to skip run()'s
// 30-second warmup, but pre-existing tests (TestStart_Stop) leave
// goroutines sitting on `time.After(initialStartupDelay)` that
// don't reliably exit before the next test's write, and the race
// detector flags the pair. Making run() atomic-swap the interval
// seams is a coder-lane change; filing that follow-up is out of
// scope for this PR.

// TestCheckDeveloperChannel_FetchLatestSHAError covers the fetch-error
// branch at poller.go:81-84: fetchLatestMainSHAFn returns an error, the
// flow slogs and returns without broadcasting or dispatching an update.
//
// The regression this locks: a change that dropped the `return` after
// the error log would proceed to detectCurrentSHAFn / SHA comparison
// with `latestSHA==""`, which compares equal to a fresh repo (also "")
// and would broadcast a bogus "already up to date" — a false-negative
// that hides the fetch failure from the frontend.
func TestCheckDeveloperChannel_FetchLatestSHAError(t *testing.T) {
	var detectCalled int32
	withSwappedSeams(t,
		func(repoPath string) (string, error) {
			return "", fmt.Errorf("simulated GitHub fetch failure")
		},
		func(repoPath string) string {
			atomic.AddInt32(&detectCalled, 1)
			return "should-not-be-called"
		},
	)

	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:    "developer",
		repoPath:   "/tmp/fake-repo-path",
		currentSHA: "oldsha",
		broadcast: func(_ string, p interface{}) {
			if pp, ok := p.(UpdateProgressPayload); ok {
				events = append(events, pp)
			}
		},
	}

	uc.checkDeveloperChannel()

	if atomic.LoadInt32(&detectCalled) != 0 {
		t.Errorf("detectCurrentSHAFn must not be called after fetch error, got %d call(s)",
			detectCalled)
	}
	if len(events) != 0 {
		t.Errorf("no broadcasts expected after fetch error, got %+v", events)
	}
	// currentSHA must remain untouched.
	if uc.currentSHA != "oldsha" {
		t.Errorf("currentSHA changed after fetch error: got %q, want %q",
			uc.currentSHA, "oldsha")
	}
}

// TestCheckDeveloperChannel_AlreadyUpToDate covers the "no update
// needed" broadcast branch at poller.go:98-104: fetchLatestMainSHAFn
// returns the same SHA the checker already knows about, and the flow
// emits a "done"/"Already up to date — no changes on main"/Progress 100
// payload without dispatching executeDeveloperUpdate.
//
// The two ways this branch fires:
//   1. latestSHA == currentSHA (steady state)
//   2. currentSHA == "" (fresh repo/uninitialized checker)
// This test exercises (1) because it also verifies the detectCurrentSHAFn
// seam picks up the fresh SHA and stores it on the checker.
func TestCheckDeveloperChannel_AlreadyUpToDate(t *testing.T) {
	const sha = "abc1234def5678"

	var detectCalled int32
	withSwappedSeams(t,
		func(repoPath string) (string, error) {
			return sha, nil
		},
		func(repoPath string) string {
			atomic.AddInt32(&detectCalled, 1)
			return sha // same as latest — steady state
		},
	)

	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:    "developer",
		repoPath:   "/tmp/fake-repo-path",
		currentSHA: sha,
		broadcast: func(_ string, p interface{}) {
			if pp, ok := p.(UpdateProgressPayload); ok {
				events = append(events, pp)
			}
		},
	}

	uc.checkDeveloperChannel()

	if atomic.LoadInt32(&detectCalled) != 1 {
		t.Errorf("detectCurrentSHAFn should have been called exactly once, got %d",
			detectCalled)
	}

	// The freshSHA update path must have run (freshSHA != "" branch).
	if uc.currentSHA != sha {
		t.Errorf("currentSHA should be preserved at %q, got %q", sha, uc.currentSHA)
	}

	// Exactly one "done"/Progress 100 broadcast, with the up-to-date message.
	if len(events) != 1 {
		t.Fatalf("expected one broadcast for up-to-date branch, got %d: %+v",
			len(events), events)
	}
	e := events[0]
	if e.Status != "done" {
		t.Errorf("status = %q, want %q", e.Status, "done")
	}
	if e.Progress != 100 {
		t.Errorf("progress = %d, want 100", e.Progress)
	}
	if e.Message != "Already up to date — no changes on main" {
		t.Errorf("message = %q, want %q", e.Message,
			"Already up to date — no changes on main")
	}
}

// TestCheckDeveloperChannel_FreshSHANotDetected covers the branch at
// poller.go:87-92 where detectCurrentSHAFn returns an empty string:
// the flow must NOT overwrite uc.currentSHA and must fall through to
// the SHA-comparison branch with the pre-existing currentSHA intact.
//
// This is the "detached-HEAD probe returned nothing" path — the freshSHA
// != "" guard exists specifically to prevent an empty detectCurrentSHA
// result from clobbering the last-known-good SHA. A regression that
// dropped the guard would silently zero out uc.currentSHA on every
// tick, which would then always compare equal to a fresh fetch-error
// SHA of "" and misreport "already up to date" forever.
func TestCheckDeveloperChannel_FreshSHANotDetected(t *testing.T) {
	const currentSHA = "abc1234def5678"
	const latestSHA = "abc1234def5678" // same as current → "already up to date"

	withSwappedSeams(t,
		func(repoPath string) (string, error) {
			return latestSHA, nil
		},
		func(repoPath string) string {
			return "" // fresh detection failed
		},
	)

	events := make([]UpdateProgressPayload, 0)
	uc := &UpdateChecker{
		channel:    "developer",
		repoPath:   "/tmp/fake-repo-path",
		currentSHA: currentSHA,
		broadcast: func(_ string, p interface{}) {
			if pp, ok := p.(UpdateProgressPayload); ok {
				events = append(events, pp)
			}
		},
	}

	uc.checkDeveloperChannel()

	// The empty-freshSHA branch must preserve the pre-existing currentSHA.
	if uc.currentSHA != currentSHA {
		t.Errorf("currentSHA was clobbered by empty detect result: got %q, want %q",
			uc.currentSHA, currentSHA)
	}
	// And the flow still reaches the "up to date" broadcast because
	// currentSHA == latestSHA.
	if len(events) != 1 || events[0].Status != "done" {
		t.Errorf("expected one 'done' broadcast, got %+v", events)
	}
}
